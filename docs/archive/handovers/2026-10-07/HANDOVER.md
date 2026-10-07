# Gridz development handover

Updated 1 October 2026. This is the current handover and supersedes the archived handovers linked below.

## Project and working agreement

Project: `/Users/simongrey/Desktop/gridz`. Modular font-design workshop using React 19, TypeScript, Vite, Tailwind, polygon-clipping and opentype.js. There are 19 built-in shapes.

The current focus is shape welding and visual consistency. The user wants the agent to inspect all relevant shapes and arrangements, rather than assigning that inspection to them.

- Preserve the centred square joins and curved diagonal square “inner-circle melt”.
- Keep each shape recognisable. Reject skinny connector bars, accidental loops, pinholes, floating ink and lost silhouette area.
- Passing geometry tests is not visual acceptance. Render and inspect the actual results.
- Show new aesthetic treatments in isolated previews before integrating them. The user explicitly approved the arc/flat-side, sizing and capsule changes described below; those are already implemented.
- Preserve the extensive unrelated, uncommitted workspace changes. Do not reset, stage, commit, push or change remotes unless asked. Existing UI, festival/projection, export work and media are not disposable.

## Implemented and approved

### Shared weld corrections and original arc treatment

Earlier work centred shared contact selection, included straight-edge contact samples and exact outline-walk endpoints, corrected boundary overlap handling and checked both reflected attachment points. `polyBool.ts` retries failed unions on a 0.001px integer grid.

The original arc-pair treatment uses two cubics meeting at a shared waist tangent. Arc-containing components use a guarded union that retains original bodies and protected interior holes. These remain in production.

### Arcs meeting flat sides

`src/lib/arcFlatBlend.ts` implements the approved rounded contact for orthogonal arc–square, arc–rectangle and opposing arc pairs whose rotations differ by 180°. It is connected to `organicWeld`, workshop pair eligibility and pair fusion. Same-orientation arc pairs retain the earlier arc construction. The legacy `fork-current` workshop path remains separate.

The new treatment uses the existing contour-field closing method at 65% strength, protects the arc opening, continues its inner curve across the gap and keeps an opening to the outside for bottom contacts. It includes the original bodies in the returned geometry so the guarded component union can verify area attachment. Results are cached with a 128-entry limit.

Applied comparison: [Arc / flat-side blends](http://127.0.0.1:43127/docs/arc-flat-applied.html).

Limits: field sampling is still 0.65px, so tiny ripples and first-computation cost remain. The opening model uses an idealized 0.28 inner-radius ratio and nominal stamp coordinates; future refinements should share shape metadata and account for normalized rounded outlines. This is not a universal fix for all arc combinations, arbitrary rotations or clusters.

### Consistent pixel sizing

`src/lib/shapes.ts` now defines size as the longest unrotated ink extent **after rounding**. It uniformly scales and recentres the finished geometry, preserving aspect ratio, then applies rotation. Rectangles and capsules keep their natural proportions. A 45° rotated shape can have a larger axis-aligned bounding box without changing its physical size.

`shapeOutlineRings`, `shapeContactSamples` and `moduleShapePath` share the normalized geometry. Circle and ring painting retains analytic paths. This corrects tip shrinkage from rounding; it is not equal-area or optical-weight sizing.

The user approved the sizing preview. Earlier notes saying that the sizing clarification is pending are superseded.

### Smooth capsules

Capsules previously used eight straight segments per semicircular end. Sampling is now adaptive, with at least 32 segments per cap and a chord error below 0.01px at the tested sizes. Workshop and export paths use the same outlines, including rotations.

Applied comparison: [Capsule before / after](http://127.0.0.1:43127/docs/capsules-applied.html).

This fixes capsule edge faceting, not all capsule cluster-welding aesthetics.

## Pending work: do not describe these as implemented

1. **Cross, X and chevron:** replace thin parallel struts, trapped slits and accidental holes with clean curved joins. These are a sensible next visual-design focus.
2. **Stars, arc + notch and wedge + notch:** the revised treatments in `scratch/weld-retry/` and `docs/weld-retry.html` remain isolated experiments. The user rejected the earlier detached-ink page. Fragment removal alone was not an aesthetic solution.
3. **Diamonds, triangles and wedges:** improve curved waists, vertex-to-flat flares and silhouette preservation. Unequal-wedge body loss was reported in the earlier audit and needs a fresh reproduction after the size changes.
4. **Ring protection in Fill Gaps:** the general proposal that restores intentional interior holes after gap cleanup remains in `scratch/phase1/`. Canvas/export cleanup after punch-outs and zero-softness paths also needs a consistent policy. Explicit Solid mode should continue filling holes intentionally.
5. **General pair-order and detached-ink safeguards:** the Phase 1 canonical pair ordering and non-arc fragment cleanup were not integrated. Arc-specific ordering/protection exists, but do not claim a global fix.
6. **Capsule and other clusters:** smoothing capsule edges does not resolve unwanted cluster openings or all neck shapes.
7. **Direction overrides:** registry keys use names such as `horizontal` and `diagonal-right`, while the production caller supplies `h`, `v`, `d`. Review this mismatch before relying on direction-specific preferences; changes could affect the square reference.

Older reports of triangle asymmetry, sharp-star islands and ring bleed are historical hypotheses, not automatically current failures. The September recheck did not reproduce some original cases. Reproduce against the current geometry before fixing or quoting old counts.

## Architecture and integration points

- `src/lib/shapes.ts`: raw preset geometry, normalization, contact samples, painted outlines and capsule precision.
- `src/lib/softness.ts`: `makeSoftStamp` (including rotation), `organicWeld`, contact selection, pair eligibility, neighbour collection, component union and final hole filtering.
- `src/lib/arcFlatBlend.ts`: approved arc/flat treatment and cache; imports `SoftStamp` as a type.
- `src/lib/fieldExperiments.ts`: sampled contour methods; now exposes `fieldBlendRings` as well as path output.
- `src/lib/polyBool.ts`: boolean helpers, protected-hole operations and union fallback.
- `src/lib/shapeJoinRegistry.ts`: main / fork-weld / fork-current selection and per-shape preferences. Circle and ring retain dedicated metaball handling.
- `src/lib/joinExperiments.ts`: lab comparisons. Raw experimental output is not necessarily identical to workshop dispatch or guarded component fusion.
- `src/components/Canvas.tsx`, `src/lib/export.ts`, `src/lib/fontExport.ts`: painting, final SVG geometry and font output. Shared geometry changes must remain consistent across these paths.

Do not assume a raw lab result proves the workshop integration works. During integration, bridges containing only extra ink were rejected by the guarded arc union because they had no positive-area body overlap; returning the attached body union resolved this. The live regression now checks actual connectivity at full softness.

## Verification and evidence

Last implementation verification passed the following commands. These results were obtained during implementation; this handover consolidation did not rerun them.

```sh
npm run build
node scripts/smoke-weld-alignment.mjs
node scripts/smoke-arc-weld.mjs
node scripts/smoke-arc-flat.mjs
node scripts/smoke-shape-sizing.mjs
node scripts/smoke-cd-features.mjs
node scripts/smoke-hole-mode.mjs
node scripts/render-blend-review.mjs
```

- 128 alignment/ordering cases, plus rotation and zero/broken-join checks.
- 288 arc configurations and 21 original approved reference frames.
- 32 live arc/flat blends: body preservation, open mouths, order and zero/broken joins.
- 228 size cases: rotations, paint/weld agreement and capsule chord precision.
- The applied arc page also passed 40 frame checks, including full-softness connectivity and no new closed holes.
- Relevant lint and `git diff --check` passed.
- The gallery was regenerated with 228 B/C renders covering 19 shapes and six layouts. The implemented arc and capsule comparisons were visually inspected, as were the regenerated capsule blends.

`scripts/fixtures/approved-arc-weld.json` retains the original expected silhouettes. `scripts/fixtures/approved-arc-inputs.json` freezes their original stamp geometry, allowing that construction to remain tested independently of the newly approved sizing changes. Do not silently replace expected outputs to make regressions pass.

The broad September audit contained 9,408 renders, but predates the latest size/arc/capsule implementation. Its failure counts are historical. Run a fresh audit for any claim about current broad coverage. An audit exiting zero may only mean it completed; inspect its reported flags.

## Previews and reproducibility

Local server:

```sh
npm run dev -- --host 127.0.0.1 --port 43127
```

Starting the listening socket previously required sandbox escalation. Do not assume the server is still running.

Current applied pages:

- `docs/arc-flat-applied.html`
- `docs/capsules-applied.html`

Review / historical proposal pages:

- `docs/blend-visual-review.html`: current generated B/C comparison; its general candidate wording does not override the applied status above.
- `docs/weld-retry.html`: unimplemented star and notch experiments.
- `docs/weld-proposals.html`: older mixed proposal set; only specifically approved changes were integrated.
- `docs/phase1-weld-preview.html`: rejected/unfinished correctness candidates.
- `docs/arc-flat-preview.html`, `docs/shape-size-preview.html`: historical approved proposals; no longer pending implementation.

The blend review generator writes both `docs/` and `public/docs/`. Vite can serve the public copy ahead of the root docs copy; update both when applicable to avoid viewing stale geometry.

Scratch code is experimental and can contain outdated status text. This handover is authoritative for implementation status. `scratch/arc-flat/render-applied.mjs` uses the production finish path and `approved-preview.json` for the historical comparison. `render-capsules.mjs` currently depends on `/tmp/gridz-shapes-before.ts`; preserve its existing HTML or make its before-data durable before regenerating on another machine. Temporary source files are not reliable long-term fixtures. Do not run old candidate builders expecting them to preserve an exact historical baseline against changed production sources.

## Next development pass

Prepare a small, clearly improved before/after set for cross/X/chevron joins. Check equal and unequal sizes, horizontal/vertical/diagonal pairs, L and 2×2 clusters, rotations, paint order and protected openings. Keep the square reference unchanged. Show the candidate before applying another aesthetic redesign, then verify the real workshop and export paths after approval.

## App-level pass, 6 October 2026

A separate pass improved the application around the weld engine; details and verification are in [`CHANGES.md`](CHANGES.md). Weld geometry was not changed: 912 exported glyphs are byte-identical to the previous source and the scripts listed under "Verification and evidence" still pass.

Two things in that pass matter for future weld work:

- `softnessFinishPolygons` in `src/lib/softness.ts` now **memoises its result**. The key covers stamp geometry (an outline checksum), Softness, broken joins, hole mode, `getJoinEngineMode()` and the stored join preferences. Anything new that can change a fuse must be added to `finishCacheKey`, and callers must treat the returned polygons as read-only.
- `src/lib/export.ts` exposes `glyphPolygons(payload)`; fused SVG paths and the OTF both come from it. `buildGlyphBodyMarkup` falls back to crisp stamps if the fuse throws.

`vite build` and `oxlint` could not be run in that environment; run them locally before relying on the pass.

## Archived handovers

Previous documents are preserved unchanged for historical evidence, not current instructions:

- [Previous executive handover](docs/archive/handovers/2026-10-01/HANDOVER.md)
- [Previous ChatGPT handover](docs/archive/handovers/2026-10-01/CHATGPT_HANDOVER.md)
- [Previous Gemini handover](docs/archive/handovers/2026-10-01/GEMINI-HANDOFF.md)
- [Original blending handoff](docs/archive/handovers/2026-10-01/BLEND-HANDOFF.md)
