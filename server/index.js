import express from 'express';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import dotenv from 'dotenv';
import {
  initDatabase,
  query,
  queryAll,
  queryOne,
  withTransaction,
  verifyDatabaseConnection,
} from './db.js';
import {
  signUserToken,
  setAuthCookie,
  clearAuthCookie,
  requireAuth,
  requireRole,
  USER_PUBLIC_COLUMNS,
  formatUserRecord,
} from './auth.js';
import {
  sendInvitationEmail,
  sendNewBugNotificationEmail,
  sendBugStatusChangedEmail,
  sendBugCommentNotificationEmail,
  sendBugAssignedEmail,
  verifySmtpConnection,
} from './mailer.js';
import {
  ensureMinioBucket,
  verifyMinioConnection,
  uploadFileToMinio,
  deleteObjectFromMinio,
  streamMinioObject,
  minioConfig,
} from './storage.js';
import {
  verifyGitHubConnection,
  listAccessibleRepos,
  createGitHubIssueForBug,
  pushBugStatusToGitHub,
  applyGitHubIssueSyncToDb,
  syncSingleBugFromGitHub,
  syncProjectIssuesFromGitHub,
  tryEnsureRepoWebhook,
  verifyGitHubWebhookSignature,
  startGitHubSyncPoller,
} from './github.js';
import {
  getConfiguredAiModels,
  getAiEndpointInfo,
  runAgenticBugAnalysis,
} from './aiAgent.js';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);

// Express 4 async wrapper so rejected promises in route handlers reach error middleware
const asyncRoute = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

app.set('trust proxy', 1);

app.get(
  '/api/health',
  asyncRoute(async (req, res) => {
    const dbInfo = await verifyDatabaseConnection();
    res.json({ status: 'ok', service: 'bugsted', db: dbInfo.database });
  })
);

const tempUploadsDir = path.join(os.tmpdir(), 'bugsted-tmp');
if (!fs.existsSync(tempUploadsDir)) {
  fs.mkdirSync(tempUploadsDir, { recursive: true });
}

app.use(
  express.json({
    limit: '5mb',
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(cookieParser());

// Protected media route streaming screenshots & recorded videos directly from MinIO
app.get(
  '/uploads/:folder/:filename',
  requireAuth,
  asyncRoute(async (req, res) => {
    const folder = String(req.params.folder || '').replace(/[^a-z0-9_-]/gi, '');
    const filename = String(req.params.filename || '').replace(/[^a-z0-9._-]/gi, '');

    if (!['screenshots', 'videos'].includes(folder) || !filename) {
      return res.status(400).json({ error: 'Nieprawidłowa ścieżka pliku.' });
    }

    const objectKey = `${folder}/${filename}`;
    return streamMinioObject(req, res, objectKey);
  })
);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempUploadsDir);
  },
  filename: (req, file, cb) => {
    const ext =
      path.extname(file.originalname || '').toLowerCase() ||
      (file.fieldname === 'video' ? '.webm' : '.png');
    const safeExt = ext.replace(/[^a-z0-9.]/g, '') || '.bin';
    const unique = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${safeExt}`;
    cb(null, unique);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 250 * 1024 * 1024,
    files: 11,
  },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'screenshots') {
      if (!file.mimetype.startsWith('image/')) {
        return cb(new Error('Zrzuty ekranu muszą być plikami graficznymi (PNG, JPG, WEBP, GIF).'));
      }
      return cb(null, true);
    }
    if (file.fieldname === 'video') {
      if (!file.mimetype.startsWith('video/')) {
        return cb(new Error('Załącznik wideo musi być plikiem wideo (np. WEBM, MP4).'));
      }
      return cb(null, true);
    }
    return cb(new Error('Nieznane pole pliku.'));
  },
});

function cleanupTempFiles(files = []) {
  for (const f of files) {
    try {
      if (f?.path && fs.existsSync(f.path)) {
        fs.unlinkSync(f.path);
      }
    } catch {}
  }
}

function getBaseUrl(req) {
  if (process.env.APP_URL) {
    return process.env.APP_URL.replace(/\/+$/, '');
  }
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.get('host') || `localhost:${PORT}`;
  return `${proto}://${host}`;
}

async function slugify(text) {
  const map = {
    ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z',
    Ą: 'a', Ć: 'c', Ę: 'e', Ł: 'l', Ń: 'n', Ó: 'o', Ś: 's', Ź: 'z', Ż: 'z',
  };
  const base =
    String(text)
      .split('')
      .map((ch) => map[ch] || ch)
      .join('')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'aplikacja';

  let slug = base;
  let counter = 2;
  while (await queryOne('SELECT id FROM projects WHERE slug = $1', [slug])) {
    slug = `${base}-${counter++}`;
  }
  return slug;
}

const STATUS_LABELS = {
  open: 'Otwarty',
  in_progress: 'W trakcie rozwiązywania',
  testing: 'Do weryfikacji',
  resolved: 'Rozwiązany',
  rejected: 'Odrzucony',
};

const VALID_STATUSES = Object.keys(STATUS_LABELS);
const VALID_ROLES = ['admin', 'dev', 'user'];
const VALID_PRIORITIES = ['low', 'medium', 'high', 'critical'];

// ================= GITHUB WEBHOOK ENDPOINT =================

app.post(
  '/api/webhooks/github',
  asyncRoute(async (req, res) => {
    const signature = req.headers['x-hub-signature-256'];
    if (signature && req.rawBody) {
      if (!verifyGitHubWebhookSignature(req.rawBody, signature)) {
        return res.status(401).json({ error: 'Nieprawidłowy podpis webhooka GitHub.' });
      }
    }

    const event = req.headers['x-github-event'];
    if (event === 'ping') {
      return res.json({ ok: true, message: 'pong' });
    }

    if (event === 'issues') {
      const action = req.body?.action;
      const issue = req.body?.issue;
      const repoFullName = req.body?.repository?.full_name;

      if (
        repoFullName &&
        issue &&
        ['closed', 'reopened', 'labeled', 'unlabeled', 'edited'].includes(action)
      ) {
        const result = await applyGitHubIssueSyncToDb(
          repoFullName,
          issue,
          getBaseUrl(req)
        );
        return res.json({ ok: true, ...result });
      }
    }

    return res.json({ ok: true, ignored: true });
  })
);

// ================= AUTH ROUTES =================

app.post(
  '/api/auth/login',
  asyncRoute(async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Podaj adres e-mail oraz hasło.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await queryOne(
      'SELECT * FROM users WHERE LOWER(email) = LOWER($1)',
      [normalizedEmail]
    );

    if (!user || !bcrypt.compareSync(String(password), user.password_hash)) {
      return res.status(401).json({ error: 'Nieprawidłowy adres e-mail lub hasło.' });
    }

    const token = signUserToken(user);
    setAuthCookie(res, token);

    return res.json({
      user: formatUserRecord(user),
    });
  })
);

app.post('/api/auth/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// Verify invitation token (public)
app.get(
  '/api/invitations/verify/:token',
  asyncRoute(async (req, res) => {
    const token = String(req.params.token || '').trim();
    const invite = await queryOne(
      `SELECT i.id, i.email, i.role, i.expires_at, i.accepted_at, u.name AS invited_by_name
       FROM invitations i
       LEFT JOIN users u ON u.id = i.invited_by
       WHERE i.token = $1`,
      [token]
    );

    if (!invite) {
      return res.status(404).json({ error: 'Zaproszenie jest nieprawidłowe lub zostało anulowane.' });
    }
    if (invite.accepted_at) {
      return res.status(400).json({ error: 'To zaproszenie zostało już wykorzystane. Możesz się zalogować.' });
    }
    if (new Date(invite.expires_at) < new Date()) {
      return res.status(400).json({ error: 'To zaproszenie wygasło. Poproś administratora o ponowne wysłanie zaproszenia.' });
    }

    const existingUser = await queryOne(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
      [invite.email]
    );
    if (existingUser) {
      return res.status(400).json({ error: 'Konto o tym adresie e-mail już istnieje. Zaloguj się.' });
    }

    res.json({
      invitation: {
        email: invite.email,
        role: invite.role,
        expires_at: invite.expires_at,
        invited_by_name: invite.invited_by_name || 'Administrator',
      },
    });
  })
);

// Register using invitation token
app.post(
  '/api/auth/register-invite',
  asyncRoute(async (req, res) => {
    const { token, name, password } = req.body || {};
    if (!token || !name || !password) {
      return res.status(400).json({ error: 'Wypełnij imię i nazwisko oraz hasło.' });
    }
    if (String(name).trim().length < 2) {
      return res.status(400).json({ error: 'Imię lub nazwa użytkownika musi mieć co najmniej 2 znaki.' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'Hasło musi mieć co najmniej 6 znaków.' });
    }

    const invite = await queryOne(
      'SELECT * FROM invitations WHERE token = $1',
      [String(token).trim()]
    );
    if (!invite) {
      return res.status(404).json({ error: 'Zaproszenie nie istnieje.' });
    }
    if (invite.accepted_at) {
      return res.status(400).json({ error: 'To zaproszenie zostało już wykorzystane.' });
    }
    if (new Date(invite.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Zaproszenie wygasło.' });
    }

    const existingUser = await queryOne(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
      [invite.email]
    );
    if (existingUser) {
      return res.status(400).json({ error: 'Użytkownik z tym adresem e-mail już istnieje.' });
    }

    const passwordHash = bcrypt.hashSync(String(password), 10);
    const isStaff = invite.role === 'admin' || invite.role === 'dev';

    const newUser = await withTransaction(async (tx) => {
      const created = await tx.queryOne(
        `INSERT INTO users (
           email, name, password_hash, role,
           notify_new_bug, notify_status_change, notify_comments, notify_assigned
         )
         VALUES ($1, $2, $3, $4, $5, 1, 1, $6)
         RETURNING ${USER_PUBLIC_COLUMNS}`,
        [
          invite.email.toLowerCase(),
          String(name).trim(),
          passwordHash,
          invite.role,
          isStaff ? 1 : 0,
          isStaff ? 1 : 0,
        ]
      );

      await tx.query(`UPDATE invitations SET accepted_at = NOW() WHERE id = $1`, [invite.id]);
      return created;
    });

    const jwtToken = signUserToken(newUser);
    setAuthCookie(res, jwtToken);

    return res.status(201).json({ user: formatUserRecord(newUser) });
  })
);

// ================= USER ACCOUNT & NOTIFICATION SETTINGS =================

app.get('/api/settings', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

app.put(
  '/api/settings/notifications',
  requireAuth,
  asyncRoute(async (req, res) => {
    const {
      notify_new_bug,
      notify_status_change,
      notify_comments,
      notify_assigned,
    } = req.body || {};

    const updated = await queryOne(
      `UPDATE users
       SET notify_new_bug = $1,
           notify_status_change = $2,
           notify_comments = $3,
           notify_assigned = $4
       WHERE id = $5
       RETURNING ${USER_PUBLIC_COLUMNS}`,
      [
        notify_new_bug ? 1 : 0,
        notify_status_change ? 1 : 0,
        notify_comments ? 1 : 0,
        notify_assigned ? 1 : 0,
        req.user.id,
      ]
    );

    res.json({ user: formatUserRecord(updated) });
  })
);

app.put(
  '/api/settings/language',
  requireAuth,
  asyncRoute(async (req, res) => {
    const { language = '' } = req.body || {};
    const valid = ['', 'pl', 'en', 'es', 'de', 'fr', 'ar', 'zh'];
    const clean = valid.includes(language) ? language : '';

    const updated = await queryOne(
      `UPDATE users SET language = $1 WHERE id = $2 RETURNING ${USER_PUBLIC_COLUMNS}`,
      [clean, req.user.id]
    );

    res.json({ user: formatUserRecord(updated) });
  })
);

app.put(
  '/api/settings/profile',
  requireAuth,
  asyncRoute(async (req, res) => {
    const { name, currentPassword, newPassword } = req.body || {};

    if (!name || String(name).trim().length < 2) {
      return res.status(400).json({ error: 'Imię lub nazwa wyświetlana musi mieć co najmniej 2 znaki.' });
    }

    const fullUser = await queryOne('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (!fullUser) {
      return res.status(404).json({ error: 'Konto nie istnieje.' });
    }

    let updated;
    if (newPassword) {
      if (!currentPassword || !bcrypt.compareSync(String(currentPassword), fullUser.password_hash)) {
        return res.status(400).json({ error: 'Aktualne hasło jest nieprawidłowe.' });
      }
      if (String(newPassword).length < 6) {
        return res.status(400).json({ error: 'Nowe hasło musi mieć co najmniej 6 znaków.' });
      }
      const newHash = bcrypt.hashSync(String(newPassword), 10);
      updated = await queryOne(
        `UPDATE users SET name = $1, password_hash = $2 WHERE id = $3 RETURNING ${USER_PUBLIC_COLUMNS}`,
        [String(name).trim(), newHash, req.user.id]
      );
    } else {
      updated = await queryOne(
        `UPDATE users SET name = $1 WHERE id = $2 RETURNING ${USER_PUBLIC_COLUMNS}`,
        [String(name).trim(), req.user.id]
      );
    }

    res.json({ user: formatUserRecord(updated) });
  })
);

// ================= ADMIN: USERS, INVITATIONS, SERVICES STATUS =================

app.get(
  '/api/admin/users',
  requireAuth,
  requireRole('admin'),
  asyncRoute(async (req, res) => {
    const rows = await queryAll(
      `SELECT u.id, u.email, u.name, u.role, u.created_at,
              u.notify_new_bug, u.notify_status_change, u.notify_comments, u.notify_assigned,
              (SELECT COUNT(*)::int FROM bugs b WHERE b.reported_by = u.id) AS reported_bugs_count
       FROM users u
       ORDER BY CASE u.role WHEN 'admin' THEN 1 WHEN 'dev' THEN 2 ELSE 3 END, u.created_at DESC`
    );

    const users = rows.map((u) => ({
      ...formatUserRecord(u),
      reported_bugs_count: u.reported_bugs_count || 0,
    }));

    res.json({ users });
  })
);

app.get(
  '/api/users/devs',
  requireAuth,
  asyncRoute(async (req, res) => {
    const devs = await queryAll(
      `SELECT id, name, email, role FROM users WHERE role IN ('dev', 'admin') ORDER BY name ASC`
    );
    res.json({ devs });
  })
);

app.patch(
  '/api/admin/users/:id/role',
  requireAuth,
  requireRole('admin'),
  asyncRoute(async (req, res) => {
    const userId = Number(req.params.id);
    const { role } = req.body || {};

    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Nieprawidłowa rola użytkownika.' });
    }

    const target = await queryOne('SELECT * FROM users WHERE id = $1', [userId]);
    if (!target) {
      return res.status(404).json({ error: 'Użytkownik nie istnieje.' });
    }

    if (target.role === 'admin' && role !== 'admin') {
      const { cnt } = await queryOne(
        `SELECT COUNT(*)::int AS cnt FROM users WHERE role = 'admin'`
      );
      if (cnt <= 1) {
        return res.status(400).json({
          error: 'Nie można zmienić roli ostatniemu Administratorowi w systemie.',
        });
      }
    }

    let updated;
    if (target.role === 'user' && (role === 'admin' || role === 'dev')) {
      updated = await queryOne(
        `UPDATE users SET role = $1, notify_new_bug = 1, notify_assigned = 1 WHERE id = $2 RETURNING ${USER_PUBLIC_COLUMNS}`,
        [role, userId]
      );
    } else {
      updated = await queryOne(
        `UPDATE users SET role = $1 WHERE id = $2 RETURNING ${USER_PUBLIC_COLUMNS}`,
        [role, userId]
      );
    }

    if (userId === req.user.id) {
      setAuthCookie(res, signUserToken(updated));
    }

    res.json({ user: formatUserRecord(updated) });
  })
);

app.delete(
  '/api/admin/users/:id',
  requireAuth,
  requireRole('admin'),
  asyncRoute(async (req, res) => {
    const userId = Number(req.params.id);
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Nie możesz usunąć własnego konta administratora.' });
    }
    await query('DELETE FROM users WHERE id = $1', [userId]);
    res.json({ ok: true });
  })
);

app.get(
  '/api/admin/invitations',
  requireAuth,
  requireRole('admin'),
  asyncRoute(async (req, res) => {
    const baseUrl = getBaseUrl(req);
    const rows = await queryAll(
      `SELECT i.*, u.name AS invited_by_name
       FROM invitations i
       LEFT JOIN users u ON u.id = i.invited_by
       ORDER BY i.created_at DESC`
    );

    const invitations = rows.map((row) => ({
      ...row,
      invite_url: `${baseUrl}/rejestracja/${row.token}`,
      is_expired: !row.accepted_at && new Date(row.expires_at) < new Date(),
    }));

    res.json({ invitations });
  })
);

app.post(
  '/api/admin/invitations',
  requireAuth,
  requireRole('admin'),
  asyncRoute(async (req, res) => {
    const { email, role } = req.body || {};
    if (!email || !String(email).includes('@')) {
      return res.status(400).json({ error: 'Podaj prawidłowy adres e-mail.' });
    }
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Wybierz prawidłową rolę (admin, dev lub user).' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existingUser = await queryOne(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
      [normalizedEmail]
    );
    if (existingUser) {
      return res.status(400).json({ error: 'Użytkownik z tym adresem e-mail jest już zarejestrowany w systemie.' });
    }

    await query(
      'DELETE FROM invitations WHERE LOWER(email) = LOWER($1) AND accepted_at IS NULL',
      [normalizedEmail]
    );

    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const inserted = await queryOne(
      `INSERT INTO invitations (email, role, token, invited_by, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [normalizedEmail, role, token, req.user.id, expiresAt]
    );

    const baseUrl = getBaseUrl(req);
    const inviteUrl = `${baseUrl}/rejestracja/${token}`;

    let emailSent = 0;
    let emailError = null;
    try {
      await sendInvitationEmail({
        to: normalizedEmail,
        role,
        inviteUrl,
        invitedByName: req.user.name,
      });
      emailSent = 1;
    } catch (err) {
      console.error('[SMTP] Błąd wysyłki zaproszenia:', err.message);
      emailError = err.message;
    }

    const created = await queryOne(
      'UPDATE invitations SET email_sent = $1, email_error = $2 WHERE id = $3 RETURNING *',
      [emailSent, emailError, inserted.id]
    );

    return res.status(201).json({
      invitation: {
        ...created,
        invite_url: inviteUrl,
        invited_by_name: req.user.name,
      },
      emailSent: Boolean(emailSent),
      emailError,
    });
  })
);

app.post(
  '/api/admin/invitations/:id/resend',
  requireAuth,
  requireRole('admin'),
  asyncRoute(async (req, res) => {
    const inviteId = Number(req.params.id);
    const invite = await queryOne('SELECT * FROM invitations WHERE id = $1', [inviteId]);
    if (!invite) {
      return res.status(404).json({ error: 'Zaproszenie nie istnieje.' });
    }
    if (invite.accepted_at) {
      return res.status(400).json({ error: 'To zaproszenie zostało już zaakceptowane.' });
    }

    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const baseUrl = getBaseUrl(req);
    const inviteUrl = `${baseUrl}/rejestracja/${invite.token}`;

    let emailSent = 0;
    let emailError = null;
    try {
      await sendInvitationEmail({
        to: invite.email,
        role: invite.role,
        inviteUrl,
        invitedByName: req.user.name,
      });
      emailSent = 1;
    } catch (err) {
      console.error('[SMTP] Błąd ponownej wysyłki zaproszenia:', err.message);
      emailError = err.message;
    }

    await query(
      'UPDATE invitations SET expires_at = $1, email_sent = $2, email_error = $3 WHERE id = $4',
      [newExpiresAt, emailSent, emailError, inviteId]
    );

    res.json({
      ok: true,
      emailSent: Boolean(emailSent),
      emailError,
      invite_url: inviteUrl,
    });
  })
);

app.delete(
  '/api/admin/invitations/:id',
  requireAuth,
  requireRole('admin'),
  asyncRoute(async (req, res) => {
    await query('DELETE FROM invitations WHERE id = $1', [Number(req.params.id)]);
    res.json({ ok: true });
  })
);

app.get(
  '/api/admin/smtp-status',
  requireAuth,
  requireRole('admin'),
  asyncRoute(async (req, res) => {
    try {
      await verifySmtpConnection();
      res.json({
        connected: true,
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        user: process.env.SMTP_USER,
      });
    } catch (err) {
      res.json({
        connected: false,
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        user: process.env.SMTP_USER,
        error: err.message,
      });
    }
  })
);

app.get(
  '/api/admin/minio-status',
  requireAuth,
  requireRole('admin'),
  asyncRoute(async (req, res) => {
    try {
      const info = await verifyMinioConnection();
      res.json(info);
    } catch (err) {
      res.json({
        connected: false,
        endPoint: minioConfig.endPoint,
        bucket: minioConfig.bucket,
        error: err.message,
      });
    }
  })
);

app.get(
  '/api/admin/github-status',
  requireAuth,
  requireRole('admin'),
  asyncRoute(async (req, res) => {
    try {
      const info = await verifyGitHubConnection();
      res.json(info);
    } catch (err) {
      res.json({
        connected: false,
        error: err.message,
      });
    }
  })
);

app.get(
  '/api/admin/github/repos',
  requireAuth,
  requireRole('admin'),
  asyncRoute(async (req, res) => {
    try {
      const repos = await listAccessibleRepos({
        forceRefresh: req.query.refresh === '1',
      });
      res.json({ repos });
    } catch (err) {
      res.status(502).json({ error: 'Nie udało się pobrać listy repozytoriów z GitHub: ' + err.message });
    }
  })
);

// ================= PROJECTS / APPLICATIONS =================

app.get(
  '/api/projects',
  requireAuth,
  asyncRoute(async (req, res) => {
    const projects = await queryAll(
      `SELECT p.*,
              u.name AS created_by_name,
              (SELECT COUNT(*)::int FROM bugs b WHERE b.project_id = p.id) AS total_bugs,
              (SELECT COUNT(*)::int FROM bugs b WHERE b.project_id = p.id AND b.status = 'open') AS open_bugs,
              (SELECT COUNT(*)::int FROM bugs b WHERE b.project_id = p.id AND b.status = 'in_progress') AS in_progress_bugs,
              (SELECT COUNT(*)::int FROM bugs b WHERE b.project_id = p.id AND b.status = 'testing') AS testing_bugs,
              (SELECT COUNT(*)::int FROM bugs b WHERE b.project_id = p.id AND b.status = 'resolved') AS resolved_bugs,
              (SELECT COUNT(*)::int FROM bugs b WHERE b.project_id = p.id AND b.status = 'rejected') AS rejected_bugs
       FROM projects p
       LEFT JOIN users u ON u.id = p.created_by
       ORDER BY p.created_at DESC`
    );

    res.json({ projects });
  })
);

app.get(
  '/api/projects/:id',
  requireAuth,
  asyncRoute(async (req, res) => {
    const projectId = Number(req.params.id);
    const project = await queryOne(
      `SELECT p.*,
              u.name AS created_by_name,
              (SELECT COUNT(*)::int FROM bugs b WHERE b.project_id = p.id) AS total_bugs,
              (SELECT COUNT(*)::int FROM bugs b WHERE b.project_id = p.id AND b.status = 'open') AS open_bugs,
              (SELECT COUNT(*)::int FROM bugs b WHERE b.project_id = p.id AND b.status = 'in_progress') AS in_progress_bugs,
              (SELECT COUNT(*)::int FROM bugs b WHERE b.project_id = p.id AND b.status = 'testing') AS testing_bugs,
              (SELECT COUNT(*)::int FROM bugs b WHERE b.project_id = p.id AND b.status = 'resolved') AS resolved_bugs,
              (SELECT COUNT(*)::int FROM bugs b WHERE b.project_id = p.id AND b.status = 'rejected') AS rejected_bugs
       FROM projects p
       LEFT JOIN users u ON u.id = p.created_by
       WHERE p.id = $1`,
      [projectId]
    );

    if (!project) {
      return res.status(404).json({ error: 'Aplikacja nie została znaleziona.' });
    }

    res.json({ project });
  })
);

app.post(
  '/api/projects',
  requireAuth,
  requireRole('admin'),
  asyncRoute(async (req, res) => {
    const {
      name,
      description = '',
      url = '',
      color = '#10b981',
      github_sync_enabled = false,
      github_repo = '',
    } = req.body || {};

    if (!name || String(name).trim().length < 2) {
      return res.status(400).json({ error: 'Nazwa aplikacji musi mieć co najmniej 2 znaki.' });
    }

    const syncEnabled = github_sync_enabled ? 1 : 0;
    const cleanRepo = String(github_repo || '')
      .trim()
      .replace(/^https?:\/\/github\.com\//i, '')
      .replace(/\/+$/, '');

    if (syncEnabled && !/^[^/\s]+\/[^/\s]+$/.test(cleanRepo)) {
      return res.status(400).json({
        error: 'Wybierz prawidłowe repozytorium GitHub (format właściciel/repozytorium).',
      });
    }
    if (!syncEnabled && cleanRepo && !/^[^/\s]+\/[^/\s]+$/.test(cleanRepo)) {
      return res.status(400).json({
        error: 'Nieprawidłowy format repozytorium GitHub (użyj właściciel/repozytorium).',
      });
    }

    const slug = await slugify(name);
    const project = await queryOne(
      `INSERT INTO projects (
         name, slug, description, url, color,
         github_repo, github_sync_enabled, created_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        String(name).trim(),
        slug,
        String(description || '').trim(),
        String(url || '').trim(),
        String(color || '#10b981').trim(),
        cleanRepo,
        syncEnabled,
        req.user.id,
      ]
    );

    if (syncEnabled && cleanRepo) {
      tryEnsureRepoWebhook(cleanRepo, getBaseUrl(req))
        .then((hookId) => {
          if (hookId) {
            query('UPDATE projects SET github_webhook_id = $1 WHERE id = $2', [hookId, project.id]).catch(() => {});
          }
        })
        .catch(() => {});
    }

    res.status(201).json({
      project: {
        ...project,
        total_bugs: 0,
        open_bugs: 0,
        in_progress_bugs: 0,
        testing_bugs: 0,
        resolved_bugs: 0,
        rejected_bugs: 0,
      },
    });
  })
);

app.put(
  '/api/projects/:id',
  requireAuth,
  requireRole('admin'),
  asyncRoute(async (req, res) => {
    const projectId = Number(req.params.id);
    const existing = await queryOne('SELECT * FROM projects WHERE id = $1', [projectId]);
    if (!existing) {
      return res.status(404).json({ error: 'Aplikacja nie istnieje.' });
    }

    const {
      name,
      description,
      url,
      color,
      github_sync_enabled,
      github_repo,
    } = req.body || {};

    if (!name || String(name).trim().length < 2) {
      return res.status(400).json({ error: 'Nazwa aplikacji musi mieć co najmniej 2 znaki.' });
    }

    const syncEnabled =
      github_sync_enabled !== undefined ? (github_sync_enabled ? 1 : 0) : existing.github_sync_enabled;
    const cleanRepo =
      github_repo !== undefined
        ? String(github_repo || '')
            .trim()
            .replace(/^https?:\/\/github\.com\//i, '')
            .replace(/\/+$/, '')
        : existing.github_repo;

    if (syncEnabled && !/^[^/\s]+\/[^/\s]+$/.test(cleanRepo)) {
      return res.status(400).json({
        error: 'Wybierz prawidłowe repozytorium GitHub (format właściciel/repozytorium).',
      });
    }
    if (!syncEnabled && cleanRepo && !/^[^/\s]+\/[^/\s]+$/.test(cleanRepo)) {
      return res.status(400).json({
        error: 'Nieprawidłowy format repozytorium GitHub (użyj właściciel/repozytorium).',
      });
    }

    const updated = await queryOne(
      `UPDATE projects
       SET name = $1, description = $2, url = $3, color = $4,
           github_repo = $5, github_sync_enabled = $6
       WHERE id = $7
       RETURNING *`,
      [
        String(name).trim(),
        String(description ?? existing.description).trim(),
        String(url ?? existing.url).trim(),
        String(color ?? existing.color).trim(),
        cleanRepo,
        syncEnabled,
        projectId,
      ]
    );

    if (syncEnabled && cleanRepo) {
      tryEnsureRepoWebhook(cleanRepo, getBaseUrl(req))
        .then((hookId) => {
          if (hookId) {
            query('UPDATE projects SET github_webhook_id = $1 WHERE id = $2', [hookId, projectId]).catch(() => {});
          }
        })
        .catch(() => {});
    }

    res.json({ project: updated });
  })
);

app.post(
  '/api/projects/:id/github-sync',
  requireAuth,
  asyncRoute(async (req, res) => {
    const projectId = Number(req.params.id);
    try {
      const result = await syncProjectIssuesFromGitHub(projectId, getBaseUrl(req));
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(502).json({ error: 'Błąd synchronizacji z GitHub: ' + err.message });
    }
  })
);

app.delete(
  '/api/projects/:id',
  requireAuth,
  requireRole('admin'),
  asyncRoute(async (req, res) => {
    const projectId = Number(req.params.id);
    const existing = await queryOne('SELECT id FROM projects WHERE id = $1', [projectId]);
    if (!existing) {
      return res.status(404).json({ error: 'Aplikacja nie istnieje.' });
    }

    const pathsToDelete = [];
    const bugs = await queryAll('SELECT id, video_path FROM bugs WHERE project_id = $1', [projectId]);
    for (const b of bugs) {
      if (b.video_path) pathsToDelete.push(b.video_path);
      const shots = await queryAll('SELECT file_path FROM bug_screenshots WHERE bug_id = $1', [b.id]);
      for (const s of shots) {
        if (s.file_path) pathsToDelete.push(s.file_path);
      }
    }

    await query('DELETE FROM projects WHERE id = $1', [projectId]);
    await Promise.allSettled(pathsToDelete.map((p) => deleteObjectFromMinio(p)));

    res.json({ ok: true });
  })
);

// ================= BUGS ROUTES =================

app.get(
  '/api/bugs',
  requireAuth,
  asyncRoute(async (req, res) => {
    const { projectId, status, priority, search } = req.query;
    const conditions = [];
    const params = [];

    if (projectId) {
      params.push(Number(projectId));
      conditions.push(`b.project_id = $${params.length}`);
    }
    if (status && VALID_STATUSES.includes(status)) {
      params.push(status);
      conditions.push(`b.status = $${params.length}`);
    }
    if (priority && VALID_PRIORITIES.includes(priority)) {
      params.push(priority);
      conditions.push(`b.priority = $${params.length}`);
    }
    if (search && String(search).trim()) {
      const q = `%${String(search).trim()}%`;
      params.push(q);
      const pIdx = params.length;
      conditions.push(`(b.title ILIKE $${pIdx} OR b.description ILIKE $${pIdx})`);
    }

    const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const bugs = await queryAll(
      `SELECT b.*,
              p.name AS project_name,
              p.color AS project_color,
              p.slug AS project_slug,
              p.github_repo AS project_github_repo,
              p.github_sync_enabled AS project_github_sync_enabled,
              reporter.name AS reporter_name,
              reporter.email AS reporter_email,
              assignee.name AS assignee_name,
              assignee.email AS assignee_email,
              (SELECT COUNT(*)::int FROM bug_screenshots bs WHERE bs.bug_id = b.id) AS screenshots_count,
              (SELECT COUNT(*)::int FROM bug_comments bc WHERE bc.bug_id = b.id) AS comments_count
       FROM bugs b
       JOIN projects p ON p.id = b.project_id
       LEFT JOIN users reporter ON reporter.id = b.reported_by
       LEFT JOIN users assignee ON assignee.id = b.assigned_to
       ${whereSql}
       ORDER BY b.created_at DESC`,
      params
    );

    res.json({ bugs });
  })
);

async function getEnrichedBugById(bugId) {
  return queryOne(
    `SELECT b.*,
            p.name AS project_name,
            p.color AS project_color,
            p.url AS project_url,
            p.github_repo AS project_github_repo,
            p.github_sync_enabled AS project_github_sync_enabled,
            reporter.name AS reporter_name,
            reporter.email AS reporter_email,
            reporter.role AS reporter_role,
            assignee.name AS assignee_name,
            assignee.email AS assignee_email
     FROM bugs b
     JOIN projects p ON p.id = b.project_id
     LEFT JOIN users reporter ON reporter.id = b.reported_by
     LEFT JOIN users assignee ON assignee.id = b.assigned_to
     WHERE b.id = $1`,
    [bugId]
  );
}

app.get(
  '/api/bugs/:id',
  requireAuth,
  asyncRoute(async (req, res) => {
    const bugId = Number(req.params.id);
    const bug = await getEnrichedBugById(bugId);

    if (!bug) {
      return res.status(404).json({ error: 'Zgłoszenie błędu nie zostało znalezione.' });
    }

    const screenshots = await queryAll(
      'SELECT * FROM bug_screenshots WHERE bug_id = $1 ORDER BY sort_order ASC, id ASC',
      [bugId]
    );

    const comments = await queryAll(
      `SELECT c.*, u.name AS user_name, u.role AS user_role
       FROM bug_comments c
       LEFT JOIN users u ON u.id = c.user_id
       WHERE c.bug_id = $1
       ORDER BY c.created_at ASC, c.id ASC`,
      [bugId]
    );

    res.json({ bug, screenshots, comments });
  })
);

// Create bug report -> uploads media to MinIO, saves in PostgreSQL, creates GitHub Issue, & emails subscribers
app.post(
  '/api/bugs',
  requireAuth,
  (req, res, next) => {
    const handler = upload.fields([
      { name: 'screenshots', maxCount: 10 },
      { name: 'video', maxCount: 1 },
    ]);
    handler(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_UNEXPECTED_FILE' || err.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
              error: 'Możesz załączyć maksymalnie 10 zrzutów ekranu oraz 1 nagranie wideo.',
            });
          }
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'Przekroczono maksymalny rozmiar pliku (250 MB).' });
          }
        }
        return res.status(400).json({ error: err.message || 'Błąd przesyłania plików.' });
      }
      next();
    });
  },
  asyncRoute(async (req, res) => {
    const uploadedScreenshots = req.files?.screenshots || [];
    const uploadedVideos = req.files?.video || [];
    const allTempFiles = [...uploadedScreenshots, ...uploadedVideos];

    const { project_id, title, description = '', priority = 'medium' } = req.body || {};
    const projectIdNum = Number(project_id);

    if (!projectIdNum) {
      cleanupTempFiles(allTempFiles);
      return res.status(400).json({ error: 'Wybierz aplikację, której dotyczy błąd.' });
    }

    const project = await queryOne('SELECT * FROM projects WHERE id = $1', [projectIdNum]);
    if (!project) {
      cleanupTempFiles(allTempFiles);
      return res.status(404).json({ error: 'Wybrana aplikacja nie istnieje.' });
    }

    if (!title || String(title).trim().length < 3) {
      cleanupTempFiles(allTempFiles);
      return res.status(400).json({ error: 'Nazwa błędu musi mieć co najmniej 3 znaki.' });
    }

    if (uploadedScreenshots.length > 10) {
      cleanupTempFiles(allTempFiles);
      return res.status(400).json({ error: 'Możesz dołączyć maksymalnie 10 zrzutów ekranu.' });
    }

    const validPriority = VALID_PRIORITIES.includes(priority) ? priority : 'medium';
    const videoFile = uploadedVideos[0] || null;

    const uploadedMinioPaths = [];
    let videoStoredPath = null;
    const screenshotStoredPaths = [];

    try {
      for (const shot of uploadedScreenshots) {
        const result = await uploadFileToMinio({
          localPath: shot.path,
          folder: 'screenshots',
          filename: shot.filename,
          mimeType: shot.mimetype,
        });
        uploadedMinioPaths.push(result.storedPath);
        screenshotStoredPaths.push(result.storedPath);
      }

      if (videoFile) {
        const vidResult = await uploadFileToMinio({
          localPath: videoFile.path,
          folder: 'videos',
          filename: videoFile.filename,
          mimeType: videoFile.mimetype,
        });
        uploadedMinioPaths.push(vidResult.storedPath);
        videoStoredPath = vidResult.storedPath;
      }
    } catch (minioErr) {
      cleanupTempFiles(allTempFiles);
      await Promise.allSettled(uploadedMinioPaths.map((p) => deleteObjectFromMinio(p)));
      console.error('[MinIO] Błąd wysyłania załączników:', minioErr);
      return res.status(502).json({
        error: 'Nie udało się zapisać plików w magazynie MinIO: ' + minioErr.message,
      });
    } finally {
      cleanupTempFiles(allTempFiles);
    }

    let createdBug;
    try {
      createdBug = await withTransaction(async (tx) => {
        const bugRow = await tx.queryOne(
          `INSERT INTO bugs (
             project_id, title, description, priority, status,
             video_path, video_original_name, video_mime, video_size,
             reported_by, updated_by
           )
           VALUES ($1, $2, $3, $4, 'open', $5, $6, $7, $8, $9, $10)
           RETURNING *`,
          [
            projectIdNum,
            String(title).trim(),
            String(description || '').trim(),
            validPriority,
            videoStoredPath,
            videoFile ? videoFile.originalname : null,
            videoFile ? videoFile.mimetype : null,
            videoFile ? videoFile.size : null,
            req.user.id,
            req.user.id,
          ]
        );

        for (let index = 0; index < uploadedScreenshots.length; index++) {
          const shot = uploadedScreenshots[index];
          await tx.query(
            `INSERT INTO bug_screenshots (bug_id, file_path, original_name, mime_type, file_size, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              bugRow.id,
              screenshotStoredPaths[index],
              shot.originalname || `zrzut-${index + 1}.png`,
              shot.mimetype,
              shot.size,
              index,
            ]
          );
        }

        return bugRow;
      });
    } catch (err) {
      await Promise.allSettled(uploadedMinioPaths.map((p) => deleteObjectFromMinio(p)));
      return res.status(500).json({ error: 'Nie udało się zapisać zgłoszenia: ' + err.message });
    }

    const bugId = createdBug.id;
    const baseUrl = getBaseUrl(req);
    const bugUrl = `${baseUrl}/bledy/${bugId}`;
    const settingsUrl = `${baseUrl}/ustawienia`;
    const reporterDisplay = `${req.user.name} (${req.user.email})`;

    // Create linked GitHub Issue automatically if project has GitHub integration enabled
    let githubError = null;
    if (project.github_sync_enabled === 1 && project.github_repo) {
      try {
        const ghIssue = await createGitHubIssueForBug({
          repoFullName: project.github_repo,
          bug: createdBug,
          project,
          reporterName: reporterDisplay,
          screenshotsCount: uploadedScreenshots.length,
          hasVideo: Boolean(videoFile),
          bugUrl,
        });

        createdBug = await queryOne(
          `UPDATE bugs
           SET github_issue_number = $1, github_issue_url = $2, github_synced_at = NOW()
           WHERE id = $3
           RETURNING *`,
          [ghIssue.number, ghIssue.html_url, bugId]
        );
      } catch (ghErr) {
        console.error('[GitHub] Nie udało się utworzyć Issue dla błędu #' + bugId + ':', ghErr.message);
        githubError = ghErr.message;
      }
    }

    // Notify all users who have notify_new_bug = 1
    const subscriberRows = await queryAll(
      `SELECT email FROM users WHERE notify_new_bug = 1`
    );
    const recipientEmails = subscriberRows.map((r) => r.email).filter(Boolean);

    if (recipientEmails.length > 0) {
      sendNewBugNotificationEmail({
        recipientEmails,
        bug: createdBug,
        project,
        reporterName: reporterDisplay,
        screenshotsCount: uploadedScreenshots.length,
        hasVideo: Boolean(videoFile),
        bugUrl,
        settingsUrl,
      }).catch((err) => {
        console.error('[SMTP] Nie udało się wysłać powiadomienia o nowym błędzie:', err.message);
      });
    }

    return res.status(201).json({
      bug: createdBug,
      notifiedRecipientsCount: recipientEmails.length,
      githubError,
    });
  })
);

// Export an existing bug to GitHub Issues
app.post(
  '/api/bugs/:id/github-export',
  requireAuth,
  requireRole('admin', 'dev'),
  asyncRoute(async (req, res) => {
    const bugId = Number(req.params.id);
    const bug = await queryOne('SELECT * FROM bugs WHERE id = $1', [bugId]);
    if (!bug) {
      return res.status(404).json({ error: 'Zgłoszenie nie istnieje.' });
    }
    if (bug.github_issue_number) {
      return res.status(400).json({ error: 'To zgłoszenie jest już połączone z GitHub Issue.' });
    }

    const project = await queryOne('SELECT * FROM projects WHERE id = $1', [bug.project_id]);
    if (!project || !project.github_sync_enabled || !project.github_repo) {
      return res.status(400).json({ error: 'Integracja z GitHub Issues nie jest włączona dla tej aplikacji.' });
    }

    const reporter = bug.reported_by
      ? await queryOne('SELECT name, email FROM users WHERE id = $1', [bug.reported_by])
      : null;
    const countRow = await queryOne(
      'SELECT COUNT(*)::int AS cnt FROM bug_screenshots WHERE bug_id = $1',
      [bugId]
    );

    try {
      const baseUrl = getBaseUrl(req);
      const ghIssue = await createGitHubIssueForBug({
        repoFullName: project.github_repo,
        bug,
        project,
        reporterName: reporter ? `${reporter.name} (${reporter.email})` : 'Użytkownik',
        screenshotsCount: countRow?.cnt || 0,
        hasVideo: Boolean(bug.video_path),
        bugUrl: `${baseUrl}/bledy/${bugId}`,
      });

      const updated = await queryOne(
        `UPDATE bugs
         SET github_issue_number = $1, github_issue_url = $2, github_synced_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [ghIssue.number, ghIssue.html_url, bugId]
      );

      res.json({ bug: updated });
    } catch (err) {
      res.status(502).json({ error: 'Błąd tworzenia Issue na GitHubie: ' + err.message });
    }
  })
);

// Trigger on-demand GitHub -> App sync for a single bug
app.post(
  '/api/bugs/:id/github-sync',
  requireAuth,
  asyncRoute(async (req, res) => {
    const bugId = Number(req.params.id);
    try {
      const result = await syncSingleBugFromGitHub(bugId, getBaseUrl(req));
      const bug = await getEnrichedBugById(bugId);
      res.json({ ok: true, ...result, bug });
    } catch (err) {
      res.status(502).json({ error: 'Błąd synchronizacji Issue z GitHub: ' + err.message });
    }
  })
);

// List available Chat Completions AI models configured in .env
app.get('/api/ai/models', requireAuth, (req, res) => {
  res.json(getAiEndpointInfo());
});

// Run Agentic AI Analysis on reported bug & linked GitHub repository (supports live SSE streaming)
app.post(
  '/api/bugs/:id/ai-analyze',
  requireAuth,
  asyncRoute(async (req, res) => {
    const bugId = Number(req.params.id);
    const { model, language } = req.body || {};
    const targetLanguage = language || req.user?.language || 'en';
    const useStream =
      req.query.stream === '1' ||
      String(req.headers.accept || '').includes('text/event-stream');

    const bug = await queryOne('SELECT * FROM bugs WHERE id = $1', [bugId]);
    if (!bug) {
      return res.status(404).json({ error: 'Zgłoszenie nie istnieje.' });
    }

    const project = await queryOne('SELECT * FROM projects WHERE id = $1', [bug.project_id]);
    if (!project) {
      return res.status(404).json({ error: 'Aplikacja nie istnieje.' });
    }

    const screenshots = await queryAll(
      'SELECT * FROM bug_screenshots WHERE bug_id = $1 ORDER BY sort_order ASC, id ASC',
      [bugId]
    );

    const comments = await queryAll(
      `SELECT c.*, u.name AS user_name
       FROM bug_comments c
       LEFT JOIN users u ON u.id = c.user_id
       WHERE c.bug_id = $1
       ORDER BY c.created_at ASC`,
      [bugId]
    );

    if (useStream) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      const sendEvent = (payload) => {
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify(payload)}\n\n`);
        }
      };

      try {
        const result = await runAgenticBugAnalysis({
          bug,
          project,
          comments,
          screenshots,
          model,
          language: targetLanguage,
          onStep: (message) => sendEvent({ type: 'step', message }),
        });

        await query(
          `UPDATE bugs
           SET ai_suggestion = $1,
               ai_model = $2,
               ai_analyzed_files = $3,
               ai_generated_at = NOW()
           WHERE id = $4`,
          [
            result.suggestion,
            result.model,
            JSON.stringify(result.analyzedFiles || []),
            bugId,
          ]
        );

        const updatedBug = await getEnrichedBugById(bugId);
        sendEvent({ type: 'done', bug: updatedBug });
      } catch (err) {
        console.error('[AI Agent] Błąd analizy zgłoszenia #' + bugId + ':', err.message);
        sendEvent({
          type: 'error',
          error: err.message || 'Nie udało się wygenerować sugestii AI.',
        });
      } finally {
        if (!res.writableEnded) res.end();
      }
      return;
    }

    try {
      const result = await runAgenticBugAnalysis({
        bug,
        project,
        comments,
        screenshots,
        model,
        language: targetLanguage,
      });

      await query(
        `UPDATE bugs
         SET ai_suggestion = $1,
             ai_model = $2,
             ai_analyzed_files = $3,
             ai_generated_at = NOW()
         WHERE id = $4`,
        [
          result.suggestion,
          result.model,
          JSON.stringify(result.analyzedFiles || []),
          bugId,
        ]
      );

      const updatedBug = await getEnrichedBugById(bugId);
      res.json({ bug: updatedBug });
    } catch (err) {
      res.status(502).json({ error: err.message || 'Nie udało się wygenerować sugestii AI.' });
    }
  })
);

// Update bug status (dev and admin) -> syncs status to GitHub Issue & emails reporter
app.patch(
  '/api/bugs/:id/status',
  requireAuth,
  requireRole('admin', 'dev'),
  asyncRoute(async (req, res) => {
    const bugId = Number(req.params.id);
    const { status, comment = '' } = req.body || {};

    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Nieprawidłowy status zgłoszenia.' });
    }

    const existing = await queryOne('SELECT * FROM bugs WHERE id = $1', [bugId]);
    if (!existing) {
      return res.status(404).json({ error: 'Zgłoszenie nie istnieje.' });
    }

    const statusChanged = existing.status !== status;
    const trimmedComment = String(comment || '').trim();

    await withTransaction(async (tx) => {
      await tx.query(
        `UPDATE bugs
         SET status = $1, updated_by = $2, updated_at = NOW()
         WHERE id = $3`,
        [status, req.user.id, bugId]
      );

      if (statusChanged || trimmedComment) {
        const msg =
          trimmedComment ||
          `Zmieniono status zgłoszenia z „${STATUS_LABELS[existing.status]}” na „${STATUS_LABELS[status]}”.`;

        await tx.query(
          `INSERT INTO bug_comments (bug_id, user_id, type, content, old_status, new_status)
           VALUES ($1, $2, 'status_change', $3, $4, $5)`,
          [bugId, req.user.id, msg, existing.status, status]
        );
      }
    });

    const project = await queryOne('SELECT * FROM projects WHERE id = $1', [existing.project_id]);

    if (
      statusChanged &&
      project?.github_sync_enabled === 1 &&
      project.github_repo &&
      existing.github_issue_number
    ) {
      try {
        await pushBugStatusToGitHub({
          repoFullName: project.github_repo,
          issueNumber: existing.github_issue_number,
          newStatus: status,
          comment: trimmedComment,
          changedByName: `${req.user.name} (${req.user.email})`,
        });
        await query(`UPDATE bugs SET github_synced_at = NOW() WHERE id = $1`, [bugId]);
      } catch (ghErr) {
        console.error('[GitHub] Błąd aktualizacji statusu Issue:', ghErr.message);
      }
    }

    const updated = await queryOne('SELECT * FROM bugs WHERE id = $1', [bugId]);

    if (statusChanged && existing.reported_by && project) {
      const reporter = await queryOne(
        'SELECT id, email, name, notify_status_change FROM users WHERE id = $1',
        [existing.reported_by]
      );

      if (reporter && reporter.email && reporter.notify_status_change === 1) {
        const baseUrl = getBaseUrl(req);
        sendBugStatusChangedEmail({
          to: reporter.email,
          bug: updated,
          project,
          oldStatus: existing.status,
          newStatus: status,
          changedByName: `${req.user.name} (${req.user.email})`,
          comment: trimmedComment,
          bugUrl: `${baseUrl}/bledy/${bugId}`,
          settingsUrl: `${baseUrl}/ustawienia`,
        }).catch((err) => {
          console.error('[SMTP] Nie udało się wysłać powiadomienia o zmianie statusu:', err.message);
        });
      }
    }

    res.json({ bug: updated });
  })
);

// Assign developer to bug
app.patch(
  '/api/bugs/:id/assign',
  requireAuth,
  requireRole('admin', 'dev'),
  asyncRoute(async (req, res) => {
    const bugId = Number(req.params.id);
    const { assigned_to } = req.body || {};

    const existing = await queryOne('SELECT * FROM bugs WHERE id = $1', [bugId]);
    if (!existing) {
      return res.status(404).json({ error: 'Zgłoszenie nie istnieje.' });
    }

    const assigneeId = assigned_to ? Number(assigned_to) : null;
    let assignee = null;
    if (assigneeId) {
      assignee = await queryOne(
        `SELECT id, email, name, notify_assigned FROM users WHERE id = $1 AND role IN ('dev', 'admin')`,
        [assigneeId]
      );
      if (!assignee) {
        return res.status(400).json({ error: 'Wybrany użytkownik nie jest programistą ani administratorem.' });
      }
    }

    const updated = await queryOne(
      `UPDATE bugs SET assigned_to = $1, updated_by = $2, updated_at = NOW() WHERE id = $3 RETURNING *`,
      [assigneeId, req.user.id, bugId]
    );

    if (
      assignee &&
      assignee.id !== existing.assigned_to &&
      assignee.id !== req.user.id &&
      assignee.notify_assigned === 1
    ) {
      const project = await queryOne('SELECT * FROM projects WHERE id = $1', [existing.project_id]);
      if (project) {
        const baseUrl = getBaseUrl(req);
        sendBugAssignedEmail({
          to: assignee.email,
          bug: updated,
          project,
          assignedByName: `${req.user.name} (${req.user.email})`,
          bugUrl: `${baseUrl}/bledy/${bugId}`,
          settingsUrl: `${baseUrl}/ustawienia`,
        }).catch((err) => {
          console.error('[SMTP] Nie udało się wysłać powiadomienia o przypisaniu:', err.message);
        });
      }
    }

    res.json({ bug: updated });
  })
);

// Add comment to bug
app.post(
  '/api/bugs/:id/comments',
  requireAuth,
  asyncRoute(async (req, res) => {
    const bugId = Number(req.params.id);
    const { content } = req.body || {};

    if (!content || !String(content).trim()) {
      return res.status(400).json({ error: 'Treść komentarza nie może być pusta.' });
    }

    const existing = await queryOne('SELECT * FROM bugs WHERE id = $1', [bugId]);
    if (!existing) {
      return res.status(404).json({ error: 'Zgłoszenie nie istnieje.' });
    }

    const trimmedContent = String(content).trim();
    const inserted = await queryOne(
      `INSERT INTO bug_comments (bug_id, user_id, type, content)
       VALUES ($1, $2, 'comment', $3)
       RETURNING id`,
      [bugId, req.user.id, trimmedContent]
    );

    await query(`UPDATE bugs SET updated_at = NOW() WHERE id = $1`, [bugId]);

    const comment = await queryOne(
      `SELECT c.*, u.name AS user_name, u.role AS user_role
       FROM bug_comments c
       LEFT JOIN users u ON u.id = c.user_id
       WHERE c.id = $1`,
      [inserted.id]
    );

    const candidateIds = [...new Set([existing.reported_by, existing.assigned_to].filter(Boolean))].filter(
      (uid) => uid !== req.user.id
    );

    if (candidateIds.length > 0) {
      const recipients = (
        await queryAll(
          `SELECT email FROM users WHERE id = ANY($1::int[]) AND notify_comments = 1`,
          [candidateIds]
        )
      )
        .map((r) => r.email)
        .filter(Boolean);

      const project = await queryOne('SELECT * FROM projects WHERE id = $1', [existing.project_id]);
      if (recipients.length > 0 && project) {
        const baseUrl = getBaseUrl(req);
        sendBugCommentNotificationEmail({
          recipientEmails: recipients,
          bug: existing,
          project,
          authorName: `${req.user.name} (${req.user.email})`,
          commentContent: trimmedContent,
          bugUrl: `${baseUrl}/bledy/${bugId}`,
          settingsUrl: `${baseUrl}/ustawienia`,
        }).catch((err) => {
          console.error('[SMTP] Nie udało się wysłać powiadomienia o komentarzu:', err.message);
        });
      }
    }

    res.status(201).json({ comment });
  })
);

// Delete bug (admin only)
app.delete(
  '/api/bugs/:id',
  requireAuth,
  requireRole('admin'),
  asyncRoute(async (req, res) => {
    const bugId = Number(req.params.id);
    const bug = await queryOne('SELECT id, video_path FROM bugs WHERE id = $1', [bugId]);
    if (!bug) {
      return res.status(404).json({ error: 'Zgłoszenie nie istnieje.' });
    }

    const pathsToDelete = [];
    if (bug.video_path) pathsToDelete.push(bug.video_path);
    const shots = await queryAll('SELECT file_path FROM bug_screenshots WHERE bug_id = $1', [bugId]);
    for (const s of shots) {
      if (s.file_path) pathsToDelete.push(s.file_path);
    }

    await query('DELETE FROM bugs WHERE id = $1', [bugId]);
    await Promise.allSettled(pathsToDelete.map((p) => deleteObjectFromMinio(p)));

    res.json({ ok: true });
  })
);

// Dashboard global overview stats
app.get(
  '/api/stats/overview',
  requireAuth,
  asyncRoute(async (req, res) => {
    const stats = await queryOne(
      `SELECT
         (SELECT COUNT(*)::int FROM projects) AS total_projects,
         (SELECT COUNT(*)::int FROM bugs) AS total_bugs,
         (SELECT COUNT(*)::int FROM bugs WHERE status = 'open') AS open_bugs,
         (SELECT COUNT(*)::int FROM bugs WHERE status = 'in_progress') AS in_progress_bugs,
         (SELECT COUNT(*)::int FROM bugs WHERE status = 'testing') AS testing_bugs,
         (SELECT COUNT(*)::int FROM bugs WHERE status = 'resolved') AS resolved_bugs,
         (SELECT COUNT(*)::int FROM bugs WHERE status = 'rejected') AS rejected_bugs,
         (SELECT COUNT(*)::int FROM users) AS total_users,
         (SELECT COUNT(*)::int FROM users WHERE role = 'dev') AS total_devs`
    );

    res.json({ stats });
  })
);

// Global error handler
app.use((err, req, res, next) => {
  console.error('[API Error]', err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({
    error: err.message || 'Wystąpił wewnętrzny błąd serwera.',
  });
});

// ================= FRONTEND SERVING & STARTUP =================

async function startServer() {
  await initDatabase();

  ensureMinioBucket()
    .then(() => {
      console.log(`[MinIO] Połączono z ${minioConfig.endPoint} (bucket: ${minioConfig.bucket})`);
    })
    .catch((err) => {
      console.error(`[MinIO] Ostrzeżenie przy starcie (${minioConfig.endPoint}):`, err.message);
    });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  startGitHubSyncPoller();

  app.listen(PORT, () => {
    console.log(`\n🚀 BUGSTED działa pod adresem: http://localhost:${PORT}\n`);
  });
}

startServer().catch((err) => {
  console.error('[FATAL] Nie udało się uruchomić serwera:', err);
  process.exit(1);
});
