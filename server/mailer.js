import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const ROLE_LABELS = {
  admin: 'Administrator',
  dev: 'Developer (Programista)',
  user: 'Zwykły użytkownik',
};

const PRIORITY_LABELS = {
  low: 'Niski',
  medium: 'Średni',
  high: 'Wysoki',
  critical: 'Krytyczny',
};

const STATUS_LABELS = {
  open: 'Otwarty',
  in_progress: 'W trakcie rozwiązywania',
  testing: 'Do weryfikacji',
  resolved: 'Rozwiązany',
  rejected: 'Odrzucony',
};

const STATUS_COLORS = {
  open: '#f87171',
  in_progress: '#fbbf24',
  testing: '#a3e635',
  resolved: '#34d399',
  rejected: '#a3a3a3',
};

function createTransporter() {
  const host = process.env.SMTP_HOST || 'smtp.example.com';
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER || 'noreply@example.com';
  const pass = process.env.SMTP_PASS || '';

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });
}

function getFromAddress() {
  const user = process.env.SMTP_USER || 'noreply@example.com';
  return `"BUGSTED" <${user}>`;
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export async function verifySmtpConnection() {
  const transporter = createTransporter();
  await transporter.verify();
  return true;
}

export async function sendInvitationEmail({ to, role, inviteUrl, invitedByName }) {
  const transporter = createTransporter();
  const roleLabel = ROLE_LABELS[role] || role;

  const subject = 'Zaproszenie do rejestracji — BUGSTED';
  const text = [
    'Cześć!',
    '',
    `${invitedByName || 'Administrator'} zaprasza Cię do założenia konta w systemie zgłaszania błędów BUGSTED.`,
    `Przypisana rola: ${roleLabel}`,
    '',
    'Kliknij poniższy link, aby ustawić hasło i aktywować swoje konto:',
    inviteUrl,
    '',
    'Link jest ważny przez 7 dni.',
    '',
    'Pozdrawiamy,',
    'Zespół BUGSTED',
  ].join('\n');

  const html = `
  <div style="font-family: 'Segoe UI', Roboto, Arial, sans-serif; background-color: #0a0a0a; padding: 32px 16px; color: #f5f5f5;">
    <div style="max-width: 560px; margin: 0 auto; background-color: #171717; border: 1px solid #262626; border-radius: 16px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #059669, #10b981); padding: 24px 32px;">
        <h1 style="margin: 0; font-size: 20px; font-weight: 700; color: #ffffff;">BUGSTED</h1>
        <p style="margin: 6px 0 0; font-size: 13px; color: #d1fae5;">System zgłaszania i śledzenia błędów w aplikacjach</p>
      </div>
      <div style="padding: 32px;">
        <h2 style="margin: 0 0 16px; font-size: 18px; color: #ffffff;">Zaproszenie do rejestracji</h2>
        <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #d4d4d4;">
          <strong>${escapeHtml(invitedByName || 'Administrator')}</strong> zaprasza Cię do dołączenia do platformy <strong>BUGSTED</strong>.
        </p>
        <div style="background-color: #0a0a0a; border: 1px solid #262626; border-radius: 10px; padding: 14px 16px; margin-bottom: 24px;">
          <div style="font-size: 12px; color: #a3a3a3; text-transform: uppercase; letter-spacing: 0.05em;">Przypisana rola</div>
          <div style="font-size: 15px; font-weight: 600; color: #34d399; margin-top: 4px;">${escapeHtml(roleLabel)}</div>
        </div>
        <div style="text-align: center; margin: 28px 0;">
          <a href="${escapeHtml(inviteUrl)}" style="display: inline-block; background-color: #059669; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 14px; padding: 12px 28px; border-radius: 10px;">
            Dokończ rejestrację konta
          </a>
        </div>
        <p style="margin: 0 0 8px; font-size: 12px; color: #a3a3a3;">
          Jeśli przycisk nie działa, skopiuj i wklej ten adres w przeglądarce:
        </p>
        <p style="margin: 0 0 20px; font-size: 12px; word-break: break-all; color: #34d399;">
          <a href="${escapeHtml(inviteUrl)}" style="color: #34d399;">${escapeHtml(inviteUrl)}</a>
        </p>
        <p style="margin: 0; font-size: 12px; color: #737373;">
          Zaproszenie wygasa po 7 dniach od wysłania.
        </p>
      </div>
    </div>
  </div>`;

  return transporter.sendMail({
    from: getFromAddress(),
    to,
    subject,
    text,
    html,
  });
}

export async function sendNewBugNotificationEmail({
  recipientEmails,
  bug,
  project,
  reporterName,
  screenshotsCount,
  hasVideo,
  bugUrl,
  settingsUrl,
}) {
  if (!recipientEmails || recipientEmails.length === 0) {
    return { skipped: true, reason: 'Brak subskrybentów powiadomień o nowych błędach' };
  }

  const transporter = createTransporter();
  const priorityLabel = PRIORITY_LABELS[bug.priority] || bug.priority;
  const subject = `[Nowy błąd • ${project.name}] ${bug.title}`;

  const attachmentsInfo = [
    screenshotsCount > 0 ? `Zrzuty ekranu: ${screenshotsCount}` : 'Zrzuty ekranu: brak',
    hasVideo ? 'Nagranie wideo ekranu: TAK (załączone w zgłoszeniu)' : 'Nagranie wideo ekranu: brak',
  ].join(' | ');

  const text = [
    `Nowe zgłoszenie błędu w systemie BUGSTED`,
    '',
    `Aplikacja / Projekt: ${project.name}`,
    `Nazwa błędu: ${bug.title}`,
    `Priorytet: ${priorityLabel}`,
    `Zgłaszający: ${reporterName}`,
    `Załączniki: ${attachmentsInfo}`,
    '',
    bug.description ? `Opis:\n${bug.description}\n` : '',
    `Zobacz szczegóły zgłoszenia:`,
    bugUrl,
    '',
    settingsUrl ? `Zarządzaj swoimi powiadomieniami: ${settingsUrl}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const html = `
  <div style="font-family: 'Segoe UI', Roboto, Arial, sans-serif; background-color: #0a0a0a; padding: 32px 16px; color: #f5f5f5;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #171717; border: 1px solid #262626; border-radius: 16px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #dc2626, #ea580c); padding: 22px 32px;">
        <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #fecaca; font-weight: 600;">Nowe zgłoszenie błędu</div>
        <h1 style="margin: 6px 0 0; font-size: 20px; font-weight: 700; color: #ffffff;">${escapeHtml(bug.title)}</h1>
      </div>
      <div style="padding: 28px 32px;">
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr>
            <td style="padding: 8px 0; color: #a3a3a3; font-size: 13px; width: 150px;">Aplikacja:</td>
            <td style="padding: 8px 0; color: #ffffff; font-size: 14px; font-weight: 600;">${escapeHtml(project.name)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #a3a3a3; font-size: 13px;">Priorytet:</td>
            <td style="padding: 8px 0; color: #fbbf24; font-size: 14px; font-weight: 600;">${escapeHtml(priorityLabel)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #a3a3a3; font-size: 13px;">Zgłoszone przez:</td>
            <td style="padding: 8px 0; color: #e5e5e5; font-size: 14px;">${escapeHtml(reporterName)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #a3a3a3; font-size: 13px;">Zrzuty ekranu:</td>
            <td style="padding: 8px 0; color: #e5e5e5; font-size: 14px;">${screenshotsCount} szt.</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #a3a3a3; font-size: 13px;">Nagranie ekranu:</td>
            <td style="padding: 8px 0; color: ${hasVideo ? '#34d399' : '#a3a3a3'}; font-size: 14px; font-weight: ${hasVideo ? '600' : '400'};">
              ${hasVideo ? 'Załączono nagranie wideo' : 'Brak nagrania wideo'}
            </td>
          </tr>
        </table>
        ${
          bug.description
            ? `<div style="background-color: #0a0a0a; border: 1px solid #262626; border-radius: 10px; padding: 16px; margin-bottom: 24px;">
                <div style="font-size: 12px; color: #a3a3a3; margin-bottom: 8px; text-transform: uppercase;">Opis błędu</div>
                <div style="font-size: 14px; line-height: 1.6; color: #e5e5e5; white-space: pre-wrap;">${escapeHtml(bug.description)}</div>
              </div>`
            : ''
        }
        <div style="text-align: center; margin-top: 24px;">
          <a href="${escapeHtml(bugUrl)}" style="display: inline-block; background-color: #059669; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 14px; padding: 12px 28px; border-radius: 10px;">
            Otwórz zgłoszenie
          </a>
        </div>
        ${
          settingsUrl
            ? `<p style="margin: 24px 0 0; text-align: center; font-size: 12px; color: #737373;">
                Możesz zmienić preferencje powiadomień e-mail w zakładce <a href="${escapeHtml(settingsUrl)}" style="color: #34d399;">Ustawienia konta</a>.
              </p>`
            : ''
        }
      </div>
    </div>
  </div>`;

  return transporter.sendMail({
    from: getFromAddress(),
    bcc: recipientEmails.join(', '),
    to: getFromAddress(),
    subject,
    text,
    html,
  });
}

export async function sendBugStatusChangedEmail({
  to,
  bug,
  project,
  oldStatus,
  newStatus,
  changedByName,
  comment,
  bugUrl,
  settingsUrl,
}) {
  if (!to) return { skipped: true };

  const transporter = createTransporter();
  const oldLabel = STATUS_LABELS[oldStatus] || oldStatus;
  const newLabel = STATUS_LABELS[newStatus] || newStatus;
  const newColor = STATUS_COLORS[newStatus] || '#34d399';

  const subject = `[Zmiana statusu • ${project.name}] #${bug.id} ${bug.title} → ${newLabel}`;

  const text = [
    `Zmieniono status zgłoszonego przez Ciebie błędu w systemie BUGSTED.`,
    '',
    `Aplikacja: ${project.name}`,
    `Zgłoszenie #${bug.id}: ${bug.title}`,
    `Poprzedni status: ${oldLabel}`,
    `Nowy status: ${newLabel}`,
    `Zaktualizowano przez: ${changedByName}`,
    comment ? `\nKomentarz: ${comment}` : '',
    '',
    `Zobacz zgłoszenie:`,
    bugUrl,
    '',
    settingsUrl ? `Ustawienia powiadomień: ${settingsUrl}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const html = `
  <div style="font-family: 'Segoe UI', Roboto, Arial, sans-serif; background-color: #0a0a0a; padding: 32px 16px; color: #f5f5f5;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #171717; border: 1px solid #262626; border-radius: 16px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #059669, #047857); padding: 22px 32px;">
        <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #d1fae5; font-weight: 600;">Aktualizacja statusu zgłoszenia #${bug.id}</div>
        <h1 style="margin: 6px 0 0; font-size: 20px; font-weight: 700; color: #ffffff;">${escapeHtml(bug.title)}</h1>
      </div>
      <div style="padding: 28px 32px;">
        <p style="margin: 0 0 18px; font-size: 14px; color: #d4d4d4; line-height: 1.6;">
          <strong>${escapeHtml(changedByName)}</strong> zmienił(a) status Twojego zgłoszenia w aplikacji <strong>${escapeHtml(project.name)}</strong>:
        </p>
        <div style="background-color: #0a0a0a; border: 1px solid #262626; border-radius: 12px; padding: 18px; margin-bottom: 20px; text-align: center;">
          <span style="display: inline-block; font-size: 13px; color: #a3a3a3; text-decoration: line-through;">${escapeHtml(oldLabel)}</span>
          <span style="display: inline-block; margin: 0 12px; color: #737373; font-size: 16px;">→</span>
          <span style="display: inline-block; font-size: 15px; font-weight: 700; color: ${newColor};">${escapeHtml(newLabel)}</span>
        </div>
        ${
          comment
            ? `<div style="background-color: #0a0a0a; border: 1px solid #262626; border-radius: 10px; padding: 14px 16px; margin-bottom: 22px;">
                <div style="font-size: 12px; color: #a3a3a3; margin-bottom: 6px; text-transform: uppercase;">Notatka do zmiany statusu</div>
                <div style="font-size: 14px; line-height: 1.6; color: #e5e5e5; white-space: pre-wrap;">${escapeHtml(comment)}</div>
              </div>`
            : ''
        }
        <div style="text-align: center; margin-top: 24px;">
          <a href="${escapeHtml(bugUrl)}" style="display: inline-block; background-color: #059669; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 14px; padding: 12px 28px; border-radius: 10px;">
            Zobacz szczegóły zgłoszenia
          </a>
        </div>
        ${
          settingsUrl
            ? `<p style="margin: 24px 0 0; text-align: center; font-size: 12px; color: #737373;">
                Możesz dostosować powiadomienia e-mail w zakładce <a href="${escapeHtml(settingsUrl)}" style="color: #34d399;">Ustawienia konta</a>.
              </p>`
            : ''
        }
      </div>
    </div>
  </div>`;

  return transporter.sendMail({
    from: getFromAddress(),
    to,
    subject,
    text,
    html,
  });
}

export async function sendBugCommentNotificationEmail({
  recipientEmails,
  bug,
  project,
  authorName,
  commentContent,
  bugUrl,
  settingsUrl,
}) {
  if (!recipientEmails || recipientEmails.length === 0) return { skipped: true };

  const transporter = createTransporter();
  const subject = `[Nowy komentarz • ${project.name}] #${bug.id} ${bug.title}`;

  const text = [
    `${authorName} dodał(a) nowy komentarz do zgłoszenia #${bug.id}: ${bug.title} (${project.name}).`,
    '',
    `Treść komentarza:`,
    commentContent,
    '',
    `Przejdź do zgłoszenia: ${bugUrl}`,
  ].join('\n');

  const html = `
  <div style="font-family: 'Segoe UI', Roboto, Arial, sans-serif; background-color: #0a0a0a; padding: 32px 16px; color: #f5f5f5;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #171717; border: 1px solid #262626; border-radius: 16px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #d97706, #f59e0b); padding: 20px 32px;">
        <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #fef3c7; font-weight: 600;">Nowy komentarz w zgłoszeniu #${bug.id}</div>
        <h1 style="margin: 6px 0 0; font-size: 19px; font-weight: 700; color: #ffffff;">${escapeHtml(bug.title)}</h1>
      </div>
      <div style="padding: 28px 32px;">
        <p style="margin: 0 0 14px; font-size: 14px; color: #d4d4d4;">
          <strong>${escapeHtml(authorName)}</strong> dodał(a) komentarz w aplikacji <strong>${escapeHtml(project.name)}</strong>:
        </p>
        <div style="background-color: #0a0a0a; border: 1px solid #262626; border-radius: 10px; padding: 16px; margin-bottom: 24px; font-size: 14px; line-height: 1.6; color: #e5e5e5; white-space: pre-wrap;">${escapeHtml(commentContent)}</div>
        <div style="text-align: center;">
          <a href="${escapeHtml(bugUrl)}" style="display: inline-block; background-color: #059669; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 14px; padding: 12px 28px; border-radius: 10px;">
            Odpowiedz w zgłoszeniu
          </a>
        </div>
        ${
          settingsUrl
            ? `<p style="margin: 24px 0 0; text-align: center; font-size: 12px; color: #737373;">
                Zarządzaj powiadomieniami w zakładce <a href="${escapeHtml(settingsUrl)}" style="color: #34d399;">Ustawienia konta</a>.
              </p>`
            : ''
        }
      </div>
    </div>
  </div>`;

  return transporter.sendMail({
    from: getFromAddress(),
    to: recipientEmails.join(', '),
    subject,
    text,
    html,
  });
}

export async function sendBugAssignedEmail({
  to,
  bug,
  project,
  assignedByName,
  bugUrl,
  settingsUrl,
}) {
  if (!to) return { skipped: true };

  const transporter = createTransporter();
  const subject = `[Przypisano zgłoszenie • ${project.name}] #${bug.id} ${bug.title}`;

  const text = [
    `${assignedByName} przypisał(a) Ci obsługę zgłoszenia #${bug.id}: ${bug.title} w aplikacji ${project.name}.`,
    '',
    `Otwórz zgłoszenie: ${bugUrl}`,
  ].join('\n');

  const html = `
  <div style="font-family: 'Segoe UI', Roboto, Arial, sans-serif; background-color: #0a0a0a; padding: 32px 16px; color: #f5f5f5;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #171717; border: 1px solid #262626; border-radius: 16px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #059669, #10b981); padding: 20px 32px;">
        <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #d1fae5; font-weight: 600;">Przypisano zgłoszenie #${bug.id}</div>
        <h1 style="margin: 6px 0 0; font-size: 19px; font-weight: 700; color: #ffffff;">${escapeHtml(bug.title)}</h1>
      </div>
      <div style="padding: 28px 32px;">
        <p style="margin: 0 0 22px; font-size: 14px; color: #d4d4d4; line-height: 1.6;">
          <strong>${escapeHtml(assignedByName)}</strong> przypisał(a) Cię jako osobę odpowiedzialną za zgłoszenie w aplikacji <strong>${escapeHtml(project.name)}</strong>.
        </p>
        <div style="text-align: center;">
          <a href="${escapeHtml(bugUrl)}" style="display: inline-block; background-color: #059669; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 14px; padding: 12px 28px; border-radius: 10px;">
            Przejdź do zgłoszenia
          </a>
        </div>
        ${
          settingsUrl
            ? `<p style="margin: 24px 0 0; text-align: center; font-size: 12px; color: #737373;">
                Zarządzaj powiadomieniami w zakładce <a href="${escapeHtml(settingsUrl)}" style="color: #34d399;">Ustawienia konta</a>.
              </p>`
            : ''
        }
      </div>
    </div>
  </div>`;

  return transporter.sendMail({
    from: getFromAddress(),
    to,
    subject,
    text,
    html,
  });
}
