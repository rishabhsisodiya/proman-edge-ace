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
to touch prod data. Same reasoning applies to Redis — dev already uses Redis (default DB `/0`, via
`erp-cache.service.ts` for ERPNext dashboard caching), so prod must use a **different logical DB
index** on the same instance (or a separate instance) to stay isolated — sharing DB `/0` risks a
dev test polluting/colliding with prod cache keys, and matters even more once BullMQ (queued
notifications) lands on either side.

```bash
sudo -u postgres psql -c "CREATE USER proman_edge_prod WITH PASSWORD '<generate a strong password>';"
sudo -u postgres psql -c "CREATE DATABASE proman_ace_prod OWNER proman_edge_prod;"
```

Verify before moving on:

```bash
PGPASSWORD='<password>' psql -h 127.0.0.1 -U proman_edge_prod -d proman_ace_prod -c "SELECT 1;"
```

---

## Clone and configure (Doppler — no `.env` files on the prod server)

```bash
git clone <proman-edge-repo-url> /root/proman-edge-ace-prod
```

### Doppler project setup (one-time)

Uses the **same Doppler project as PROMAN** (`proman`), in a separate config named `prd_ace` for
`proman-edge`'s production secrets. The deploy script (`scripts/proman-edge-prod.sh`) points at
`--project proman --config prd_ace` to match. Populate it with everything both the backend and
frontend need (`NEXT_PUBLIC_*` values included, since the frontend build must run under `doppler
run` too):

```
DATABASE_URL=postgresql://proman_edge_prod:<password>@localhost:5432/proman_ace_prod?schema=public
JWT_SECRET=<generate a separate long random string — do not reuse dev's>
PORT=4001
FRONTEND_URL=https://<prod-domain>          # must exactly match the origin the browser uses, incl. scheme
REDIS_URL=redis://localhost:6379/1          # index 1, NOT the default /0 dev already uses
ERP_DB_HOST=<prod PISPL MariaDB host>
ERP_DB_PORT=<port>
ERP_DB_NAME=<db name>
ERP_DB_USER=<db user>
ERP_DB_PASSWORD=<prod ERPNext creds — see "Open items" below, test creds only exist today>
ERP_DB_SSL=false
FRAPPE_BASE_URL=<prod ERPNext instance URL>
NEXT_PUBLIC_API_URL=https://<prod-domain>/api/v1
NEXT_PUBLIC_BACKEND_URL=https://<prod-domain>
```

Generate a **service token** for the `prd_ace` config (Doppler dashboard → Project `proman` →
Config `prd_ace` → Access → Service Tokens), then store it on the server, outside any git repo:

```bash
mkdir -p /root/.proman-edge-secrets
cat > /root/.proman-edge-secrets/doppler.env <<'EOF'
DOPPLER_TOKEN_PROD=dp.st.prd_ace.xxxxxxxxxxxx
EOF
chmod 600 /root/.proman-edge-secrets/doppler.env
```

### First build

```bash
chmod +x /root/proman-edge-ace-prod/scripts/proman-edge-prod.sh
cd /root/proman-edge-ace-prod
./scripts/proman-edge-prod.sh check     # verify Doppler secrets are reachable
./scripts/proman-edge-prod.sh deploy    # git pull (no-op on first run) + npm install + doppler-wrapped build for both apps
ls backend/dist/src/main.js             # confirm build output lands here, not dist/main.js
```

`npx prisma db seed` — only run this manually and deliberately if you want seed/demo users in prod;
usually skip it.

---

## PM2

Repo root's `ecosystem.prod.config.js` now runs both processes through `doppler run` rather than a
static `env` block — the `DOPPLER_TOKEN` env var (sourced from `/root/.proman-edge-secrets/doppler.env`)
is what lets pm2's own process pick up secrets at runtime, separate from the build-time `doppler run`
wrapping done in the deploy step above:

```js
module.exports = {
  apps: [
    {
      name: 'proman-prod-backend',
      cwd: '/root/proman-edge-ace-prod/backend',
      script: 'doppler',
      args: 'run -- node dist/src/main.js',
      env: { NODE_ENV: 'production', PORT: '4001', DOPPLER_TOKEN: process.env.DOPPLER_TOKEN }
    },
    {
      name: 'proman-prod-frontend',
      cwd: '/root/proman-edge-ace-prod/frontend',
      script: 'doppler',
      args: 'run -- npm run start -- -p 3001',
      env: { NODE_ENV: 'production', PORT: '3001', DOPPLER_TOKEN: process.env.DOPPLER_TOKEN }
    }
  ]
}
```

Before starting: confirm PROMAN's old `proman-prod-backend`/`proman-prod-frontend` PM2 processes
are stopped, since they hold ports 4001/3001 today — `proman-edge` prod fully replaces PROMAN prod
on these same pm2 names/ports, it isn't running alongside it.

```bash
source /root/.proman-edge-secrets/doppler.env
export DOPPLER_TOKEN=$DOPPLER_TOKEN_PROD

./scripts/proman-edge-prod.sh delete    # stops/removes any proman-prod-backend/frontend already registered (old PROMAN or a prior attempt)
./scripts/proman-edge-prod.sh start
```

### Everyday redeploy (after `git push`)

```bash
cd /root/proman-edge-ace-prod
./scripts/proman-edge-prod.sh deploy
```

### If you ever edit `ecosystem.prod.config.js` itself (script/args/env)

A `deploy`/`reload` will NOT pick up ecosystem file changes — pm2 only re-reads `script`/`args`/`env`
on fresh registration:

```bash
./scripts/proman-edge-prod.sh delete
./scripts/proman-edge-prod.sh start
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
./scripts/proman-edge-prod.sh status
./scripts/proman-edge-prod.sh logs
```

---

## Open items before this can actually go live

- nginx/TLS termination for `<prod-domain>` → ports 3001 (frontend) / 4001 (backend, or proxied
  under `/api`)
- Decommission PROMAN's old prod PM2 processes (ports 4001/3001 currently in use)
- Populate the `proman` Doppler project's `prd_ace` config with the full secret list, generate the
  service token, store it at `/root/.proman-edge-secrets/doppler.env` (see "Clone and configure"
  above) — not done yet
- Real ERPNext production API credentials (`ERPNEXT_API_KEY`/`ERPNEXT_API_SECRET`,
  `ERPNEXT_WEBHOOK_SECRET`) — test-server credentials only exist today, per the main README's
  "Known open items"
- Decide whether to seed prod with demo/seed users at all, or start with a clean admin-only DB
- Redis: confirm prod uses DB index `/1` (or a separate instance), not dev's default `/0`
