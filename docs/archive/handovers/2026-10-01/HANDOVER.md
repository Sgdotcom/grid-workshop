# Project Handover — Gridz Font Builder
**Core Objective: Fine-Tuning Shape Welding & Organic Softness**

*See full comprehensive code review, mathematical models, line numbers, and bug diagnoses in [**CHATGPT_HANDOVER.md**](file:///Users/simongrey/Desktop/gridz/CHATGPT_HANDOVER.md).*

---

### Approved update — 1 October 2026

Arc/flat-side blends, longest-side px sizing after rounding, and smoother capsule outlines are now implemented. See the newest CHATGPT_HANDOVER.md section for scope, verification and remaining field-sampling limits. Applied previews: `docs/arc-flat-applied.html` and `docs/capsules-applied.html`.

### 1. Current State
- **Build & Tests:** 100% green (`npm run build` exits 0; all test suites pass including `smoke-weld-alignment`, `smoke-arc-weld`, `smoke-cd-features`, `smoke-beginner-features`, `smoke-hole-mode`).
- **Engines:** Three engine modes supported in `src/lib/shapeJoinRegistry.ts`: `'main'` (optimal per-shape joins), `'fork-weld'` (pure Method B), and `'fork-current'` (legacy Method A).

### 2. The Core Problem: Visual Quality on Non-Square Shapes
- The user loved the curved diagonal "inner-circle melt" and symmetrical welds on squares.
- **The critical user feedback:** **Many non-square welds look terrible.**
- **The Golden Rule:** Passing numeric geometry/boolean checks is necessary, but **not sufficient**. Welds must avoid skinny "dog-bone" bars, accidental loops/spikes, distorted silhouettes, and asymmetric waists.

### 3. The 4 Priority Code Diagnoses in `src/lib/softness.ts` (`organicWeld`):
1. **Input-Order Invariance Defect (Lines 775–835):** Reversing stamp array order alters the shape by up to 44.5% across 171 configurations (e.g. Circle + 4-Star). Symmetrize or canonicalize pair ordering.
2. **Sharp-Star Detached Island Slivers (Lines 949–953 & 1550–1565):** 56px Star at Softness 0.2 creates floating sliver islands near concave crotches. Filter out detached micro-islands.
3. **Triangle Vertical Pair Asymmetry (Lines 791–796):** Asymmetry of 0.88% because the mirrored site check uses a discrete point tolerance of `1e-4`, which fails on discretely sampled triangles. Relax tolerance or use segment projection.
4. **Ring Hole Bleeding (Lines 1391–1394 & 1563–1566):** Welding bleeds ~5.3px² into small 24px rings. Ensure all interior rings (`s.rings.slice(1)`) are strictly subtracted before and after polygon union.

### 4. How to Fine-Tune Non-Square Shapes:
- **Learn from the `arcPair` Success:** `arcPair` (lines 864–884) solved the arc welding problem cleanly by replacing the generic binary search with a two-cubic shared waist tangent model.
- Apply specialized waist/tangent models to:
  - **Diamonds:** Prevent 45° straight-bar flattening.
  - **Triangles & Wedges:** Conical flare at vertices instead of parallel struts.
  - **Cross, X, Chevron (The Problem Triad):** Merge dual struts into a single saddle contour to eliminate trapped slits/holes.

### 5. Verification Tools:
- **Join Lab:** Run `npm run dev` → open `http://localhost:5173/?view=join-lab`.
- **Review Gallery:** Open `docs/blend-visual-review.html` in browser (or re-render with `node scripts/render-blend-review.mjs`).
- **Regression Suites:** `node scripts/smoke-weld-alignment.mjs` and `node scripts/smoke-arc-weld.mjs`.
