# Isolated weld proposal preview

Open http://127.0.0.1:43127/docs/weld-proposals.html with the existing dev server.
Rebuild: `node scratch/weld-preview/build.mjs`.

Nothing in this directory is imported by the workshop. The builder copies the current softness engine here, modifies this private copy, and pre-renders 14 comparisons at 21 softness values into a standalone HTML page. Production source hashes are checked before/after. The original blending engine, registry, settings and saved shapes are not changed.

Proposals under review:
- Two cubic segments per bridge flank, preserving endpoint tangent directions with a shared waist tangent, without clamping sampled coordinates.
- Arm-relative attachment budgets for stars, crosses, X and chevrons.
- Independently normalised bridge pieces, rejected if they remove original ink; detached bridge pieces are skipped.
- For two cross/X stamps only, close new internal slits while preserving original holes. This does not fill cluster counters.
- Restore original ring holes after Fill Gaps; the preview does not change Solid mode.
- Use the same orthogonal/isolated-diagonal neighbour graph in both columns of the design comparisons.

The workshop comparisons use repository defaults, not browser-local overrides. Design comparisons explicitly show current outline weld versus the proposal. No direction-registry fixes or production integration are included.

Validation covers preservation of the original union and its protected holes at every sampled step, plus browser checks of tabs, midpoint softness and outline toggle. 294 proposal frames currently pass. It is not a full mixed-shape/rotation/performance regression run or visual acceptance. The diagonal star is still a skinny strut and is labelled unresolved. Some low-softness frames remain disconnected or reject a bridge; the UI reports these rather than hiding them.

The user requested a preview before any workshop implementation. Await their review before integrating anything.

## Arc approval and implementation — 24 September 2026

The user subsequently approved the arc card in “1 · Keep the shape.” Only that treatment has been integrated into production. The page now identifies the arc card as applied and renders its after frames using the actual production function. The other proposals remain isolated. The builder freezes its before engine to `softness-before-arc-implementation.ts` so rebuilding will preserve the original comparison.

`node scripts/smoke-arc-weld.mjs` checks 21 approved frames and 288 further arc configurations, along with broken joins and mixed ring-hole preservation. `check-unapproved-unchanged.mjs` compares 324 non-arc configurations against the frozen engine.
