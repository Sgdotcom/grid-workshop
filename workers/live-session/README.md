# Live session Worker

Cloudflare Worker + Durable Object that stores one shared festival room JSON per `room` id (drafts, contributions, draft SVGs, live cue).

## API

| Method | Path | Auth |
|--------|------|------|
| `GET` | `/rooms/:room` | Public |
| `GET` | `/rooms/:room/ws` | Public WebSocket — initial snapshot + push on PUT/DELETE |
| `PUT` | `/rooms/:room` | Public unless `LIVE_WRITE_TOKEN` is set |
| `DELETE` | `/rooms/:room` | Same as PUT — clears the room |

Festival install runs **without** a write token so desks/wall only need the same room name + **Join session**. Realtime uses Durable Object WebSockets (Cloudflare free tier).

## Deploy

```bash
cd workers/live-session
npm install
npx wrangler login
npm run deploy
# optional lock: npx wrangler secret put LIVE_WRITE_TOKEN
```

Copy the Worker URL into the app:

- Local: `.env.local` → `VITE_LIVE_SESSION_URL=https://…`
- GitHub Pages: repository variable `VITE_LIVE_SESSION_URL`

In the app: **Join session** (room default `lettermans`) on desks and wall.

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
