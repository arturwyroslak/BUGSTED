# BUGSTED — Self-Hosting & Deployment Guide

This guide covers everything you need to deploy **[BUGSTED](https://github.com/arturwyroslak/BUGSTED)** on your own server or local machine using Docker Compose or Node.js.

---

## 1. Architecture Overview

BUGSTED runs as a single Node.js service (`server/index.js`) that serves:
1. The built React SPA (`dist/`).
2. The REST + SSE API (`/api/*`).
3. Authenticated media proxy routes (`/api/files/*`) streaming screenshots and screen recordings from any S3-compatible object storage.

External dependencies:
- **PostgreSQL** (`DATABASE_URL`) for users, projects, bugs, comments, invitations, and AI suggestions.
- **MinIO or any S3-compatible storage** (`S3_*` or `MINIO_*`) for screenshots and screen recordings.
- **SMTP Server** *(optional)* for email invites and bug notifications.
- **GitHub Personal Access Token** *(optional)* for two-way GitHub Issues sync and repository inspection by the AI agent.
- **OpenAI-compatible Chat Completions Endpoint** *(optional)* for **AI Suggestion**.

---

## 2. Production Deployment with Docker Compose

### Step 1: Prepare your server

Ensure **Docker** and **Docker Compose v2** are installed:

```bash
docker --version
docker compose version
```

Clone the repository and create your environment file:

```bash
git clone https://github.com/arturwyroslak/BUGSTED.git
cd BUGSTED
cp .env.example .env
```

### Step 2: Configure `.env`

```env
PORT=3000
APP_URL="https://bugs.yourdomain.com"
JWT_SECRET="generate-at-least-48-random-characters-here"

# PostgreSQL (matches the postgres service in docker-compose.yml)
POSTGRES_USER="bugsted"
POSTGRES_PASSWORD="StrongPostgresPassword!"
POSTGRES_DB="bugsted"
DATABASE_URL="postgresql://bugsted:StrongPostgresPassword!@postgres:5432/bugsted"

# Initial Administrator Account (created once if users table is empty)
ADMIN_EMAIL="admin@yourdomain.com"
ADMIN_PASSWORD="StrongAdminPassword123!"

# SMTP Email Notifications
SMTP_HOST="smtp.yourdomain.com"
SMTP_PORT="587"
SMTP_USER="noreply@yourdomain.com"
SMTP_PASS="your-smtp-password"

# MinIO (bundled in docker-compose.yml)
S3_ENDPOINT="minio"
S3_PORT="9000"
S3_USE_SSL="false"
S3_BUCKET="bugsted"
S3_ACCESS_KEY="bugstedadmin"
S3_SECRET_KEY="StrongMinioSecret123!"
S3_REGION="us-east-1"
S3_PATH_STYLE="true"
```

### Step 3: Start the containers

```bash
docker compose up -d --build
```

Check health:

```bash
curl http://localhost:3000/api/health
```

---

## 3. Object Storage Configuration (MinIO or Any S3)

BUGSTED uses the `minio` S3 client configured via `S3_*` environment variables (legacy `MINIO_*` names are also supported as fallbacks).

### Option A: Bundled MinIO (Default)
```env
S3_ENDPOINT="minio"
S3_PORT="9000"
S3_USE_SSL="false"
S3_BUCKET="bugsted"
S3_ACCESS_KEY="bugstedadmin"
S3_SECRET_KEY="StrongMinioSecret123!"
S3_REGION="us-east-1"
S3_PATH_STYLE="true"
```

### Option B: AWS S3
```env
S3_ENDPOINT="s3.eu-central-1.amazonaws.com"
S3_PORT="443"
S3_USE_SSL="true"
S3_BUCKET="your-bugsted-bucket"
S3_ACCESS_KEY="AKIA..."
S3_SECRET_KEY="your-aws-secret-key"
S3_REGION="eu-central-1"
S3_PATH_STYLE="false"
```

### Option C: Cloudflare R2
```env
S3_ENDPOINT="<account-id>.r2.cloudflarestorage.com"
S3_PORT="443"
S3_USE_SSL="true"
S3_BUCKET="bugsted"
S3_ACCESS_KEY="<r2-access-key-id>"
S3_SECRET_KEY="<r2-secret-access-key>"
S3_REGION="auto"
S3_PATH_STYLE="true"
```

### Option D: DigitalOcean Spaces / Backblaze B2 / Self-Hosted Garage / Ceph
```env
S3_ENDPOINT="fra1.digitaloceanspaces.com"
S3_PORT="443"
S3_USE_SSL="true"
S3_BUCKET="bugsted-media"
S3_ACCESS_KEY="<spaces-key>"
S3_SECRET_KEY="<spaces-secret>"
S3_REGION="fra1"
S3_PATH_STYLE="false"
```

> **Note:** On startup, BUGSTED automatically checks whether `S3_BUCKET` exists and creates it if necessary (if your IAM credentials grant `s3:CreateBucket`). Otherwise, create the bucket beforehand in your S3 provider console. You can verify connectivity any time in **Admin Panel** via the `S3 / MinIO` health badge.

---

## 4. Configuring AI Endpoints (`AI Suggestion`)

BUGSTED works with **any** endpoint implementing the OpenAI `POST /v1/chat/completions` schema (`messages`, `model`, `temperature`). The AI agent automatically respects the user's active UI language when generating suggestions.

### OpenAI
```env
AI_API_URL="https://api.openai.com/v1/chat/completions"
AI_API_KEY="sk-..."
AI_MODELS="gpt-4o-mini,gpt-4o,o3-mini"
```

### OpenRouter
```env
AI_API_URL="https://openrouter.ai/api/v1/chat/completions"
AI_API_KEY="sk-or-v1-..."
AI_MODELS="anthropic/claude-3.5-sonnet,openai/gpt-4o-mini,google/gemini-2.0-flash-001"
```

### Local Ollama (No API Key Required)
When running BUGSTED on Docker alongside Ollama on the host (`host.docker.internal`):
```env
AI_API_URL="http://host.docker.internal:11434/v1/chat/completions"
AI_API_KEY=""
AI_MODELS="qwen2.5-coder:14b,llama3.1:8b"
```

### LM Studio / vLLM / LiteLLM / Pollinations
```env
AI_API_URL="http://localhost:1234/v1/chat/completions"
AI_API_KEY=""
AI_MODELS="local-model"
```

> Users can also select **Custom model ID...** directly inside the **AI Suggestion** block on any bug page to test another model supported by your endpoint.

---

## 5. GitHub Integration & Two-Way Webhooks

1. Create a GitHub Personal Access Token (Fine-grained or Classic with `repo` access).
2. Add it to `.env`:
   ```env
   GITHUB_TOKEN="your-github-personal-access-token"
   GITHUB_WEBHOOK_SECRET="strong-random-webhook-secret"
   ```
3. In BUGSTED **Admin Panel -> Applications / Projects**, edit an application, select its GitHub repository, and enable **Sync bugs with GitHub Issues (two-way)**.
4. To enable instant **GitHub -> BUGSTED** status updates when an issue is closed or reopened on GitHub:
   - Open your repository on GitHub -> **Settings -> Webhooks -> Add webhook**.
   - **Payload URL:** `https://bugs.yourdomain.com/api/webhooks/github`
   - **Content type:** `application/json`
   - **Secret:** exact value of `GITHUB_WEBHOOK_SECRET`
   - **Events:** select **Issues** (at minimum).

---

## 6. Reverse Proxy with HTTPS (Nginx / Caddy)

### Caddy (Automatic HTTPS)
```caddy
bugs.yourdomain.com {
    reverse_proxy 127.0.0.1:3000
}
```

### Nginx
Be sure to increase `client_max_body_size` so large screen recordings and screenshot batches are not rejected, and disable proxy buffering so Server-Sent Events (SSE) for live AI progress stream smoothly:

```nginx
server {
    listen 80;
    server_name bugs.yourdomain.com;

    client_max_body_size 150M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Required for SSE AI Suggestion live streaming
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
    }
}
```

---

## 7. Multi-Language Support

BUGSTED automatically detects the visitor's browser language (`en`, `pl`, `es`, `de`, `fr`, `ar`, `zh`) on load and switches to `dir="rtl"` automatically when Arabic (`ar`) is selected.

- Users on the login or invite page can switch languages immediately using the selector in the top corner.
- Signed-in users can change or lock their preferred language (or revert to browser auto-detection) under **Settings -> Interface Language** (`PUT /api/settings/language`).

---

## 8. Database Backup & Restore

Back up your PostgreSQL database from Docker Compose:

```bash
docker exec bugsted-postgres pg_dump -U bugsted bugsted > backup_$(date +%F).sql
```

Restore:

```bash
cat backup_YYYY-MM-DD.sql | docker exec -i bugsted-postgres psql -U bugsted bugsted
```
