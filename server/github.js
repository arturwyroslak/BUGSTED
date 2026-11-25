import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { query, queryAll, queryOne, withTransaction } from './db.js';
import { sendBugStatusChangedEmail } from './mailer.js';

dotenv.config();

const GITHUB_API = (process.env.GITHUB_API_URL || 'https://api.github.com').replace(/\/+$/, '');

const STATUS_LABELS_PL = {
  open: 'Otwarty',
  in_progress: 'W trakcie rozwiązywania',
  testing: 'Do weryfikacji',
  resolved: 'Rozwiązany',
  rejected: 'Odrzucony',
};

const PRIORITY_LABELS_PL = {
  low: 'Niski',
  medium: 'Średni',
  high: 'Wysoki',
  critical: 'Krytyczny',
};

export const APP_TO_GH_STATUS = {
  open: {
    state: 'open',
    label: 'status: otwarty',
    color: 'ef4444',
    description: 'Zgłoszenie otwarte w BUGSTED',
  },
  in_progress: {
    state: 'open',
    label: 'status: w trakcie',
    color: 'f59e0b',
    description: 'Błąd w trakcie rozwiązywania',
  },
  testing: {
    state: 'open',
    label: 'status: do weryfikacji',
    color: '84cc16',
    description: 'Rozwiązanie oczekuje na weryfikację',
  },
  resolved: {
    state: 'closed',
    state_reason: 'completed',
    label: 'status: rozwiązany',
    color: '10b981',
    description: 'Błąd rozwiązany',
  },
  rejected: {
    state: 'closed',
    state_reason: 'not_planned',
    label: 'status: odrzucony',
    color: '737373',
    description: 'Zgłoszenie zamknięte / odrzucone',
  },
};

const ALL_MANAGED_STATUS_LABELS = Object.values(APP_TO_GH_STATUS).map((s) =>
  s.label.toLowerCase()
);

const inFlightPushes = new Set();
const ensuredRepoLabels = new Set();
let reposCache = { expiresAt: 0, repos: [] };

function getToken() {
  return (process.env.GITHUB_TOKEN || '').trim();
}

export async function ghFetch(endpoint, { method = 'GET', body } = {}) {
  const token = getToken();
  if (!token) {
    throw new Error('Brak skonfigurowanego tokenu GITHUB_TOKEN w pliku .env.');
  }

  const res = await fetch(`${GITHUB_API}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'BUGSTED/1.0',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {}

  if (!res.ok) {
    const err = new Error(
      data?.message || `Błąd GitHub API (${res.status} ${res.statusText})`
    );
    err.status = res.status;
    throw err;
  }

  return data;
}

export async function verifyGitHubConnection() {
  const user = await ghFetch('/user');
  return {
    connected: true,
    login: user.login,
    name: user.name || user.login,
    avatar_url: user.avatar_url,
  };
}

export async function listAccessibleRepos({ forceRefresh = false } = {}) {
  if (!forceRefresh && reposCache.repos.length > 0 && Date.now() < reposCache.expiresAt) {
    return reposCache.repos;
  }

  const collected = [];
  for (let page = 1; page <= 5; page++) {
    const pageItems = await ghFetch(
      `/user/repos?per_page=100&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`
    );
    if (!Array.isArray(pageItems) || pageItems.length === 0) break;
    collected.push(...pageItems);
    if (pageItems.length < 100) break;
  }

  const formatted = collected
    .filter((r) => !r.archived)
    .map((r) => ({
      id: r.id,
      full_name: r.full_name,
      name: r.name,
      owner: r.owner?.login || '',
      private: Boolean(r.private),
      has_issues: Boolean(r.has_issues),
      html_url: r.html_url,
      description: r.description || '',
    }));

  reposCache = {
    repos: formatted,
    expiresAt: Date.now() + 60 * 1000,
  };

  return formatted;
}

async function ensureRepoStatusLabels(repoFullName) {
  const key = repoFullName.toLowerCase();
  if (ensuredRepoLabels.has(key)) return;

  try {
    const existing = await ghFetch(`/repos/${repoFullName}/labels?per_page=100`);
    const existingNames = new Set(
      (existing || []).map((l) => String(l.name || '').toLowerCase())
    );

    const desired = [
      { name: 'bug', color: 'dc2626', description: 'Zgłoszenie błędu' },
      ...Object.values(APP_TO_GH_STATUS).map((s) => ({
        name: s.label,
        color: s.color,
        description: s.description,
      })),
    ];

    for (const lbl of desired) {
      if (!existingNames.has(lbl.name.toLowerCase())) {
        await ghFetch(`/repos/${repoFullName}/labels`, {
          method: 'POST',
          body: lbl,
        }).catch(() => {});
      }
    }

    ensuredRepoLabels.add(key);
  } catch (err) {
    console.warn(`[GitHub] Nie udało się zweryfikować etykiet w ${repoFullName}:`, err.message);
  }
}

export async function createGitHubIssueForBug({
  repoFullName,
  bug,
  project,
  reporterName,
  screenshotsCount,
  hasVideo,
  bugUrl,
}) {
  await ensureRepoStatusLabels(repoFullName);

  const statusMeta = APP_TO_GH_STATUS[bug.status] || APP_TO_GH_STATUS.open;
  const prioLabel = PRIORITY_LABELS_PL[bug.priority] || bug.priority;

  const lines = [
    `### Zgłoszenie błędu z systemu **BUGSTED**`,
    '',
    `- **Aplikacja:** ${project.name}`,
    `- **ID zgłoszenia:** #${bug.id}`,
    `- **Priorytet:** ${prioLabel}`,
    `- **Zgłaszający:** ${reporterName}`,
    `- **Zrzuty ekranu:** ${screenshotsCount} szt.`,
    `- **Nagranie wideo ekranu:** ${hasVideo ? 'Tak (dostępne w panelu zgłoszenia)' : 'Brak'}`,
    `- **Link do zgłoszenia i załączników:** [Otwórz zgłoszenie #${bug.id} w BUGSTED](${bugUrl})`,
    '',
  ];

  if (bug.description) {
    lines.push('### Opis błędu', '', bug.description, '');
  }

  lines.push(
    '---',
    '_Status tego Issue jest synchronizowany dwukierunkowo z platformą BUGSTED._'
  );

  const created = await ghFetch(`/repos/${repoFullName}/issues`, {
    method: 'POST',
    body: {
      title: bug.title,
      body: lines.join('\n'),
      labels: ['bug', statusMeta.label],
    },
  });

  if (statusMeta.state === 'closed') {
    const pushKey = `${repoFullName.toLowerCase()}#${created.number}`;
    inFlightPushes.add(pushKey);
    try {
      await ghFetch(`/repos/${repoFullName}/issues/${created.number}`, {
        method: 'PATCH',
        body: {
          state: 'closed',
          state_reason: statusMeta.state_reason || 'completed',
        },
      });
    } finally {
      inFlightPushes.delete(pushKey);
    }
  }

  return {
    number: created.number,
    html_url: created.html_url,
  };
}

export async function pushBugStatusToGitHub({
  repoFullName,
  issueNumber,
  newStatus,
  comment = '',
  changedByName = '',
}) {
  if (!repoFullName || !issueNumber) return;

  const mapping = APP_TO_GH_STATUS[newStatus] || APP_TO_GH_STATUS.open;
  await ensureRepoStatusLabels(repoFullName);

  const pushKey = `${repoFullName.toLowerCase()}#${issueNumber}`;
  inFlightPushes.add(pushKey);

  try {
    const currentIssue = await ghFetch(`/repos/${repoFullName}/issues/${issueNumber}`);
    const preservedLabels = (currentIssue.labels || [])
      .map((l) => (typeof l === 'string' ? l : l.name))
      .filter(
        (name) => name && !ALL_MANAGED_STATUS_LABELS.includes(name.toLowerCase())
      );

    const nextLabels = [...new Set([...preservedLabels, mapping.label])];
    const patchPayload = {
      state: mapping.state,
      labels: nextLabels,
    };

    if (mapping.state === 'closed') {
      patchPayload.state_reason = mapping.state_reason || 'completed';
    } else if (currentIssue.state === 'closed') {
      patchPayload.state_reason = 'reopened';
    }

    await ghFetch(`/repos/${repoFullName}/issues/${issueNumber}`, {
      method: 'PATCH',
      body: patchPayload,
    });
  } finally {
    inFlightPushes.delete(pushKey);
  }

  if (comment && String(comment).trim()) {
    const statusLabel = STATUS_LABELS_PL[newStatus] || newStatus;
    const bodyText = `**Aktualizacja statusu w BUGSTED → \`${statusLabel}\`**${
      changedByName ? ` (${changedByName})` : ''
    }:\n\n${String(comment).trim()}`;

    await ghFetch(`/repos/${repoFullName}/issues/${issueNumber}/comments`, {
      method: 'POST',
      body: { body: bodyText },
    }).catch((err) => {
      console.warn('[GitHub] Nie udało się dodać komentarza statusu w Issue:', err.message);
    });
  }
}

export function mapGitHubIssueToAppStatus(ghIssue) {
  const labels = (ghIssue.labels || []).map((l) =>
    String(typeof l === 'string' ? l : l.name || '').toLowerCase()
  );

  if (ghIssue.state === 'closed') {
    if (
      ghIssue.state_reason === 'not_planned' ||
      (labels.includes('status: odrzucony') && ghIssue.state_reason !== 'completed')
    ) {
      return 'rejected';
    }
    return 'resolved';
  }

  if (labels.includes('status: w trakcie') || labels.includes('in progress')) {
    return 'in_progress';
  }
  if (
    labels.includes('status: do weryfikacji') ||
    labels.includes('testing') ||
    labels.includes('weryfikacja')
  ) {
    return 'testing';
  }
  return 'open';
}

export async function applyGitHubIssueSyncToDb(repoFullName, ghIssue, appBaseUrl = '') {
  if (!repoFullName || !ghIssue || ghIssue.pull_request) {
    return { changed: false };
  }

  const pushKey = `${repoFullName.toLowerCase()}#${ghIssue.number}`;
  if (inFlightPushes.has(pushKey)) {
    return { changed: false };
  }

  const bug = await queryOne(
    `SELECT b.*, p.name AS project_name, p.github_repo, p.github_sync_enabled
     FROM bugs b
     JOIN projects p ON p.id = b.project_id
     WHERE p.github_sync_enabled = 1
       AND LOWER(p.github_repo) = LOWER($1)
       AND b.github_issue_number = $2`,
    [repoFullName, Number(ghIssue.number)]
  );

  if (!bug) {
    return { changed: false };
  }

  const mappedStatus = mapGitHubIssueToAppStatus(ghIssue);

  if (mappedStatus === bug.status) {
    await query(`UPDATE bugs SET github_synced_at = NOW() WHERE id = $1`, [bug.id]);
    return { changed: false };
  }

  const oldStatus = bug.status;
  const oldLabel = STATUS_LABELS_PL[oldStatus] || oldStatus;
  const newLabel = STATUS_LABELS_PL[mappedStatus] || mappedStatus;
  const commentMsg = `Zsynchronizowano zmianę statusu z GitHub Issue #${ghIssue.number}: z „${oldLabel}” na „${newLabel}”.`;

  await withTransaction(async (tx) => {
    await tx.query(
      `UPDATE bugs
       SET status = $1, updated_at = NOW(), github_synced_at = NOW()
       WHERE id = $2`,
      [mappedStatus, bug.id]
    );

    await tx.query(
      `INSERT INTO bug_comments (bug_id, user_id, type, content, old_status, new_status)
       VALUES ($1, NULL, 'status_change', $2, $3, $4)`,
      [bug.id, commentMsg, oldStatus, mappedStatus]
    );
  });

  const targetLabel = APP_TO_GH_STATUS[mappedStatus]?.label;
  if (targetLabel) {
    const currentNames = (ghIssue.labels || []).map((l) =>
      typeof l === 'string' ? l : l.name
    );
    const hasExactManagedLabel =
      currentNames.some((n) => n?.toLowerCase() === targetLabel.toLowerCase()) &&
      currentNames.filter((n) => ALL_MANAGED_STATUS_LABELS.includes(n?.toLowerCase())).length === 1;

    if (!hasExactManagedLabel) {
      const cleaned = currentNames.filter(
        (n) => n && !ALL_MANAGED_STATUS_LABELS.includes(n.toLowerCase())
      );
      inFlightPushes.add(pushKey);
      ghFetch(`/repos/${repoFullName}/issues/${ghIssue.number}`, {
        method: 'PATCH',
        body: { labels: [...new Set([...cleaned, targetLabel])] },
      })
        .catch(() => {})
        .finally(() => inFlightPushes.delete(pushKey));
    }
  }

  if (bug.reported_by) {
    const reporter = await queryOne(
      'SELECT id, email, name, notify_status_change FROM users WHERE id = $1',
      [bug.reported_by]
    );
    const project = await queryOne('SELECT * FROM projects WHERE id = $1', [bug.project_id]);

    if (reporter?.email && reporter.notify_status_change === 1 && project) {
      const base = (appBaseUrl || process.env.APP_URL || 'http://localhost:3133').replace(/\/+$/, '');
      const updatedBug = await queryOne('SELECT * FROM bugs WHERE id = $1', [bug.id]);
      sendBugStatusChangedEmail({
        to: reporter.email,
        bug: updatedBug,
        project,
        oldStatus,
        newStatus: mappedStatus,
        changedByName: `GitHub (${repoFullName}#${ghIssue.number})`,
        comment: '',
        bugUrl: `${base}/bledy/${bug.id}`,
        settingsUrl: `${base}/ustawienia`,
      }).catch((err) => {
        console.error('[SMTP] Błąd wysyłki maila po synchronizacji z GitHub:', err.message);
      });
    }
  }

  return {
    changed: true,
    bugId: bug.id,
    oldStatus,
    newStatus: mappedStatus,
  };
}

export async function syncSingleBugFromGitHub(bugId, appBaseUrl = '') {
  const row = await queryOne(
    `SELECT b.id, b.github_issue_number, p.github_repo, p.github_sync_enabled
     FROM bugs b
     JOIN projects p ON p.id = b.project_id
     WHERE b.id = $1`,
    [bugId]
  );

  if (!row || !row.github_sync_enabled || !row.github_repo || !row.github_issue_number) {
    return { synced: false };
  }

  const ghIssue = await ghFetch(
    `/repos/${row.github_repo}/issues/${row.github_issue_number}`
  );
  const res = await applyGitHubIssueSyncToDb(row.github_repo, ghIssue, appBaseUrl);
  return { synced: true, ...res };
}

export async function syncProjectIssuesFromGitHub(projectId, appBaseUrl = '') {
  const project = await queryOne('SELECT * FROM projects WHERE id = $1', [projectId]);
  if (!project || !project.github_sync_enabled || !project.github_repo) {
    return { synced: false, updatedCount: 0 };
  }

  const countRow = await queryOne(
    'SELECT COUNT(*)::int AS cnt FROM bugs WHERE project_id = $1 AND github_issue_number IS NOT NULL',
    [project.id]
  );

  if (!countRow?.cnt) {
    return { synced: true, updatedCount: 0 };
  }

  const issues = await ghFetch(
    `/repos/${project.github_repo}/issues?state=all&sort=updated&direction=desc&per_page=50`
  );

  let updatedCount = 0;
  for (const ghIssue of issues || []) {
    if (ghIssue.pull_request) continue;
    const r = await applyGitHubIssueSyncToDb(project.github_repo, ghIssue, appBaseUrl);
    if (r.changed) updatedCount++;
  }

  return { synced: true, updatedCount };
}

export async function tryEnsureRepoWebhook(repoFullName, appBaseUrl) {
  if (!repoFullName || !appBaseUrl) return null;
  const cleanBase = appBaseUrl.replace(/\/+$/, '');
  if (!cleanBase.startsWith('https://') || cleanBase.includes('localhost')) {
    return null;
  }

  const webhookUrl = `${cleanBase}/api/webhooks/github`;
  const secret = (process.env.GITHUB_WEBHOOK_SECRET || '').trim();

  try {
    const hooks = await ghFetch(`/repos/${repoFullName}/hooks?per_page=100`);
    const existing = (hooks || []).find((h) => h.config?.url === webhookUrl);
    if (existing) return existing.id;

    const created = await ghFetch(`/repos/${repoFullName}/hooks`, {
      method: 'POST',
      body: {
        name: 'web',
        active: true,
        events: ['issues'],
        config: {
          url: webhookUrl,
          content_type: 'json',
          ...(secret ? { secret } : {}),
        },
      },
    });
    console.log(`[GitHub] Automatycznie zarejestrowano Webhook w ${repoFullName}`);
    return created?.id || null;
  } catch {
    return null;
  }
}

export function verifyGitHubWebhookSignature(rawBodyBuffer, signatureHeader) {
  const secret = (process.env.GITHUB_WEBHOOK_SECRET || '').trim();
  if (!secret) return true;
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;

  const expected =
    'sha256=' +
    crypto.createHmac('sha256', secret).update(rawBodyBuffer).digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

let isPolling = false;

export function startGitHubSyncPoller() {
  const intervalMs = 20 * 1000;
  setInterval(async () => {
    if (isPolling || !getToken()) return;
    isPolling = true;
    try {
      const activeProjects = await queryAll(
        `SELECT DISTINCT p.id, p.github_repo
         FROM projects p
         JOIN bugs b ON b.project_id = p.id
         WHERE p.github_sync_enabled = 1
           AND p.github_repo != ''
           AND b.github_issue_number IS NOT NULL`
      );

      for (const proj of activeProjects) {
        try {
          await syncProjectIssuesFromGitHub(
            proj.id,
            process.env.APP_URL || ''
          );
        } catch (err) {
          console.warn(
            `[GitHub Sync] Ostrzeżenie podczas synchronizacji ${proj.github_repo}:`,
            err.message
          );
        }
      }
    } catch (err) {
      console.warn('[GitHub Sync] Błąd pętli synchronizacji:', err.message);
    } finally {
      isPolling = false;
    }
  }, intervalMs);
}
