# Gemini handover — shape blending

## Task and current status

Continue work in `/Users/simongrey/Desktop/gridz`. The user does not want to inspect every shape manually. They noticed that **B · Outline weld** attached off-centre when squares were horizontal or vertical neighbours. They liked the diagonal outline weld, which resembled **C · Inner-circle melt**.

The user authorised fixing the shared weld attachment calculation and checking the entire shape library. They then requested this handover for Gemini while implementation was in progress.

**The main fix is implemented, builds, and passes the current regression checks. The original triangle/star edge cases remain. Additional testing has also confirmed order-dependent experimental welds and partial ring-hole filling in production; see the supplemental results below. Do not represent the whole blending task as finished.**

**Latest user feedback: many non-square blends look terrible. Visual quality is now the primary unresolved problem. The user has seen the new comparison gallery and asked to add these findings to this handover; they have not approved the shortlist or an algorithm switch.**

This work corrects the shared `organicWeld` implementation. It improves the B experiment and production paths that already use that helper. **It does not replace the workshop's entire blending algorithm with B or C.** Existing production eligibility rules intentionally leave some sharp shapes separate; a later global algorithm change would be a separate design decision.

## Supplemental testing after the initial handover

### Subsequent visual review: the user rejected many non-square welds

The user said many non-square results look terrible. Passing symmetry/connectivity checks is not visual acceptance. A fresh B/C comparison was rendered and visually inspected for all 16 presets in all six layouts (192 renders), at size 37, softness 1, roundedness 2, radius/neck 1. No blending engine code changed in this review.

Open `docs/blend-visual-review.html`; regenerate with `node scripts/render-blend-review.mjs`. The first tab is a subjective shortlist, and the remaining tabs show both methods with per-shape notes. Prefer C for circles and rings, and for smoother axial octagon waists; retain B as the square reference. Even these candidates still have small cluster openings or edge notches. This is not a universal recommendation or a user-approved design.

Live review: [Blend visual review](http://127.0.0.1:43127/docs/blend-visual-review.html). It opens on **Strongest candidates**, followed by eight paired-shape tabs covering the entire library. Each comparison shows horizontal, vertical, both diagonals, L and 2×2 clusters. The page was opened for the user and its comparison rows were visually checked in the browser. The generator passed the project lint check; `git diff --check` passed. This pass changed review artifacts and this handover only, not the blending engine or workshop defaults.

Next design pass: work on the failed shape families without asking the user to audit each preset. Judge smooth entry into the original outline, recognisable shape bodies, intentional openings and consistent behaviour across arrangements. Reject skinny connector bars, accidental loops, pinholes and missing joins even when numeric checks pass. Bring back a small set of actual improved before/after examples, then verify mixed shapes, unequal sizes, input ordering and ring-hole preservation before proposing a production change.

Neither B nor C is ready across the remaining shape/layout combinations: rectangle/capsule C creates stems and cluster lattices; triangle C misses diagonal joins; stars/crosses/X/chevrons get struts and extra loops with B or missing joins with C. Diamond B diagonal joins become nearly bar-shaped. Hexagon/pentagon clusters retain small openings. Prioritise visually continuous transitions and recognisable silhouettes before more numeric pass counts. Do not ship a blanket B-to-C switch.

The user asked whether more testing could continue. A testing-only pass was completed without modifying `softness.ts`, `shapes.ts` or `polyBool.ts`. Source hashes were captured before and after and remained identical; they are recorded in `docs/join-extended-validation.json`.

Run `node scripts/audit-join-coverage.mjs` to repeat it. This is a diagnostic audit: a zero exit code means the audit completed, not that it found no issues. Its JSON contains all flagged configurations and thresholds.

Coverage:

- 3,264 pair scenarios: every unordered preset pairing including same shapes, H/V/both diagonals, sizes 37/37, 24/56 and 56/24, Softness 0.2 and 1, corners 2.
- 72 custom-shape scenarios: polygons with 3/7/12 sides and stars with 3/7/12 points, inner ratios 0.15/0.85, corners 0/12, four pair layouts.
- 72 larger A/O/S-style layouts using Circle, Square, Star, Cross, Ring or alternating Circle/Square/Ring; sizes 37/56, Softness 0.2/1, corners 12.
- Both experimental B and production output for each scenario: **6,816 initial renders and 6,816 reversed-input-order checks**.
- **3,336 rotation checks** on B's actual geometry. Production was not rotation-tested this way because its dispatch also depends on orientation-specific preset metadata.
- **48 O-counter checks**, covering both methods and the tested layout settings.

### Newly confirmed issue: B depends on input order

**171 B configurations** exceeded 0.5% difference in filled area when only the stamp array order was reversed. Positions, shapes and settings did not change. Breakdown: 144 pair cases, 10 custom cases, 17 larger layouts. Production did not trigger the order threshold in this run.

Minimal visual reproduction:

- Circle at cell `(0,1)`, 4-star at `(1,0)`; sizes 37/37, Softness 1, corners 2.
- Build B using `organicWeld(circle, star, 1)`, union with the original bodies, then repeat with `organicWeld(star, circle, 1)`.
- The silhouette changes visibly: the neck shifts to a different side. Measured XOR area is **44.5% of original filled area**. This percentage is an area-difference metric, not a percentage of stamps disappearing.
- Another reproduction: two custom 3-point stars with innerRatio 0.15, size 37, corners 0, vertical, Softness 1; top-first vs bottom-first changes the neck substantially.

Treat this as an input-order invariance defect, not a reason to make the user pick separate algorithms. Trace attachment and flank selection when swapping a/b. The narrow existing smoke ordering tests did not cover these mixed/custom cases.

### Newly confirmed issue: production partly fills small ring holes

**16 pair configurations** put more than 0.1px² of ink inside an original ring hole. These are partial fills, not fully closed holes. All use a 56px Square/Rectangle/Octagon/Diamond/Hexagon beside a 24px Ring in certain H/V directions, at Softness 0.2 or 1, corners 2. Exact cases are in the JSON.

Minimal reproduction: Square at `(0,0)`, size 56; Ring at `(1,0)`, size 24; corners 2; production `softnessFinishPathList(stamps, 1)`. The bridge fills about **5.338px²** of the left edge of the hole. The original square body ends before the hole, so this is not the square itself covering the hole. Compare with B, which subtracts the full hole after union.

Potential investigation path, not a confirmed diagnosis: check whether every production bridge/fallback, including `contactNeck`, consistently subtracts protected ring holes before the final union.

### What passed in this supplemental profile

- No render/measurement exceptions or empty results.
- No loss above 1% of original body area, using all original ring holes as protected empty regions.
- No detached additions in this particular profile. It does not include the already-known 56px sharp-star/corners-0/Softness-0.2 cases, so those remain open.
- No rotation differences above 0.5% in the 3,336 B checks.
- All 48 tested O-counter centres stayed empty.

Single-run timings, including geometry parsing but excluding browser painting and reversed/rotated reruns: B median 0.97ms / p95 2.53ms / max 102.89ms; production median 0.38ms / p95 2.12ms / max 158.44ms. These are diagnostic local timings, not a UI performance benchmark.

### Reproduction artifacts

- `docs/join-extended-validation.json`: complete supplemental measurements, source hashes and all flagged configurations.
- `scripts/render-join-coverage-examples.mjs`: regenerates three focused visual reproductions.
- `docs/join-extended-examples.html`: independently rendered and visually inspected examples of mixed-pair order, partial ring-hole fill, and custom-star order. Open at `http://127.0.0.1:43127/docs/join-extended-examples.html`.

For larger-layout B checks, the audit welds only immediate grid neighbours. This is an explicit extension of the existing 2×2 lab, not a newly installed workshop algorithm. The renderers and measurement thresholds are documented in the script.

## User preferences

- Take responsibility for the exhaustive checks; bring back only a few meaningful visual examples.
- Keep each shape recognisable, centre symmetric joins, preserve ring holes, and retain the curved diagonal melt.
- Continue fixing routine issues without repeatedly asking for approval.
- Report limitations honestly. A successful geometry calculation is not proof that the result looks good.

## Project and previews

- Vite / React / TypeScript; geometry uses `polygon-clipping`.
- Local preview: `http://127.0.0.1:43127/`.
- Live comparison: `http://127.0.0.1:43127/?view=join-lab`.
- Saved review: `http://127.0.0.1:43127/docs/join-audit.html`.
- If the server has stopped, run `npm run dev -- --host 127.0.0.1` from the project. This environment required sandbox escalation to open the listening socket.
- The user's review settings were stamp size **37**, Softness **1**, Roundedness **2**, C circle size **1**, C neck strength **1**.

The lab compares A current, B outline weld, C inner-circle melt, D distance-field blend and E expand/union/shrink. Its original “SVG path groups” count is **not** a connected-component count: D/E can put disconnected shapes into one SVG path. Use the independent audit measurements instead.

## Implemented changes

### `src/lib/shapes.ts`

Rounded outlines previously sampled their corner curves but omitted the middle of long straight spans. Capsules also lacked midpoint samples along their straight sides. Contact sampling now includes those midpoints. This fixes corner-biased contacts without adding a square-specific exception.

### `src/lib/softness.ts`

- Filter contact hits against the final minimum distance, so stale candidates collected earlier in the scan cannot bias the chosen attachment.
- Include the exact requested arc endpoint when walking an outline. Compare arc completion with a small numerical tolerance.
- Treat a point on a neighbour's boundary consistently as part of the overlap; ray casting alone classified opposite edges differently.
- If a horizontal/vertical pair has a second mirrored attachment on both real outlines, weld both sites. This is useful for the facing arms of X, Star and Chevron. It does not average contacts into empty space.

### `src/lib/polyBool.ts`

If the normal polygon union throws, retry all contours on an integer grid at **0.001px precision** before the older per-contour fallback. The former fallback could silently drop a valid diamond weld in one orientation. The retry only runs after the normal union fails.

### Review and test support

- `scripts/audit-joins.mjs`: baseline gallery and optional broad B/C sweep. `--report-only` rebuilds HTML from the last cached baseline; **it does not test current code**. `--remeasure` also reuses cached geometry, so do not use it to validate code changes.
- `scripts/join-geometry.mjs`: independent SVG even-odd geometry parsing, true component/hole counts, retained-body measurements and symmetry checks.
- `scripts/smoke-weld-alignment.mjs`: regression assertions across all 16 presets and six arrangements, plus pair order, vertex order, rotation, zero Softness and broken joins.
- `scripts/fixtures/weld-before.json`: frozen B paths from before this fix, used for the before/after visuals. Do not overwrite these with the updated result.
- `docs/join-audit.html`: generated review. Its top section now compares original and updated B for a horizontal square, diagonal square and horizontal X. The full five-method gallery is collapsed underneath.
- `docs/join-audit-validation.json`: compact results from the latest validation, including the remaining cases.

## Latest verification

These checks were run after the final engine changes, including the boundary classification and integer-union retry:

```sh
node scripts/smoke-weld-alignment.mjs
npm run build
npm run lint -- src/lib/softness.ts src/lib/shapes.ts src/lib/polyBool.ts scripts/audit-joins.mjs scripts/join-geometry.mjs scripts/smoke-weld-alignment.mjs
```

All passed. The smoke script reports **106 shape/layout and ordering cases**, plus rotation, zero-Softness and broken-join checks.

At the user's review setting, B connects all **96 shape/layout cases**, retains the stamp bodies and ring holes, and has no H/V symmetry error above the smoke threshold of 0.1% for pairs whose original geometry is symmetric.

The latest broad sweep recomputed **5,184 cases**: 16 presets × 6 layouts × 3 sizes (24, 37, 56) × 3 Softness values (0.2, 0.55, 1) × 3 corner values (0, 2, 12) × 2 methods (B/C).

- 0 calculation/measurement errors; 0 empty results.
- 0 cases losing more than 1% of original filled area.
- 0 previously connected cases becoming disconnected relative to the pre-fix sweep.
- B symmetry flags above 0.5%: **357 before → 1 now**.
- C symmetry flags: 0 before and after.

Symmetry is measured as the area of the XOR between the result and its reflection across the join axis, divided by original filled area. It is only evaluated for H/V pairs whose original geometry is itself symmetric. These thresholds are review heuristics, not aesthetic acceptance tests.

All five methods had a 480-case baseline run earlier in this implementation. After the last engine changes, A/B/C were refreshed at the baseline settings; D/E retain their prior baseline results. The updated before/after page has since been visually inspected, and all 192 B/C results were freshly rendered and visually reviewed in the subsequent comparison. That review exposed the aesthetic problems described above; automated checks do not establish visual quality.

## Remaining issues — start here

### 1. A large overlapping triangle pair remains slightly asymmetric

Reproduce with B, `preset-triangle`, vertical pair `[[0,0],[0,1]]`, size **56**, Softness **1**, Roundedness **2**.

- Connected result; asymmetry **0.8808%**.
- Observed primary contact: `pa = [20, 44.20021388335235]`, `pb = [19.374999999999996, 39.0176343407195]`.
- A likely cause, not yet verified: the new mirrored-site branch in `organicWeld` checks only whether **pa** differs from its reflection. Here pa lies on the axis while pb does not. Consider testing whether either endpoint is off-axis, while retaining both real-outline membership checks. Then rerun the regression checks; do not assume the change is sufficient.

### 2. Large sharp stars produce detached weld islands at low Softness

Reproduce with B, `preset-star5`, size **56**, Softness **0.2**, Roundedness **0**:

- Vertical pair: 4 components from 2 original components.
- L cluster: 3 components from 2 originals.
- 2×2 block: 3 components from 2 originals.

These existed in the pre-fix sweep; they are **not new regressions**. They still need investigation. The vertical primary contact is centred and only about 0.2775px apart. Inspect how the sampled weld contour attaches to the two stamp bodies, including concave arc endpoints, self-crossings and boolean clipping. Do not hide the extra components by counting path strings or dropping pieces without checking the resulting join.

### Further coverage

The original 5,184-case sweep covers identical shapes and equal sizes. The supplemental pass above now adds a bounded mixed/unequal-size/custom/larger-layout profile. It does not exhaust every parameter combination, every possible glyph or UI performance on a full alphabet. Recheck the confirmed supplemental failures before declaring the shared geometry safe globally.

## How to continue

1. Start with the visual review and the user's rejection of non-square blends. Develop improved transitions for the failed shape families; numeric connectivity alone is not acceptance. Preserve the square diagonal look the user liked. Treat the confirmed B input-order defect and production partial ring-hole fills as correctness requirements alongside this design work, and add their exact reproductions to regression assertions before changing the implementation.
2. Address the triangle case and investigate the three star-island cases; retain their exact settings as regression cases once corrected.
3. Run the regression script, build and relevant lint checks.
4. Recompute fresh geometry with `node scripts/audit-joins.mjs --sweep` (no cache flags), then `node scripts/audit-join-coverage.mjs`. The first command can take a few minutes, especially the offset method.
5. Inspect the before/after images and representative remaining edge cases in the browser. Preserve the diagonal look the user liked.
6. Refresh the validation summaries and the review's wording to match the new results. Present the small review, not another assignment for the user to inspect every shape.

Raw temporary evidence currently exists in `/tmp/gridz-join-audit.json`, `/tmp/gridz-join-sweep.json`, `/tmp/gridz-join-before.json` and `/tmp/gridz-join-sweep-before.json`. Original source snapshots are `/tmp/gridz-softness-before.ts` and `/tmp/gridz-shapes-before.ts`. Temporary files are useful evidence but are not guaranteed to survive a cleanup. The workspace fixture and validation JSON are the durable handover data.

## Working-tree caution

The project already had extensive uncommitted changes before this work: festival/projection features, font export, JoinLab, app/UI changes, scripts and documentation. There is also an unrelated `newfontsfilmfinal1.mp4`. Preserve all of them. Do not reset the repository or treat the entire diff as this task's work. Nothing was committed, staged or published during this task.

In particular, the pre-existing `softness.ts` diff already removed an unused `d` variable in `contactNeck` and renamed an unused `xJoin` parameter to `_softness`. Those edits were not part of this weld fix.
