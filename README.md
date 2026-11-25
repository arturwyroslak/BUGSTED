# BUGSTED

**BUGSTED** is a fast, open-source, self-hosted bug tracker with GitHub Issues sync and a built-in AI agent that analyzes your codebase to suggest root causes and fixes.

---

## Screenshots

| All Bug Reports | Report a Bug | Bug Details & AI Suggestion |
| :---: | :---: | :---: |
| ![All Bug Reports](docs/screenshots/bugs-list.png) | ![Report a Bug](docs/screenshots/report-bug.png) | ![Bug Details & AI Suggestion](docs/screenshots/bug-details-ai.png) |

---

## Key Features

- **Invite-Only Onboarding & Role-Based Access Control (RBAC)**
  - Three roles: `Administrator`, `Developer (Dev)`, and `Standard User`.
  - Administrators send unique invite links by email (`SMTP`) and can change user roles at any time.
  - Self-registration is disabled without a valid invite token.
- **Screenshots & In-Browser Screen Video Recording**
  - Upload up to **10 screenshots** per bug report via drag-and-drop, file picker, or direct clipboard paste (`Ctrl+V`).
  - Built-in browser **Screen Recorder** (`MediaRecorder` + `getDisplayMedia`) with optional microphone audio, pause/resume, live preview, or manual video upload.
- **S3 / MinIO Object Storage**
  - Works out of the box with **MinIO** (included in `docker-compose.yml`) or **any S3-compatible object storage** (AWS S3, Cloudflare R2, DigitalOcean Spaces, Backblaze B2, Wasabi, Ceph, etc.).
  - Supports custom `S3_REGION`, `S3_PATH_STYLE`, TLS/SSL, and both `S3_*` and `MINIO_*` environment variables.
  - Media files are served through authenticated API proxy routes with HTTP `Range` streaming support for video seeking.
- **Any OpenAI-Compatible AI Endpoint (`AI Suggestion`)**
  - Inside every bug detail page, click **Run AI analysis** to trigger an agentic inspection of the linked GitHub repository source tree, files, and code snippets alongside the bug report.
  - Works with **any OpenAI Chat Completions-compatible endpoint** (`AI_API_URL` + optional `AI_API_KEY` + comma-separated `AI_MODELS`): OpenAI, OpenRouter, Groq, Pollinations, Together, LiteLLM, Azure proxies, or local models via **Ollama** / **LM Studio** / **vLLM**.
  - Users can pick from preconfigured models or enter a custom model ID directly in the UI. Live agent steps stream over Server-Sent Events (SSE), and the AI responds in the user's selected UI language.
- **Two-Way GitHub Issues Synchronization**
  - Link any application/project to a GitHub repository (`owner/repo`) in project settings.
  - Optionally enable two-way synchronization: new bugs automatically create GitHub Issues, and status updates (`Open`, `In Progress`, `Ready for Verification`, `Resolved`, `Rejected`) sync in both directions via API or GitHub webhooks.
- **Multi-Language UI (7 Languages + Automatic Browser Detection + RTL)**
  - Automatically detects the user's browser language (`navigator.languages`) on first visit and allows switching languages before sign-in or in **Settings** (persisted to the database per user).
  - Supported languages:
    - **English (`en`)**
    - **Polish (`pl`)**
    - **Spanish (`es`)**
    - **German (`de`)**
    - **French (`fr`)**
    - **Arabic (`ar`)** — with automatic right-to-left (`dir="rtl"`) layout
    - **Chinese (`zh`)**
- **Customizable Email Notifications**
  - Automated SMTP emails for new bugs (default on for Admins & Devs), status changes (default on for bug reporters), comments, and developer assignments. Every user can customize each notification toggle in **Settings**.
- **PostgreSQL Backend**
  - Automatic schema creation and incremental migrations on startup.

---

## Tech Stack

- **Frontend:** React 18, Vite 6, Tailwind CSS 3, React Router 6, Lucide Icons
- **Backend:** Node.js 24, Express 4, Multer, JWT (`httpOnly` cookies), `bcryptjs`, Nodemailer
- **Database:** PostgreSQL (`pg`)
- **Object Storage:** S3-compatible / MinIO (`minio` SDK)
- **Containerization:** Multi-stage `Dockerfile` + `docker-compose.yml` (App + PostgreSQL 17 + MinIO)

---

## Quick Start (Docker Compose)

The fastest way to run BUGSTED locally or on a server with PostgreSQL and MinIO included:

### 1. Clone the repository & create `.env`

```bash
git clone https://github.com/arturwyroslak/BUGSTED.git
cd BUGSTED
cp .env.example .env
```

### 2. Configure `.env`

Edit `.env` before starting:

- Set a strong random `JWT_SECRET`.
- Set `APP_URL` to your domain or server URL (e.g. `https://bugs.example.com` or `http://localhost:3000`).
- Set `DATABASE_URL` to point to the `postgres` service in Docker Compose:
  ```env
  DATABASE_URL="postgresql://bugsted:bugsted123@postgres:5432/bugsted"
  ```
- Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` for the initial administrator account (created automatically on first boot).
- Configure `SMTP_*`, `GITHUB_TOKEN`, `AI_API_URL`, `AI_API_KEY`, `AI_MODELS`, and `S3_*` (see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for examples for AWS S3, Cloudflare R2, Ollama, OpenAI, etc.).

### 3. Build and start the stack

```bash
docker compose up -d --build
```

Once running:
- **BUGSTED UI & API:** `http://localhost:3000`
- **MinIO Console:** `http://localhost:9001` (S3 API on port `9000`)

Verify container health:

```bash
docker compose ps
docker compose logs -f bugsted
```

---

## Local Development (Without Docker)

**Prerequisites:** Node.js 20+ (Node 24 recommended), a running PostgreSQL database, and MinIO or any S3-compatible bucket.

```bash
npm install
cp .env.example .env
# Edit .env with your local DATABASE_URL and S3_* credentials

# Build frontend
npm run build

# Start Express server (serves API + built frontend on PORT, default 3000)
npm run dev
```

For active frontend hot-reload during development, run `npx vite` alongside `npm run dev` (Vite proxies `/api` requests to the backend).

---

## Environment Variables Reference

| Variable | Description | Example / Default |
|---|---|---|
| `PORT` | HTTP server port | `3000` |
| `APP_URL` | Public base URL (used in invite & notification emails) | `http://localhost:3000` |
| `JWT_SECRET` | Secret used to sign `httpOnly` auth cookies | *(required strong secret)* |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://bugsted:bugsted123@localhost:5432/bugsted` |
| `ADMIN_EMAIL` | Initial admin email created if users table is empty | `admin@example.com` |
| `ADMIN_PASSWORD` | Initial admin password | `ChangeMe123!` |
| `SMTP_HOST` / `SMTP_PORT` | Outgoing SMTP server & port (`465` for SSL, `587` STARTTLS) | `smtp.example.com` / `587` |
| `SMTP_USER` / `SMTP_PASS` | SMTP authentication credentials | `noreply@example.com` |
| `S3_ENDPOINT` *(or `MINIO_ENDPOINT`)* | S3 / MinIO host (no `https://`) | `minio` or `s3.amazonaws.com` |
| `S3_PORT` *(or `MINIO_PORT`)* | S3 / MinIO API port | `9000` or `443` |
| `S3_USE_SSL` *(or `MINIO_USE_SSL`)* | Use HTTPS for object storage | `false` or `true` |
| `S3_BUCKET` *(or `MINIO_BUCKET`)* | Bucket name (created automatically if missing) | `bugsted` |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | S3 / MinIO access credentials | *(your keys)* |
| `S3_REGION` | S3 bucket region | `us-east-1` |
| `S3_PATH_STYLE` | Use path-style URLs (`true` for MinIO, `false` for AWS virtual-hosted) | `true` |
| `GITHUB_TOKEN` | GitHub PAT (`repo` scope) for Issues sync & AI codebase reads | *(optional)* |
| `GITHUB_WEBHOOK_SECRET` | Secret configured on GitHub webhooks (`/api/webhooks/github`) | *(optional)* |
| `AI_API_URL` | Any OpenAI-compatible Chat Completions URL | `https://api.openai.com/v1/chat/completions` |
| `AI_API_KEY` | Bearer token for the AI endpoint (optional for local Ollama/vLLM) | *(optional)* |
| `AI_MODELS` | Comma-separated list of model IDs shown in the UI selector | `gpt-4o-mini,gpt-4o` |

---

## Documentation

- **[User Guide](docs/USER_GUIDE.md)** — step-by-step instructions for reporting bugs, screen recording, AI code analysis, team roles, GitHub sync, and language/notification settings.
- **[Self-Hosting & Deployment Guide](docs/DEPLOYMENT.md)** — production setup with Docker Compose, Nginx/Caddy, S3/MinIO, OpenAI/OpenRouter/Ollama/LM Studio, and GitHub Webhooks.
- **Source & Releases:** [https://github.com/arturwyroslak/BUGSTED](https://github.com/arturwyroslak/BUGSTED)

---

## Contributing

Contributions, feature suggestions, bug reports, UI improvements, and new language translations are warmly welcome! BUGSTED is community-driven — if you have an idea to make self-hosted bug tracking faster or smarter, we'd love to collaborate.

1. **Fork** the repository on GitHub: [github.com/arturwyroslak/BUGSTED](https://github.com/arturwyroslak/BUGSTED)
2. Create a feature branch (`git checkout -b feat/your-improvement`)
3. Commit your changes with clear messages (`git commit -m "Add your improvement"`)
4. Push to your fork and open a **Pull Request**

Not ready to write code yet? Open an issue in **[GitHub Issues](https://github.com/arturwyroslak/BUGSTED/issues)** to propose enhancements, report bugs, or start a discussion.

---

## License

MIT
