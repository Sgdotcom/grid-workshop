# Grid workshop — handover (9 October 2026)

For a colleague reviewing **welding / Softness** and related app work with Claude Code. Start with [`CLAUDE.md`](CLAUDE.md); this file is the full status.

Older handovers are archived (do not follow them as current instructions):

- [`docs/archive/handovers/2026-10-07/`](docs/archive/handovers/2026-10-07/) — previous root `HANDOVER.md`, `CHANGES.md`, `DEADCODE.md`
- [`docs/archive/handovers/2026-10-01/`](docs/archive/handovers/2026-10-01/) — earlier ChatGPT / Gemini / blend handoffs

---

## Local continuation — 9 October, font-design expansion

Implemented locally, without committing, pushing or deploying. Shared `FontDesignTools` is available in Workshop and both Studio desks; Studio's specimen sits below the canvas and new controls are collapsible. Mobile Workshop exposes them under Adjust.

- Per-letter `fontDesign`: thickness in pixels (slider 0–40, numeric 0–1000), outline-only, and independent horizontal/vertical/diagonal merge flags. Defaults leave current joins untouched. Direction gating adds broken-edge keys before the existing engine; Clipper offsets/difference apply weight afterwards, preserving ring centres. `glyphPolygons` remains the common final outline for Paint, previews, projection and exports.
- Preserve/stretch resizing targets only the selected letter, is undoable, retains hidden cells in preserve mode, and resamples ink and cutouts independently in stretch mode. Existing dimension controls preserve coordinates; grid-detail resampling retains its existing lattice behaviour and is now undoable.
- Character picker includes upper/lowercase Swedish letters, digits, punctuation and named custom Unicode/Private Use Area symbols. Random patterns create a new custom glyph. Creation/removal are undoable. Metadata uses clocks and deletion tombstones across desks; deleted private-use slots may be reused with newer clocks. Next-empty selection stays in the selected category. Projection adds submitted extras and keeps exactly A/B panes.
- Multiline specimen settings and family name are stored with schema v2 projects. Final-outline metrics drive proportional preview and font advances; fixed spacing remains default. Space advance is shared at 550 font units. Font vertical metrics expand to fit ink. OTF, uncompressed WOFF, glyph/alphabet/specimen SVG exports use current outlines. Font exports provide a persistent save link as well as the immediate download attempt.
- Version-1 backups migrate on read. Import validation covers geometry, symbols, settings and bounds (20 MB project limit). Unreadable autosaves stay intact; blocked storage permits editing and downloading the in-memory project. No public room data was used for tests.
- Dependency: `clipper-lib` 6.4.2, Boost Software License, with full bundled notices in `public/clipper-notices.txt`. LiquiType application code/artwork was not copied.

Validation: production build and Worker typecheck pass; lint completes with warnings. Focused geometry/data smoke, all eight direction combinations, category-next-empty, hidden-cell/stretch checks, 192 Diamond rotation frames, hole-mode guards, and Worker metadata ordering pass. Eight built-worker cases match main geometry; caller timer maximum 12 ms. FontTools independently parsed OTF/WOFF, Unicode maps, checksums, advances and extents; all three SVG variants parsed as XML. Browser checks verified custom Unicode, random undo, resize undo, same-letter A/B weight/outline synchronisation, custom submission on projection, and Studio/Workshop width at 390 px. No production dependency advisories were reported.

The in-app browser did not expose completion events for blob downloads, so automated download capture remains unverified; browser generation succeeded with a valid blob save link and no export error. The local preview dependency cache had to be refreshed after test-created Vite instances invalidated it. Production build reports a main-bundle size warning; export computation remains on the worker-backed outline path.

Before a future deployment, update the live Worker together with the frontend and reload old client tabs; v1-only clients do not understand custom symbols/schema v2. Deployment is explicitly outside this task.

---

## Local continuation — 8 October, fluid Paint joins

These changes are local and have not been committed, pushed, or deployed. The public site still needs deployment before the opening.

- Main Paint/export now use `flowBlend.ts` for applicable sharp and mixed preset pairs: rounded closing, with a gap-scaled smooth-field fallback where shapes remain separate. Original stamp bodies remain ink. Circle/Ring metaballs, accepted Diamond corners, same Square/Arc and arc-flat reference joins remain protected. Split joins, melt-off and explicit shape preferences still apply.
- Direction names now match the join registry. Square horizontal/vertical defaults preserve approved welds. Finish cache version includes the new geometry.
- Heavy geometry runs in `paintGeometry.worker.ts`, shared by Canvas, export preparation and WordTester. Stroke saving and final geometry wait until the stroke ends. Translation-independent field caching and bounded intermediate contour simplification reduce repeated sampling.
- Verification: 360 current Paint/export visual frames; 576 pair cases across four rotations, two corner settings, unequal sizes, horizontal/vertical/diagonal layouts; approved Diamond and Arc regression checks; worker/main geometry equality. Build and lint pass (existing lint warnings remain). A continuous Cross stroke was verified in the local studio and after reload, with no browser errors.
- Local worker benchmark for 12 stamps: Star/Square roughly 444 ms and Circle/Cross 289 ms, versus earlier synchronous 2570/894 ms. Caller timer stayed at 12 ms; these are local measurements, not a guarantee for festival hardware.
- Visitor/live changes: exactly two canonical A/B panes plus submitted letters, latest same-letter edit shared, publish advances to next empty letter, same-tab room-preserving navigation, and “Beckmans New Fonts Festival 2026” projection footer. Worker clear/restore fails closed when its password is missing. Production password setup is unverified.

Current user-facing comparison is task output `flow-in-paint.html`, rendered through actual `glyphPolygons`; earlier experimental labs are historical candidates. Added checks: `smoke-flow.mjs` (`FLOW_EXTRA=1` for rounded/180°/270° cases), `smoke-paint-worker.mjs`, `smoke-diamond-rotation.mjs`, live cue ordering and visitor flow smoke scripts.

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
- **Wall panes:** Desk A and Desk B are always shown. Extra stations (workshop tabs) appear only while their presence is fresh, labelled **Workshop**.
- **Workshop stations:** `?view=workshop` without `?station=` uses a per-tab `w_…` id in `sessionStorage` (`gridz-workshop-station-tab`). It never overwrites the studio's saved Desk A/B (`gridz-live-station`).
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


## Release review — 9 October 2026

All ten requested specialist reviews completed: geometry/performance, font exports, live synchronisation, history/UI, data recovery, pointer input, specimen UI, projection layout, symbols/security, and responsive starter drawings. Fixes include final-outline caching primed by the worker, pointer ownership and right-drag erasing, stale letter-history prevention, shared restore epochs, strict Unicode/clock validation and reserved deleted symbol mappings, recovery-safe autosave, specimen bounds and export locking, projection extra-character scrolling, and original compact starter patterns for small grids. Decorative emoji labels removed; Unicode custom glyph mappings remain supported.

Combined verification passed: 288 flow combinations; 456 clipping cases; 600 responsive starter cases; 300 random-symbol patterns; 1,440 pointer paths plus a 600-cell legacy stroke; 33 recovery/import checks; 118 font-design checks and eight merge combinations; 192 diamond regressions; ring/cutout tests; worker/main-outline equality and final-cache invalidation; specimen/UI tests; and client/server restore, symbol clocks, submission and presence tests. OTF and WOFF independently parsed with FontTools, SVG variants parsed as XML. Build and TypeScript passed. Lint has warnings and no errors; build has a bundle-size warning. Complex cold hollow geometry still takes time in the worker, while cached preview/export reuse is about 1 ms in the regression case.

Final browser verification in local room release-test-20261009: Desk B changed thickness to 8 and enabled hollow; Desk A reflected both. Desk A submitted digit 8 and moved to digit 9. Projection retained submitted 8 and showed exactly one Desk A and one Desk B pane. Mobile projection at 390 px had no horizontal overflow. No console errors observed in these three tabs.

Limitations: in-app blob-download completion was not captured automatically, though generated font files passed independent parsing and persistent save links are available. Public hosting and venue hardware/network have not been deployed or verified. These results establish tested coverage, not an absolute guarantee against glitches.

Local app: http://127.0.0.1:43131/?view=studio&room=release-test-20261009&station=a (station=b for Desk B). Local room server: port 8793. Production unchanged; no commit/push/deploy.


Sidebar visual update: shared compact 11 px labels, 28–30 px controls, consistent neutral borders/fills and selected ink treatment, range inputs separated from text-field styles, five-column brush picker, 280 px default tools width. Saved manual widths respected; touch controls retain 36 px targets. Desktop 1280 px verified with canvas taking the largest region; no horizontal overflow. Build passed.

Grid controls now live column/row sliders, automatic stretch enabled, no apply action. Each pointer/keyboard gesture resamples from its starting glyph and records one undo snapshot. Browser verified 4→5 columns changed 12→14 cells immediately; Undo restored 4. Alphabet sidebar default and large-screen width reduced to 160 px.

Sidebar order updated: Draw → Shape (picker, shape size, corner roundness) → Transform & ink → Joins (join softness, presets, melt) → Font design → Canvas guides. No geometry changes. Browser verified order and build passed.

Font design is now an always-visible sidebar section, with no disclosure/dropdown. Browser verified section and all three sliders present without opening anything; build passed.

Character category, glyph picker/previews and custom-symbol creation/removal moved from Font design into right sidebar named Characters. One character picker, retaining selection hooks, published/draft/active indications and custom names. Workshop retains combined controls.

Fresh post-UI audit: three new agents exercised concurrent Desk A/B, resizing/history/selection, specimen and export generation. Actual stroke/erase/split, rotate/mirror/gaps, clear/starter undo, digit/punctuation/custom submission and next-empty passed, no browser console errors observed. Fixed selected preview contrast, startup category mismatch, stale notices/raw PUA labels, interrupted resize-source reuse, and per-room/per-station selection persistence. Root browser verified A=3 and B=2 survive independent reloads. OTF/WOFF freshly parsed independently with matching outlines, Unicode and advances; all SVG variants parsed. Worker tests still max main-loop delay 12 ms in sampled cases; complex cold outlines remain asynchronous and can take >1 s.
Workshop canvas regression reproduced at zero height: always-visible Font design had been inserted into specimen block below canvas. Moved design controls into paint controls sidebar; bounded specimen height and enabled collapse at all sizes. Root verified canvas 436 px high at 1280×800, and positive canvas height at normal window size. Source/build/resize tests passed. Public site untouched.

Workshop parity pass: separate shared Font design geometry and Characters controls in Paint/Export, named custom glyph labels and published previews, consistent shape-size/corner labels. Browser verified merge/outline/grid sliders, character category/custom tools and specimen available via Adjust at narrow widths. Build, resize/history and specimen release checks passed. Canvas remains in its own flex area.

Final repeated regression pass after Workshop parity: resize/history/resume, 1440 pointer paths, 118 font design cases, 33 recovery cases, 300 random patterns/security, specimen/UI, visitor/restore/live clocks, worker equality and final cache invalidation all passed. Independent fresh FontTools OTF/WOFF outline/width/Unicode and three SVG XML checks passed. Build, worker TypeScript and diff check passed. Desktop Workshop canvas 436 px at 1280×800, no page overflow or console errors observed. Main-loop gap 12 ms max in eight sampled worker cases, cached final export 0.8 ms; cold complex hollow 1114 ms. No further bugs found in this repeated coverage.
