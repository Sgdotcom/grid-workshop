# Archived: write-token facilitator UX (7 Oct 2026)

Superseded by **Join session** (same room name, no password).

Removed from the product UI:

- Facilitator “Write token” / station text fields on studio + workshop Options
- Requirement that desks paste `LIVE_WRITE_TOKEN` for festival install
- Wall without a room control (wall now has Join session)

Still supported optionally (not required for Beckmans):

- Worker env `LIVE_WRITE_TOKEN` if you re-lock PUT/DELETE
- Client `VITE_LIVE_WRITE_TOKEN` / `?token=` for that locked mode
- `?station=a|b` on studio URLs (Computer A / B toolbar links)

Current path: Cloudflare Durable Object room + WebSocket push; see `workers/live-session/README.md` and `docs/festival.md`.
