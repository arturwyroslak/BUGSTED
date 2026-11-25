import jwt from 'jsonwebtoken';
import { queryOne } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'bugsted-dev-secret-change-in-production';
export const COOKIE_NAME = 'bugsted_token';

export const USER_PUBLIC_COLUMNS = `
  id, email, name, role,
  notify_new_bug, notify_status_change, notify_comments, notify_assigned,
  language, created_at
`;

export function formatUserRecord(u) {
  if (!u) return null;
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    notify_new_bug: Boolean(u.notify_new_bug),
    notify_status_change: Boolean(u.notify_status_change),
    notify_comments: Boolean(u.notify_comments),
    notify_assigned: Boolean(u.notify_assigned),
    language: u.language || '',
    created_at: u.created_at,
  };
}

export function signUserToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' && process.env.HTTPS === 'true',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

export async function requireAuth(req, res, next) {
  try {
    let token = req.cookies?.[COOKIE_NAME];
    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.slice(7);
    }
    if (!token) {
      return res.status(401).json({ error: 'Wymagane zalogowanie.' });
    }

    const payload = jwt.verify(token, JWT_SECRET);
    const user = await queryOne(
      `SELECT ${USER_PUBLIC_COLUMNS} FROM users WHERE id = $1`,
      [payload.id]
    );

    if (!user) {
      clearAuthCookie(res);
      return res.status(401).json({ error: 'Sesja wygasła lub konto nie istnieje.' });
    }

    req.user = formatUserRecord(user);
    next();
  } catch (err) {
    clearAuthCookie(res);
    return res.status(401).json({ error: 'Nieprawidłowa lub wygasła sesja. Zaloguj się ponownie.' });
  }
}

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Wymagane zalogowanie.' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Brak uprawnień do wykonania tej operacji.' });
    }
    next();
  };
}
