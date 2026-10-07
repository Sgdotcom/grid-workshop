# Grid workshop — context for Claude Code

Modular letter-design workshop (Beckmans festival). Visitors stamp shapes on a grid, Softness melts neighbours into one silhouette, letters are added to a shared typeface, and a wall projection shows the alphabet. No backend — session is `localStorage`.

**Authoritative handover for humans / Claude Code:** [`HANDOVER.md`](HANDOVER.md). Older handovers live under [`docs/archive/handovers/`](docs/archive/handovers/).

## Run

```bash
npm install
npm run dev          # http://127.0.0.1:43127
npm run typecheck
npm run lint
npm run build
```

Views: `/` workshop · `/?view=studio` desk · `/?view=wall` cinematic wall · `/?view=projection` classic wall.

## Golden rules

1. **Do not change workshop Softness / weld geometry without an isolated preview first**, then user approval, then integrate. Lab HTML under `public/docs/` is not proof the live fuse path matches.
2. **Training and paint must share outline geometry.** `shapeOutlineRings` / `moduleShapePath` / contact samples must stay consistent with Softness stamps and export (`glyphPolygons`).
3. **Circle and ring same-preset joins stay metaball** (`isShapeLockedMetaball`). Do not route them through generic weld experiments.
4. **Ring centres must survive Gaps fill/solid.** Use `filterPolygonHolesPreserving` + `intentionalHoleCutters`, not bare `filterPolygonHoles`.
5. **Anything that changes a fuse must update `finishCacheKey`** in `src/lib/softness.ts` (includes Softness, joins, hole mode, engine mode, join prefs, melt-off prefs, stamp outlines). Treat returned polygons as read-only.
6. **Preserve uncommitted / unrelated work.** Do not reset, force-push, or casually rewrite git history.
7. **Install streaming is not this repo.** Studio/wall are localStorage-only; multiplayer relay is deferred.

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
| `src/components/StudioDesk.tsx` | Install studio (`?view=studio`) |
| `src/components/CinematicWall.tsx` | Install wall (`?view=wall`) |

### Dispatch summary

- **Same preset:** `joinSamePreset` → registry method (or locked metaball for circle/ring). Engine forks: `main` | `fork-weld` | `fork-current`.
- **Mixed preset:** `getMixedPairJoinMethod` → `weld` / `sdf` / `offset` / `current` / `none`. Unlisted pairs → legacy mixed blend.
- **Melt off (UI):** `isPresetMeltOff(preset)` — no Softness neck; touch/overlap still boolean-unions. Toggle in Softness panel (studio + main Paint). Stored in `localStorage` key `gridz-melt-off-presets-v1`.
- **Arc ↔ flat:** `usesArcFlatBlend` short-circuits to `arcFlatBlend` (unless melt-off or `fork-current`).

### Known footgun

`pairAxis` returns `'h' | 'v' | 'd'`, but `DEFAULT_DIRECTION_OVERRIDES` keys use names like `horizontal` / `diagonal-right`. Direction overrides currently **do not match** production axes — fix carefully before relying on them.

## Install views

- Studio: canvas | **resizable tools rail** | alphabet. Tools width: `gridz-studio-tools-width`.
- Wall: alphabet ribbon above specimen.
- Same festival session key as the default workshop. Two windows, **same browser profile**.

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
npm run smoke:install   # studio/wall routes (dev server up)
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
