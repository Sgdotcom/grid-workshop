# Grid workshop — handover (8 October 2026)

For a colleague reviewing **welding / Softness** and related app work with Claude Code. Start with [`CLAUDE.md`](CLAUDE.md); this file is the full status.

Older handovers are archived (do not follow them as current instructions):

- [`docs/archive/handovers/2026-10-07/`](docs/archive/handovers/2026-10-07/) — previous root `HANDOVER.md`, `CHANGES.md`, `DEADCODE.md`
- [`docs/archive/handovers/2026-10-01/`](docs/archive/handovers/2026-10-01/) — earlier ChatGPT / Gemini / blend handoffs

---

## What this project is

Phone-first **shape-grid** letter tool for the Beckmans festival. Stamp modules → Softness fuse → contribute letters → wall projection → SVG / OTF export. React 19 + Vite + TypeScript + Tailwind + `polygon-clipping` + opentype.js. Session: `localStorage` (`FESTIVAL_KEY`).

## Current focus for review

1. **Mixed-shape welding** — preview-approved methods wired into production `blendPairPolygons`.
2. **Per-shape melt-off** — UI toggle so Softness does not grow necks for chosen brushes.
3. **Install layouts + live room** — studio desk at `/`, wall at `?view=projection`, Cloudflare live room for cross-machine sync (see *Live room* below).
4. **Ring holes vs Gaps** — Gaps fill/solid must not seal ring centres.

---

## Welding — what landed recently

### Mixed-pair registry (17/18 lab picks)

Defined in `src/lib/shapeJoinRegistry.ts` as `MIXED_PAIR_METHODS` (sorted `presetA|presetB` keys).

| Method | Count (user pick) | Runtime |
|--------|-------------------|---------|
| Organic weld (`weld`) | 9 | `organicWeld` bridges |
| Offset melt (`offset`) | 4 | `fieldBlendRings` … `'offset'` |
| SDF melt (`sdf`) | 2 | `fieldBlendRings` … `'sdf'` |
| Current (`current`) | 2 | Legacy mixed blend |
| *(unlisted)* | rest | Legacy mixed blend |

Examples of picks: triangle↔square → weld; star↔square → offset; cross↔circle → sdf; arc↔triangle → current; wedge↔notch → current.

**Preview lab (unchanged by workshop until regenerated):**  
`http://127.0.0.1:43127/docs/mixed-weld-preview.html`  
`node scripts/render-mixed-weld-preview.mjs`

### Per-shape “Melt off”

- Storage: `gridz-melt-off-presets-v1`
- Helpers: `loadMeltOffPresets`, `togglePresetMeltOff`, `isPresetMeltOff`
- UI: Softness panel in **studio** and main **Paint** — `Melt on · {shape}` / `No melt · {shape}`; red dot on shape tiles in studio
- Behaviour: no Softness **neck** across a gap; stamps that already touch still **boolean-union**. Affects any pair involving that preset (same or mixed).

We considered hard-disabling welds for forked/open-mouth pairs; instead melt-off is **user-controlled** so lab picks stay available.

### Ring holes + Gaps modes

`filterPolygonHolesPreserving` + `intentionalHoleCutters` in `polyBool.ts`, used from Softness finish, Canvas crisp/punch paths, and `export.glyphPolygons`. Gaps `solid` / `no-gaps` re-punch ring centres after hole filtering.

### Earlier approved (still live)

- Arc ↔ flat (`arcFlatBlend.ts`) for orthogonal arc–square/rect and opposing arcs
- Consistent module sizing after rounding (`shapes.ts`)
- Smooth capsule sampling
- Softness finish memoisation (`finishCacheKey` — must include every fuse input)

---

## Architecture — fuse path

```
stamps (makeSoftStamp)
  → collectNeighborPairs (pairCanFuse / blendStrength / brokenJoins)
  → connectedComponents
  → fuseComponentPolygons
       → blendPairPolygons per edge (+ stamp bodies)
       → union (arc components use guarded unionArcWelds)
  → optional filterPolygonHolesPreserving
```

**`blendPairPolygons` order (simplified):**

1. Distance gate  
2. **Melt-off** → `[]` (no neck)  
3. **Arc/flat** special case  
4. Same preset → `joinSamePreset`  
5. Mixed registry method / fork-weld / legacy  

Same-preset circle/ring: always dedicated metaball / ring join.

### Engine modes (`getJoinEngineMode`)

| Mode | Meaning |
|------|---------|
| `main` (default) | Per-shape registry + mixed-pair table |
| `fork-weld` | Prefer organic weld |
| `fork-current` | Legacy workshop path; skips mixed registry |

---

## Install views

| URL | Role |
|-----|------|
| `/` (also `?view=studio`) | Studio desk: canvas \| tools (drag-resize) \| alphabet |
| `/?view=workshop` | Full workshop (Shape / Paint / Export) |
| `/?view=projection` | Wall: alphabet, Desk A / Desk B live panes, specimen (`?view=wall` redirects here) |
| `/?view=join-lab` | Join method lab |

`localStorage` is the cache. With `VITE_LIVE_SESSION_URL`, desks and wall **Join session** (same room name, default `boom`) and sync via Cloudflare Durable Object WebSockets (`workers/live-session/`), with a slow GET fallback. Alphabet tiles: published SVG → else draft/live SVG. No write token for the festival install. A desk asks **Which desk is this?** (A / B) on first visit and stores it in `gridz-live-station`; `?station=` overrides it.

The grid is per letter in both editors: changing shape or size affects the open letter only, and an empty letter starts with the grid the desk used last.

Studio details worth knowing: resizable tools rail (`gridz-studio-tools-width`), grouped tools (Draw / Show / Mode / Look / Shape), melt-off chip under Softness.

Festival ops: [`docs/festival.md`](docs/festival.md). Worker deploy: [`workers/live-session/README.md`](workers/live-session/README.md). Visitor one-pager: [`docs/classmate-howto.md`](docs/classmate-howto.md).

### Live room — how sync works

- **Room state** lives in a Durable Object. Every PUT merges into the room and is broadcast to all sockets. GET stays public for the wall.
- **Same letter on two desks is allowed.** There are no locks. Each letter has its own `draftUpdatedAt` clock and the newer edit wins (`remoteDraftIsNewer`, strict `>`). A desk that is mid-stroke keeps its ink and wins with its next push.
- **A letter's clock moves only on a local edit.** `writeSession` compares the letter with `clockBaseRef` (`letterUnchanged`), which is reset when a letter is opened, adopted from a peer, cleared or wiped. Without this, a remote update re-rendered the other desk, which restamped and re-pushed, and two idle desks ping-ponged about 175 PUTs a minute.
- **The client skips identical pushes** (`pushContentKey` ignores timestamps and presence) and retries failed pushes with backoff (2 s, doubling up to 15 s).
- **Presence:** each desk reports `{char, since, seenAt}` every 20 s. The wall treats it as stale after 60 s (`isPresenceFresh`).
- **Wall panes:** Desk A and Desk B are always shown, plus any other station with a live cue.
- **Clear shared room / restore an archive** need the facilitator password: in the UI (the bundle holds a SHA-256 of it) and at the Worker (`X-Clear-Password`) once the secret `CLEAR_ROOM_PASSWORD` is set. **The secret is not set in production yet**, so the Worker accepts any clear until it is. The Worker archives the room before every clear; restore from the full workshop under Options → Previous sessions.
- **The repo is public: never commit the password.** Smoke scripts read it from `CLEAR_ROOM_PASSWORD`; the local Worker reads it from `workers/live-session/.dev.vars` (gitignored).

---

## Known issues / review targets

1. **Direction override key mismatch** — `DEFAULT_DIRECTION_OVERRIDES` uses `horizontal`, `diagonal-right`, etc.; `pairAxis` returns `h` / `v` / `d`. Overrides likely never apply. Fix with a mapping layer; do not break the square reference by accident.
2. **Forked / open-mouth aesthetics** — star, cross, X, chevron, wedge/notch still need visual judgement; use melt-off or a future pair `'none'` rather than deleting brushes.
3. **Field melts (SDF/offset)** are sampled (~0.65px); cost and tiny ripples remain.
4. **`scratch/`** and many `public/docs/*` pages are historical; status text inside them can lie. Prefer this handover + mixed/no-weld pages.
5. **Missing 18th lab pair** was notch↔square (never picked); unlisted → legacy blend unless melt-off.
6. **Live: edit, then switch letter quickly** — if a desk switches letters within the 250 ms push debounce, the old letter's last edit is never pushed.
7. **Live: opening a never-touched empty letter** pushes an empty draft with a fresh clock. If a peer's draft of that letter has not arrived yet, the empty one can win.
8. **Clear password strength** — the bundle ships an unsalted SHA-256 of a short password, which can be brute-forced offline. The archive taken before each clear is the safety net.

---

## How to verify

```bash
npm run typecheck
npm run lint
npm run build

# Geometry (Node)
node scripts/smoke-weld-alignment.mjs
node scripts/smoke-arc-weld.mjs
node scripts/smoke-arc-flat.mjs
node scripts/smoke-shape-sizing.mjs
node scripts/smoke-hole-mode.mjs

# With dev server
npm run smoke:install

# Live room: run against a local Worker, never production
(cd workers/live-session && npx wrangler dev --port 8788 --persist-to /tmp/gridz-wrangler-8788)
VITE_LIVE_SESSION_URL=http://127.0.0.1:8788 npx vite --port 43128 --strictPort
export CLEAR_ROOM_PASSWORD=… VITE_LIVE_SESSION_URL=http://127.0.0.1:8788
npx vite-node scripts/smoke-live-adversarial-unit.ts
node scripts/smoke-live-session.mjs http://127.0.0.1:8788
node scripts/smoke-live-studio-ops.mjs http://127.0.0.1:43128/
node scripts/smoke-live-ownership.mjs http://127.0.0.1:43128/
```

The dev server on 43127 uses `.env.local`, which points at the production Worker. `scripts/proof-festival-rooms.mjs` clears and rewrites the real `boom` room, so only run it when that is intended.

Manual:

1. Softness on triangle+square (should melt via organic weld).  
2. Select Star → **No melt · Star** → Softness should not glue star tips across gaps.  
3. Ring + Gaps solid → hole stays open.  
4. `/` and `/?view=projection` both load; drag tools rail width.
5. Two desks in one room: open the same letter on both; the newer edit shows on the other desk and on the wall.

---

## Working agreement (for Claude Code)

- Preview aesthetic weld changes in isolation before editing `softness.ts` production dispatch.  
- Keep canvas, autosave preview, word tester, SVG and OTF on the same fuse (`glyphPolygons` / `softnessFinishPolygons`).  
- Update `finishCacheKey` whenever fuse inputs grow.  
- Do not treat archived handovers or `DEADCODE.md` as a current delete checklist without re-auditing imports.  
- Do not commit / push unless the user asks.

---

## Suggested first pass for the reviewing colleague

1. Read `CLAUDE.md` + this file.  
2. Trace `blendPairPolygons` and `MIXED_PAIR_METHODS`.  
3. Open mixed-weld + no-weld preview pages with `npm run dev`.  
4. Exercise melt-off in studio.  
5. Decide whether to map `h|v|d` ↔ direction override names, and whether any mixed pairs should become `'none'` by default.
