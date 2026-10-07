# Live session Worker

Cloudflare Worker + Durable Object that stores one shared festival room JSON per `room` id (drafts, contributions, draft SVGs, live cue).

## API

| Method | Path | Auth |
|--------|------|------|
| `GET` | `/rooms/:room` | Public (wall / hydrate) |
| `PUT` | `/rooms/:room` | `Authorization: Bearer <token>` or `?token=` when `LIVE_WRITE_TOKEN` is set |
| `DELETE` | `/rooms/:room` | Same as PUT — clears the room |

## Deploy

```bash
cd workers/live-session
npm install
npx wrangler login
npx wrangler secret put LIVE_WRITE_TOKEN   # shared write token for desks
npm run deploy
```

Copy the Worker URL (e.g. `https://grid-workshop-live.<account>.workers.dev`) into the app:

- Local: `.env.local` → `VITE_LIVE_SESSION_URL=https://…`
- GitHub Pages: repository variable / Actions env `VITE_LIVE_SESSION_URL` (see root workflow)

Facilitator Options (studio or workshop gear): set **Room** (default `lettermans`), **Write token**, **Station** (`a` / `b`), copy wall link, clear room.

## Local Worker

```bash
npm run dev   # wrangler dev — usually http://127.0.0.1:8787
```

Optional local secret file (gitignored): `.dev.vars` with `LIVE_WRITE_TOKEN=…`.

Point the Vite app at that URL with `VITE_LIVE_SESSION_URL`.

## Smoke

From repo root (Worker running on 8787):

```bash
LIVE_WRITE_TOKEN=test-secret npm run smoke:live
npm run smoke:live-client
# also start Vite with VITE_LIVE_SESSION_URL=http://127.0.0.1:8787
LIVE_WRITE_TOKEN=test-secret npm run smoke:live-e2e
```
