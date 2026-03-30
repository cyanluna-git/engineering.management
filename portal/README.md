# PCAS Portal

PCAS Portal is a standalone Next.js 15 App Router application under [`portal/`](./). It is the current source of truth for the portal runtime and replaces the earlier split between a Vite frontend and a separate FastAPI service.

## Structure

- `app/`: App Router pages and route handlers
- `app/api/guides`: Guide CRUD endpoints backed by the current store abstraction
- `app/guides`: Guide list and detail pages
- `components/portal`: Portal UI components
- `lib/services.ts`: Service catalog and link metadata
- `lib/guides-store.ts`: Current guide data store abstraction
- `Dockerfile`: Standalone Next.js runtime image

## Runtime Model

- Frontend and lightweight backend live in the same Next.js app
- Guide APIs are implemented as App Router route handlers
- The portal container is built from `.next/standalone`
- `docker-compose.yml` runs the portal service on port `3000`

## Environment

- `NEXT_PUBLIC_BASE_DOMAIN`: Base domain used to build internal service URLs
- `NEXT_PUBLIC_TESTRIG_URL`: Optional explicit TestRig URL override

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

## Notes For Follow-on Cards

- Treat App Router and route handlers as the active architecture
- Do not reintroduce `portal/backend/` unless there is a clear runtime need
- If guide persistence moves to PostgreSQL later, extend `lib/guides-store.ts` behind the existing API surface
