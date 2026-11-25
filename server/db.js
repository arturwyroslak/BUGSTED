import pg from 'pg';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Parse BIGINT (int8, OID 20) as safe JS number when within safe range
pg.types.setTypeParser(20, (val) => (val === null ? null : Number(val)));

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('Brak zmiennej środowiskowej DATABASE_URL w pliku .env.');
}

export const pool = new Pool({
  connectionString,
  max: 15,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('[PostgreSQL] Nieoczekiwany błąd puli połączeń:', err.message);
});

export async function query(text, params = []) {
  return pool.query(text, params);
}

export async function queryAll(text, params = []) {
  const res = await pool.query(text, params);
  return res.rows;
}

export async function queryOne(text, params = []) {
  const res = await pool.query(text, params);
  return res.rows[0] || null;
}

export async function withTransaction(fn) {
  const client = await pool.connect();
  const tx = {
    query: (text, params = []) => client.query(text, params),
    queryAll: async (text, params = []) => (await client.query(text, params)).rows,
    queryOne: async (text, params = []) =>
      (await client.query(text, params)).rows[0] || null,
  };

  try {
    await client.query('BEGIN');
    const result = await fn(tx);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function verifyDatabaseConnection() {
  const row = await queryOne('SELECT current_database() AS db, inet_server_addr()::text AS host');
  return {
    connected: true,
    database: row?.db || 'bugs',
    host: row?.host || '',
  };
}

export async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'dev', 'user')),
      notify_new_bug INTEGER NOT NULL DEFAULT 1,
      notify_status_change INTEGER NOT NULL DEFAULT 1,
      notify_comments INTEGER NOT NULL DEFAULT 1,
      notify_assigned INTEGER NOT NULL DEFAULT 1,
      language TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email));

    CREATE TABLE IF NOT EXISTS invitations (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'dev', 'user')),
      token TEXT UNIQUE NOT NULL,
      invited_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      accepted_at TIMESTAMPTZ,
      email_sent INTEGER NOT NULL DEFAULT 0,
      email_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS projects (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT '#10b981',
      github_repo TEXT NOT NULL DEFAULT '',
      github_sync_enabled INTEGER NOT NULL DEFAULT 0,
      github_webhook_id BIGINT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS bugs (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'testing', 'resolved', 'rejected')),
      video_path TEXT,
      video_original_name TEXT,
      video_mime TEXT,
      video_size BIGINT,
      github_issue_number INTEGER,
      github_issue_url TEXT,
      github_synced_at TIMESTAMPTZ,
      ai_suggestion TEXT,
      ai_model TEXT,
      ai_analyzed_files TEXT,
      ai_generated_at TIMESTAMPTZ,
      reported_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS bug_screenshots (
      id SERIAL PRIMARY KEY,
      bug_id INTEGER NOT NULL REFERENCES bugs(id) ON DELETE CASCADE,
      file_path TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size BIGINT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS bug_comments (
      id SERIAL PRIMARY KEY,
      bug_id INTEGER NOT NULL REFERENCES bugs(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      type TEXT NOT NULL DEFAULT 'comment' CHECK (type IN ('comment', 'status_change')),
      content TEXT NOT NULL,
      old_status TEXT,
      new_status TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_bugs_project_id ON bugs(project_id);
    CREATE INDEX IF NOT EXISTS idx_bugs_status ON bugs(status);
    CREATE INDEX IF NOT EXISTS idx_bug_screenshots_bug_id ON bug_screenshots(bug_id);
    CREATE INDEX IF NOT EXISTS idx_bug_comments_bug_id ON bug_comments(bug_id);
    CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);
  `);

  // Idempotent column migrations if tables existed from an earlier version
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_new_bug INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_status_change INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_comments INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_assigned INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT '';

    ALTER TABLE projects ADD COLUMN IF NOT EXISTS github_repo TEXT NOT NULL DEFAULT '';
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS github_sync_enabled INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS github_webhook_id BIGINT;

    ALTER TABLE bugs ADD COLUMN IF NOT EXISTS github_issue_number INTEGER;
    ALTER TABLE bugs ADD COLUMN IF NOT EXISTS github_issue_url TEXT;
    ALTER TABLE bugs ADD COLUMN IF NOT EXISTS github_synced_at TIMESTAMPTZ;
    ALTER TABLE bugs ADD COLUMN IF NOT EXISTS ai_suggestion TEXT;
    ALTER TABLE bugs ADD COLUMN IF NOT EXISTS ai_model TEXT;
    ALTER TABLE bugs ADD COLUMN IF NOT EXISTS ai_analyzed_files TEXT;
    ALTER TABLE bugs ADD COLUMN IF NOT EXISTS ai_generated_at TIMESTAMPTZ;
  `);

  await seedAdminUser();
  console.log('[PostgreSQL] Połączono i zweryfikowano schemat bazy danych');
}

async function seedAdminUser() {
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@example.com')
    .trim()
    .toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || 'ChangeMe123!';

  const existing = await queryOne(
    'SELECT id, role FROM users WHERE LOWER(email) = LOWER($1)',
    [adminEmail]
  );
  const passwordHash = bcrypt.hashSync(adminPassword, 10);

  if (!existing) {
    await query(
      `INSERT INTO users (
         email, name, password_hash, role,
         notify_new_bug, notify_status_change, notify_comments, notify_assigned
       )
       VALUES ($1, $2, $3, 'admin', 1, 1, 1, 1)`,
      [adminEmail, 'Administrator', passwordHash]
    );
    console.log(`[PostgreSQL] Utworzono domyślne konto administratora: ${adminEmail}`);
  } else if (existing.role !== 'admin') {
    await query(
      `UPDATE users SET role = 'admin', notify_new_bug = 1 WHERE id = $1`,
      [existing.id]
    );
    console.log(`[PostgreSQL] Przywrócono rolę admin dla konta: ${adminEmail}`);
  }
}
