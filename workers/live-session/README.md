# Live session Worker

Cloudflare Worker + Durable Object that stores one shared festival room JSON per `room` id (drafts, contributions, draft SVGs, live cue).

## API

| Method | Path | Auth |
|--------|------|------|
| `GET` | `/rooms/:room` | Public |
| `GET` | `/rooms/:room/ws` | Public WebSocket — initial snapshot + push on PUT/DELETE |
| `PUT` | `/rooms/:room` | Public unless `LIVE_WRITE_TOKEN` is set |
| `DELETE` | `/rooms/:room` | Same as PUT, plus matching `X-Clear-Password`; requires configured `CLEAR_ROOM_PASSWORD` — archives the room, then clears it |
| `GET` | `/rooms/:room/archives` | Public — list of archived (cleared) sessions |
| `GET` | `/rooms/:room/archives/:id` | Public — one archived room |
| `POST` | `/rooms/:room/archives/:id/restore` | Same as DELETE — replaces the room with the archive |

Festival install runs **without** a write token so desks/wall only need the same room name + **Join session**. Realtime uses Durable Object WebSockets (Cloudflare free tier).

## Deploy

```bash
cd workers/live-session
npm install
npx wrangler login
npm run deploy
# facilitator password for Clear / restore (the repo is public: never commit it)
npx wrangler secret put CLEAR_ROOM_PASSWORD
# optional lock: npx wrangler secret put LIVE_WRITE_TOKEN
```

Clear and restore are fail-closed: until `CLEAR_ROOM_PASSWORD` is configured, the Worker returns 503 for either action. A wrong or missing supplied password returns 403. Public reading and painting remain available unless a write token is configured.

Copy the Worker URL into the app:

- Local: `.env.local` → `VITE_LIVE_SESSION_URL=https://…`
- GitHub Pages: repository variable `VITE_LIVE_SESSION_URL`

In the app: **Join session** (room default `boom`) on desks and wall.

## Local Worker

```bash
npm run dev   # wrangler dev — usually http://127.0.0.1:8787
```

Optional local secret file (gitignored): `.dev.vars` with `CLEAR_ROOM_PASSWORD=…` and/or `LIVE_WRITE_TOKEN=…`.

Point the Vite app at that URL with `VITE_LIVE_SESSION_URL`.

## Smoke

From repo root (Worker URL set; festival Worker is open/no token). Export `CLEAR_ROOM_PASSWORD` when the Worker enforces it:

```bash
npm run smoke:live -- https://grid-workshop-live.sgdotcom.workers.dev
npm run smoke:live-ws -- https://grid-workshop-live.sgdotcom.workers.dev
npm run smoke:live-client
# Vite or Pages + VITE_LIVE_SESSION_URL=…
npm run smoke:live-e2e -- http://127.0.0.1:43127/
npm run smoke:live-ops -- http://127.0.0.1:43127/
```
