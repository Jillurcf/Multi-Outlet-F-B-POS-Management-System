#!/usr/bin/env sh
set -eu

for name in POSTGRES_PASSWORD JWT_SECRET CORS_ORIGIN WEB_DOMAIN API_DOMAIN ACME_EMAIL VITE_API_URL; do
  if [ -z "$(printenv "$name" || true)" ]; then
    echo "Missing required environment variable: $name" >&2
    exit 1
  fi
done

docker compose -f docker-compose.prod.yml config >/dev/null
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d postgres
docker compose -f docker-compose.prod.yml run --rm api npm run prisma:migrate:deploy -w @pos/api
docker compose -f docker-compose.prod.yml up -d

api_url="https://${API_DOMAIN}/api/health"
web_url="https://${WEB_DOMAIN}"
attempt=1

while [ "$attempt" -le 30 ]; do
  if curl -fsS "$api_url" >/dev/null 2>&1 && curl -fsS "$web_url" >/dev/null 2>&1; then
    echo "Deployment verified: $web_url and $api_url"
    exit 0
  fi

  sleep 10
  attempt=$((attempt + 1))
done

echo "Deployment verification failed. Check: docker compose -f docker-compose.prod.yml ps" >&2
exit 1
