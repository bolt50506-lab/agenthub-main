# AgentHub AI — Local-First Setup

This setup keeps the main AgentHub application and the WhatsApp worker on your Windows PC, while Supabase remains the cloud database/auth/storage layer.

## Architecture

```text
Internet / browser
        |
        v
Cloudflare Tunnel (optional for public access)
        |
        +--> AgentHub Next.js :3000
        |       |
        |       +--> Supabase (cloud DB/Auth/Storage)
        |       +--> Ollama :11434 (optional local AI)
        |
        +--> WhatsApp service :8080
                |
                +--> Baileys sessions + follow-up worker
                +--> AgentHub http://localhost:3000
```

## One-time Windows setup

1. Install Node.js LTS.
2. Clone both repositories into sibling folders, for example:

```text
C:\AgentHub\agenthub-main
C:\AgentHub\agenthub-whatsapp-service
```

3. In `agenthub-main`, create `.env.local` from `.env.example` and add your existing Supabase values and any AI/provider secrets you already use. Never commit `.env.local`.
4. In `agenthub-whatsapp-service`, create `.env` with the same required Supabase/AgentHub values used by the existing WhatsApp deployment. Keep secrets out of GitHub.
5. Install dependencies in both folders:

```powershell
cd C:\AgentHub\agenthub-main
npm install

cd C:\AgentHub\agenthub-whatsapp-service
npm install
```

6. Install/start Ollama only if you want local AI. Keep it listening on `http://localhost:11434`.

## Start everything

From the `agenthub-main` folder:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-local.ps1
```

The launcher starts:

- AgentHub: `http://localhost:3000`
- WhatsApp service: `http://localhost:8080`
- Ollama: `http://localhost:11434` (if installed/running)

If the WhatsApp repository is somewhere else:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-local.ps1 -WhatsAppPath "C:\path\to\agenthub-whatsapp-service"
```

## Follow-up automation

The WhatsApp repository already contains a persistent follow-up worker. In local mode it should call AgentHub at:

```text
http://localhost:3000
```

The AgentHub follow-up endpoints accept the Railway worker identity headers used by the existing worker, so a separate Vercel/Railway cron is not required for local operation.

## Public access

`localhost` is only accessible from your PC. When you want customers to reach the application over the Internet without putting the app back on Vercel, put a Cloudflare Tunnel in front of `http://localhost:3000` and point your domain to the tunnel. Keep the WhatsApp service private on `localhost:8080`; AgentHub can reach it directly.

## Important limitation

This removes Vercel/Railway runtime limits for the local services, but the PC must remain powered on, connected to the Internet, and awake for the application, WhatsApp automation, follow-ups, Ollama, and local voice services to keep working. Supabase remains independent in the cloud.
