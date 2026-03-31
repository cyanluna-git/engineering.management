# PCAS Portal

PCAS Portal is a standalone Next.js 15 App Router application under [`portal/`](./). It is the current source of truth for the portal runtime and replaces the earlier split between a Vite frontend and a separate FastAPI service.

## Structure

- `app/`: App Router pages and route handlers
- `app/api/guides`: Guide CRUD endpoints backed by the current store abstraction
- `app/api/health`: Portal health summary and optional service probe endpoint
- `app/guides`: Guide list and detail pages
- `components/portal`: Portal UI components
- `lib/services.ts`: Service catalog and link metadata
- `lib/guides-store.ts`: Current guide store provider boundary
- `Dockerfile`: Standalone Next.js runtime image

## Runtime Model

- Frontend and lightweight backend live in the same Next.js app
- Guide APIs are implemented as App Router route handlers
- Guide writes stay disabled until `PORTAL_GUIDE_WRITE_TOKEN` is configured
- `/api/health` returns route-local summary data and can probe external services with `?probe=1`
- The portal container is built from `.next/standalone`
- `docker-compose.yml` runs the portal service on port `3000`

## Environment

- `NEXT_PUBLIC_BASE_DOMAIN`: Base domain used to build internal service URLs
- `NEXT_PUBLIC_TESTRIG_URL`: Optional explicit TestRig URL override
- `PORTAL_GUIDE_WRITE_TOKEN`: Enables guide mutation endpoints when callers send `x-portal-admin-token`

## Local Development

```bash
cd portal
pnpm install
pnpm dev
```

Default local URL: `http://localhost:3000`

## Verification

```bash
cd portal
pnpm build
docker build -f Dockerfile .
```

API smoke checks:

```bash
curl http://localhost:3000/api/guides
curl http://localhost:3000/api/health
curl -X POST http://localhost:3000/api/guides \
  -H 'Content-Type: application/json' \
  -H 'x-portal-admin-token: <PORTAL_GUIDE_WRITE_TOKEN>' \
  -d '{"title":"Example","category":"IT","content":"..."}'
```

## Notes For Follow-on Cards

- Treat App Router and route handlers as the active architecture
- Do not reintroduce `portal/backend/` unless there is a clear runtime need
- If guide persistence moves to PostgreSQL later, swap the provider behind `lib/guides-store.ts` instead of rewriting the route handlers
