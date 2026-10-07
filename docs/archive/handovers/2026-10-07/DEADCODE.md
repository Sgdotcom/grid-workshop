# Dead Code Audit Report

## Summary

The live app is a Vite + React single-page tool (`index.html` → `src/main.tsx` → `src/App.tsx`). There are no unit tests, no public library API, and no reflection / string-based dispatch. After tracing every import from those entry points, plus `package.json` scripts, Vite config, and both Playwright smoke files, **8 archive files**, **one obsolete SDF remesh pipeline**, **two unused shape helpers**, **a no-op envelope-radius path**, **an unused Canvas re-export**, **unused Button variants**, and **OTF leftover glyph-char state** are unused and safe to delete.

Nothing listed is referenced by smoke tests, `docs/classmate-howto.md`, or dynamic calls. `scripts/blend-gallery.ts` and `scripts/size-gallery.ts` are **not** listed for deletion: they are standalone visual CLIs (even though they are not in `package.json`).

**Confirmed for deletion:** 8 files, 16 functions, 0 classes, 7 variables/fields/variants. Roughly **1,400 lines**.

## Files to Delete

### `archive/` (entire directory)

Explicitly documented as “not imported” (`archive/README.md`, root `README.md`). No file under `src/`, `scripts/`, or config imports `archive/`.

| File | Why unused |
|------|------------|
| `archive/appendShapeToFontPath.ts` | Local OTF path builder. Product export is SVG only. Header states “not imported.” |
| `archive/exportOtf-snippet.ts` | Former `exportOtf()` download. No live caller. |
| `archive/softness-deprecated.ts` | Old `softnessMergePaths` alias. Live fuse is `src/lib/softness.ts`. |
| `archive/softness-metaball-joins.ts` | Snapshot of an earlier softness engine. Not imported. |
| `archive/ExportFinishCanvas-blend-brush.tsx` | Removed Export blend/blur UI. Not imported. |
| `archive/docs/ios-implementation.md` | Obsolete multi-mode iOS plan. Not linked from app or npm scripts. |
| `archive/README.md` | Index for the above. Delete with the folder. |

After deletion, drop the archive sentence in root `README.md` (docs only; not listed as code).

## Functions/Methods to Delete

### `src/lib/sdfBlend.ts`

Live Softness only imports `stampSdf`. `stampSdf` needs `evalAnalyticSdf`, `sdfRings`, `distToSeg`, `evenOddInside`, and `minEdgeDist`. Everything else exists solely to support `blendStampRings` (SDF smin + marching squares), which **no file imports**.

**Delete (exports):**

- `smin` — only called from `blendStampRings`
- `marchingSquares` — only called from `blendStampRings`
- `blendK` — only called from `blendStampRings` (and never from outside this file)
- `blendStampRings` — zero importers
- `BlendJoin` (interface) — only a parameter type of `blendStampRings`

**Delete (file-private, only reachable from the above):**

- `ringBBox`
- `lerpZero`
- `ptKey`
- `chainRings`
- `ringArea`
- `chaikin`
- `pointInRing`
- `centroid`
- `dropOrphanOuters`
- `groupOutersAndHoles`
- `signedRingArea`

Keep: `stampSdf`, `sdfRings`, `evalAnalyticSdf`, `distToSeg`, `evenOddInside`, `minEdgeDist`. After the cut, this file is an SDF sampler, not a blender.

Verified: `rg blendStampRings|marchingSquares|blendK|\\bsmin\\(` across the repo only hits this file.

### `src/lib/shapes.ts`

- `shapeIsBlobLike` — defined and never called (no importers, no tests, no string refs)
- `shapeIsBlobConvex` — only called by `shapeIsBlobLike`

Keep `shapeIsCapsule` / `shapeRoundness` / `effectiveCornerRadius`; those are used by `makeSoftStamp` and rounded-box SDFs.

### `src/lib/softness.ts`

- `stampEnvelopeRadius` — only writes `SoftStamp.r`, which is never read (see Variables). After removing `r`, this function has no callers.

Do **not** delete `softnessExpandStroke`: `src/lib/export.ts` `glyphContentBounds` still calls it (it currently returns `0`; that is a stub, not unused).

### `src/components/Canvas.tsx`

- `export { softEdgeKey }` at the bottom of the file. `App.tsx` imports `ShapeGridCanvas` and `PaintTool` only. No module imports `softEdgeKey` from Canvas. Keep the import from `@/lib/softness` used inside Canvas for join-break keys.

## Classes to Delete

None. The codebase has no unused class declarations.

## Variables/Constants to Delete

### `src/lib/softness.ts` — `SoftStamp.r`

Assigned in `makeSoftStamp` via `stampEnvelopeRadius`. No read of `stamp.r` / `s.r` / envelope `r` anywhere. (`ca.r` / `cb.r` in capsule blending are **capsule SDF radii**, not this field.)

Also unused after pair construction: `pairs[].strength` is stored from `blendStrength` and never read in `fuseComponent` (only `a`, `b`, `diagonal` are used). Safe to stop storing it; keep `blendStrength` itself for the fuse-range null check.

### `src/lib/export.ts` + `src/App.tsx` + `src/components/ExportPreview.tsx` — `glyphChar`

`ExportPayload.glyphChar` is never read by `buildGlyphBodyMarkup`, `glyphContentBounds`, `buildSvgMarkup`, or `exportSvg`. It was for archived OTF naming.

Live leftovers to remove together:

- `ExportPayload.glyphChar`
- `App` state `glyphChar` / `setGlyphChar` (letter-guide UI already uses `guideLetter` + `guideUpper`)
- `ExportPreview` payload field `glyphChar: 'A'`

### `src/components/ui/button.tsx` — unused CVA variants

Call sites only use `variant="accent" | "secondary"` (plus the default when omitted) and `size="sm" | "lg"` (plus default).

**Delete variant keys (keep `default`):** `outline`, `ghost`, `danger`  
**Delete size key (keep `default`, `sm`, `lg`):** `icon`

No `variant="outline|ghost|danger"` or `size="icon"` in the repo.

## Verification Notes

- **Entry points traced:** `index.html` → `src/main.tsx` → `App`; `vite.config.ts`; `npm run smoke:hits` / `smoke:func`.
- **No unit tests** that would uniquely retain `blendStampRings` or archive modules.
- **No dynamic dispatch:** no `eval`, no `import()` of archive paths, no string-keyed registries.
- **Smoke scripts** click test IDs (`intro-start`, `tab-export`, `paint-softness`, etc.). They do not import `src/lib/*` symbols listed above.
- **`scripts/blend-gallery.ts` and `scripts/size-gallery.ts`:** not in `package.json`, not imported. Left **off** this delete list because they are intentional visual CLIs (`npx vite-node scripts/…`). Safe to delete later if you do not want those galleries.
- **`OverlapLayer` / `FilledRegion.layer`:** always `'a'`. Vestigial multi-layer type, but it **is** written on every stamp. Not listed — removing it is a refactor, not a dead-symbol delete.
- **`softnessExpandStroke`:** called; currently a `return 0` stub. Not dead.
- **Exported-but-internal** helpers (`fuseMaxGap`, `capsuleMedial`, `fitVerticesToBox`, `roundedOutlineRing`, `sdfRings`, …) are used inside their files. Not listed; only unused *exports* that wrap unused functions were listed.

## Estimated Impact

| Area | Approx. lines |
|------|----------------|
| `archive/` | ~1,000 |
| SDF remesh pipeline in `sdfBlend.ts` | ~350 |
| `shapeIsBlobLike` / `shapeIsBlobConvex` | ~40 |
| Envelope radius + `SoftStamp.r` | ~15 |
| `glyphChar` payload/state | ~15 |
| Unused Button variants + Canvas re-export | ~10 |
| **Total** | **~1,430** |

Deleting `archive/` plus the `blendStampRings` half of `sdfBlend.ts` is almost all of the win. The rest is small cleanup that removes confusion (especially `glyphChar` looking like it still names an OTF glyph).
