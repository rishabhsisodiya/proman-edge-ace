# Deployment Guide

Covers deploying proman-edge on the same instance as PROMAN. Two slots:

- **Dev** — `/root/proman-edge-ace`, ports 4000 (backend) / 3000 (frontend). Already live, replaced
  the old PROMAN dev deployment.
- **Prod** — `/root/proman-edge-ace-prod`, ports 4001 (backend) / 3001 (frontend). Reuses the ports
  PROMAN's prod deployment currently occupies — **cannot be started until PROMAN prod is stopped/
  decommissioned**, and requires nginx/TLS in front before login will actually work (see note
  below on `NODE_ENV` and cookies).

---

## Prerequisites (shared by dev and prod)

Postgres and Redis are installed once and shared; each environment gets its own DB/role.

```bash
sudo apt update
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql

redis-cli ping || (sudo apt install -y redis-server && sudo systemctl enable --now redis-server)
```

---

## Prod database setup

Use a **separate DB and role from dev** — a bad migration or seed run in dev should never be able
to touch prod data.

```bash
sudo -u postgres psql -c "CREATE USER proman_edge_prod WITH PASSWORD '<generate a strong password>';"
sudo -u postgres psql -c "CREATE DATABASE proman_ace_prod OWNER proman_edge_prod;"
```

Verify before moving on:

```bash
PGPASSWORD='<password>' psql -h 127.0.0.1 -U proman_edge_prod -d proman_ace_prod -c "SELECT 1;"
```

---

## Clone and configure

```bash
git clone <proman-edge-repo-url> /root/proman-edge-ace-prod
cd /root/proman-edge-ace-prod/backend
cp .env.example .env
```

Edit `backend/.env`:

```
DATABASE_URL="postgresql://proman_edge_prod:<password>@localhost:5432/proman_ace_prod?schema=public"
JWT_SECRET=<generate a separate long random string — do not reuse dev's>
PORT=4001
FRONTEND_URL=https://<prod-domain>          # must exactly match the origin the browser uses, incl. scheme
REDIS_URL=redis://localhost:6379
ERP_DB_HOST=<HOST HERE>
ERP_DB_PORT=<PORT>
ERP_DB_NAME=<DB_NAME>
ERP_DB_USER=<DB_USER>
ERP_DB_PASSWORD=<from PROMAN's backend/.env, or prod ERPNext creds once issued>
ERP_DB_SSL=false
FRAPPE_BASE_URL=http://187.127.182.29:8000
```

Then:

```bash
npm install
npx prisma migrate deploy
npx prisma db seed        # only if you want seed/demo users in prod — usually skip this
npm run build
ls dist/src/main.js       # confirm build output lands here, not dist/main.js
```

Frontend:

```bash
cd /root/proman-edge-ace-prod/frontend
```

Edit `.env.local`:

```
NEXT_PUBLIC_API_URL=https://<prod-domain>/api/v1
NEXT_PUBLIC_BACKEND_URL=https://<prod-domain>
```

```bash
npm install
npm run build
```

---

## PM2

Repo root already has `ecosystem.prod.config.js`:

```js
module.exports = {
  apps: [
    {
      name: 'proman-prod-backend',
      cwd: '/root/proman-edge-ace-prod/backend',
      script: 'dist/src/main.js',
      env: { NODE_ENV: 'production', PORT: '4001' }
    },
    {
      name: 'proman-prod-frontend',
      cwd: '/root/proman-edge-ace-prod/frontend',
      script: 'npm',
      args: 'run start -- -p 3001',
      env: { NODE_ENV: 'production', PORT: '3001' }
    }
  ]
}
```

Before starting: confirm PROMAN's old `proman-prod-backend`/`proman-prod-frontend` PM2 processes
are stopped, since they hold ports 4001/3001 today.

```bash
pm2 stop proman-prod-backend proman-prod-frontend
pm2 delete proman-prod-backend proman-prod-frontend

cd /root/proman-edge-ace-prod
pm2 start ecosystem.prod.config.js
pm2 save
```

---

## Important: `NODE_ENV=production` requires HTTPS in front

`backend/src/auth/auth.controller.ts:18-23` sets login cookies with `secure: true` whenever
`NODE_ENV === 'production'`. Browsers silently drop `Secure` cookies over plain HTTP — login will
appear to succeed (200 response, user JSON comes back) but the session never sticks and the app
bounces back to `/login`. This bit us on the dev deployment before nginx was set up (dev was
switched to `NODE_ENV=development` as a stopgap — see `ecosystem.config.js`).

**Do not start the prod PM2 processes until nginx + TLS is actually terminating HTTPS in front of
port 3001/4001** (or a reverse proxy that forwards `https://<prod-domain>` to those ports).
Starting prod over plain HTTP will reproduce the same silent-login-failure bug dev hit.

---

## Verify

```bash
curl -i https://<prod-domain>/api/v1/auth/login   # or via nginx path, once TLS is live
pm2 status
pm2 logs proman-prod-backend --lines 50
pm2 logs proman-prod-frontend --lines 50
```

---

## Open items before this can actually go live

- nginx/TLS termination for `<prod-domain>` → ports 3001 (frontend) / 4001 (backend, or proxied
  under `/api`)
- Decommission PROMAN's old prod PM2 processes (ports 4001/3001 currently in use)
- Real ERPNext production API credentials (`ERPNEXT_API_KEY`/`ERPNEXT_API_SECRET`,
  `ERPNEXT_WEBHOOK_SECRET`) — test-server credentials only exist today, per the main README's
  "Known open items"
- Decide whether to seed prod with demo/seed users at all, or start with a clean admin-only DB
