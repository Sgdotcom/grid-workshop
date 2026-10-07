# Archive — removed from hot path

Code kept for reference, **not imported** by the running shape-grid app.

| Item | Why archived |
|------|----------------|
| `appendShapeToFontPath.ts` | Local OTF prototype path builder. Product export is SVG → Cloudflare OTF. |
| `exportOtf-snippet.ts` | UI OTF download removed; production handoff is SVG only. |
| `softness-deprecated.ts` | Old `softnessMergePaths` alias / unused edge helpers. |
| `softness-metaball-joins.ts` | Earlier bridge-only metaball snapshot. Live Softness unions real silhouettes with metaball necks in `src/lib/softness.ts`. |
| `softness-unified-bounded-sdf.ts` | Failed Gemini unified cubic-SDF + marching-squares fuse. Visual matrix was unusable; not in the app. |
| `sdfBlend-unified-bounded-sdf.ts` | Pairwise cubic smin / MS helpers from that same experiment. |
| `scripts/blend-gallery.ts` | Self-pair visual matrix for the SDF experiment. |
| `scripts/fuse-matrix.ts` | Automated flag dump for the SDF experiment. |
| `ExportFinishCanvas-blend-brush.tsx` | Export Blend amount + freehand blur brush. Removed — Export is preview + Download SVG only. |
| `docs/ios-implementation.md` | Early multi-mode iOS plan (dot / vertical / circle / dual). Product is shape-grid only now. |

Do not re-add these to `src/` unless the product explicitly brings them back.
