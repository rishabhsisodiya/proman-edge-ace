#!/bin/bash
# Usage: ./scripts/proman-edge-prod.sh <check|delete|start|deploy|status|logs> [backend|frontend]
#
# prod-only — dev still runs on a plain backend/.env (no Doppler), unchanged.
# Mirrors PROMAN/scripts/proman.sh's pattern for consistency.

set -e

ACTION=$1
TARGET=${2:-all}   # only used by deploy: all | backend | frontend

if [ -z "$ACTION" ]; then
  echo "Usage: $0 <check|delete|start|deploy|status|logs> [backend|frontend]"
  exit 1
fi

[ -f /root/.proman-edge-secrets/doppler.env ] && source /root/.proman-edge-secrets/doppler.env

ROOT=/root/proman-edge-ace-prod
ECOSYSTEM=/root/proman-edge-ace-prod/ecosystem.prod.config.js
DOPPLER_PROJECT=proman-edge
DOPPLER_CONFIG=prd
DOPPLER_TOKEN=${DOPPLER_TOKEN_PROD:?DOPPLER_TOKEN_PROD not set in /root/.proman-edge-secrets/doppler.env}
BACKEND=proman-prod-backend
FRONTEND=proman-prod-frontend

export DOPPLER_TOKEN

check() {
  echo "==> Checking Doppler secrets for [$DOPPLER_CONFIG]..."
  doppler secrets --project "$DOPPLER_PROJECT" --config "$DOPPLER_CONFIG" --token="$DOPPLER_TOKEN"
}

delete() {
  echo "==> Deleting pm2 processes [$BACKEND, $FRONTEND]..."
  # Also clears out PROMAN's OLD prod processes of the same name, if they're
  # still registered — proman-edge prod fully replaces PROMAN prod on these
  # ports/names, see docs/DEPLOYMENT.md.
  pm2 delete "$BACKEND" "$FRONTEND" || true
}

start() {
  echo "==> Starting pm2 processes from $ECOSYSTEM..."
  pm2 start "$ECOSYSTEM"
  pm2 save
}

deploy() {
  echo "==> Pulling latest code..."
  cd "$ROOT"
  BRANCH=$(git rev-parse --abbrev-ref HEAD)
  git pull origin "$BRANCH"

  build_backend() {
    echo "==> Building backend..."
    cd "$ROOT/backend"
    npm install
    doppler run --project "$DOPPLER_PROJECT" --config "$DOPPLER_CONFIG" --token="$DOPPLER_TOKEN" -- npx prisma migrate deploy
    doppler run --project "$DOPPLER_PROJECT" --config "$DOPPLER_CONFIG" --token="$DOPPLER_TOKEN" -- npm run build
    echo "Backend built"
  }

  build_frontend() {
    echo "==> Building frontend..."
    cd "$ROOT/frontend"
    npm install
    # NEXT_PUBLIC_* values bake in at build time — must build under doppler run, not just run it at start.
    doppler run --project "$DOPPLER_PROJECT" --config "$DOPPLER_CONFIG" --token="$DOPPLER_TOKEN" -- npm run build
    echo "Frontend built"
  }

  case $TARGET in
    backend)
      build_backend
      pm2 reload "$BACKEND"
      ;;
    frontend)
      build_frontend
      pm2 reload "$FRONTEND"
      ;;
    all)
      build_backend
      build_frontend
      pm2 reload "$BACKEND" "$FRONTEND"
      ;;
    *)
      echo "Usage: $0 deploy [all|backend|frontend]"
      exit 1
      ;;
  esac
  pm2 status
}

status() {
  pm2 status
}

logs() {
  pm2 logs "$BACKEND" "$FRONTEND" --lines 50 --nostream
}

case $ACTION in
  check)  check ;;
  delete) delete ;;
  start)  start ;;
  deploy) deploy ;;
  status) status ;;
  logs)   logs ;;
  *)
    echo "Unknown action: $ACTION (expected check|delete|start|deploy|status|logs)"
    exit 1
    ;;
esac

echo "==> Done."
