# Grid workshop — context for Claude Code

Modular letter-design workshop (Beckmans festival). Visitors stamp shapes on a grid, Softness melts neighbours into one silhouette, letters are added to a shared typeface, and a wall projection shows the alphabet. Session is `localStorage` plus an optional Cloudflare Worker live room (`VITE_LIVE_SESSION_URL`).

**Authoritative handover for humans / Claude Code:** [`HANDOVER.md`](HANDOVER.md). Older handovers live under [`docs/archive/handovers/`](docs/archive/handovers/).

## Run

```bash
npm install
npm run dev          # http://127.0.0.1:43127
npm run typecheck
npm run lint
npm run build
```

Views: `/` studio desk (also `?view=studio`) · `/?view=workshop` full workshop · `/?view=projection` wall projection (legacy `?view=wall` redirects here).

## Golden rules

1. **Do not change workshop Softness / weld geometry without an isolated preview first**, then user approval, then integrate. Lab HTML under `public/docs/` is not proof the live fuse path matches.
2. **Training and paint must share outline geometry.** `shapeOutlineRings` / `moduleShapePath` / contact samples must stay consistent with Softness stamps and export (`glyphPolygons`).
3. **Circle and ring same-preset joins stay metaball** (`isShapeLockedMetaball`). Do not route them through generic weld experiments.
4. **Ring centres must survive Gaps fill/solid.** Use `filterPolygonHolesPreserving` + `intentionalHoleCutters`, not bare `filterPolygonHoles`.
5. **Anything that changes a fuse must update `finishCacheKey`** in `src/lib/softness.ts` (includes Softness, joins, hole mode, engine mode, join prefs, melt-off prefs, stamp outlines). Treat returned polygons as read-only.
6. **Preserve uncommitted / unrelated work.** Do not reset, force-push, or casually rewrite git history.
7. **Live room Worker lives in `workers/live-session/`.** Do not break GET/PUT merge rules or require auth on GET (wall is public). App client: `src/lib/liveSession.ts` + `useLiveSession`.

## Softness / welding map (read this first)

| File | Role |
|------|------|
| `src/lib/softness.ts` | Stamps, `pairCanFuse`, `organicWeld`, `blendPairPolygons`, component fuse, finish cache |
| `src/lib/shapeJoinRegistry.ts` | Engine mode, same-preset methods, **mixed-pair method table**, **per-shape melt-off** |
| `src/lib/arcFlatBlend.ts` | Approved orthogonal arc↔square/rect (and opposing arcs) |
| `src/lib/fieldExperiments.ts` | SDF / offset melts (`fieldBlendRings`) used by mixed-pair picks |
| `src/lib/polyBool.ts` | Union / difference / hole filter (+ ring-hole preserve) |
| `src/lib/shapes.ts` | Preset outlines, sizing after rounding, contact samples |
| `src/lib/export.ts` | `glyphPolygons` — SVG + OTF share this |
| `src/components/Canvas.tsx` | Live paint + Softness display |
| `src/components/StudioDesk.tsx` | Install studio (`/`, `?view=studio`) |
| `src/lib/liveSession.ts` | Live room client (pull/push/merge) |
| `workers/live-session/` | Cloudflare Worker + Durable Object |

### Dispatch summary

- **Same preset:** `joinSamePreset` → registry method (or locked metaball for circle/ring). Engine forks: `main` | `fork-weld` | `fork-current`.
- **Mixed preset:** `getMixedPairJoinMethod` → `weld` / `sdf` / `offset` / `current` / `none`. Unlisted pairs → legacy mixed blend.
- **Melt off (UI):** `isPresetMeltOff(preset)` — no Softness neck; touch/overlap still boolean-unions. Toggle in Softness panel (studio + main Paint). Stored in `localStorage` key `gridz-melt-off-presets-v1`.
- **Arc ↔ flat:** `usesArcFlatBlend` short-circuits to `arcFlatBlend` (unless melt-off or `fork-current`).

### Known footgun

`pairAxis` returns `'h' | 'v' | 'd'`, but `DEFAULT_DIRECTION_OVERRIDES` keys use names like `horizontal` / `diagonal-right`. Direction overrides currently **do not match** production axes — fix carefully before relying on them.

## Install views

- Studio: canvas | **resizable tools rail** | alphabet. Tools width: `gridz-studio-tools-width`.
- Wall: alphabet, Desk A / Desk B live panes, specimen (published else draft/live SVG).
- Same letter on two desks is allowed: per-letter `draftUpdatedAt`, newest edit wins. A letter's clock moves only on a local edit (`letterUnchanged`), or idle desks ping-pong PUTs.
- Clear / restore need the facilitator password (Worker secret `CLEAR_ROOM_PASSWORD`). The repo is public: never commit the password; smoke scripts read it from the env.
- Same festival session key as the default workshop; optional shared room via Worker.
- Deploy live Worker + set `VITE_LIVE_SESSION_URL` — see `workers/live-session/README.md` and `docs/festival.md`.

## Previews (Vite serves `public/docs/`)

| Page | Purpose |
|------|---------|
| `/docs/mixed-weld-preview.html` | Mixed-pair method lab (picks → registry) |
| `/docs/no-weld-candidates.html` | Melt vs no-melt candidates (regenerate: `node scripts/render-no-weld-preview.mjs`) |
| Other `public/docs/*.html` | Historical audits / labs — not all reflect current production |

Regenerate mixed lab: `node scripts/render-mixed-weld-preview.mjs`.

## Smoke (geometry)

```bash
node scripts/smoke-weld-alignment.mjs
node scripts/smoke-arc-weld.mjs
node scripts/smoke-arc-flat.mjs
node scripts/smoke-shape-sizing.mjs
node scripts/smoke-hole-mode.mjs
npm run smoke:install   # studio/projection routes (dev server up)
```

## Scratch / archive

- `scratch/` — experiments; may be stale; do not treat as production status.
- `archive/` — removed hot-path code; not imported.
- `docs/archive/handovers/` — old handovers only.

## Working style

- Prefer isolated HTML/SVG previews for aesthetic weld changes.
- Reject skinny bars, accidental loops, pinholes, floating ink, sealed intentional holes, lost silhouette.
- Passing smoke ≠ visual acceptance — render and inspect.
- Keep festival/export/UI paths consistent when changing fuse geometry.
