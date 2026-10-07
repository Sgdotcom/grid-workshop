# Softness blend — handoff for the next agent

Phone-first shape-grid letter tool (`gridz`). Paint stamps modules on a 40px cell grid (2px gap). **Softness** should melt neighboring stamps into **one organic outline** — like circles blobbing — without a glued-on bridge, diamond collar, extra island, or swallowed silhouette.

**Do not ask the user to drag sliders.** Test automatically. Inspect the HTML gallery visually. The user is targeting iOS later; keep the Paint UI phone-first (chrome collapsed by default).

---

## Goal

When two (or more) of the **same** shape sit in adjacent cells:

- Softness **0** → crisp separate stamps.
- Softness **low** → small neck only if they almost touch.
- Softness **100%** → a blobby, connected silhouette. Not a thin rectangle inserted between them. Not a third floating shape. Not a diamond spike sticking out of capsules.
- Original character of stars / crosses / chevrons should still read; do not flood their concavities into a blob that erases the glyph.
- Capsules (H and V, and H next to V) must join like circles, not grow a diamond collar.
- Rings keep their holes.

The user also asked that **X look like a plus rotated 45°** (same bar thickness as Cross). That is already implemented in `src/lib/shapes.ts` (`plusVertices` + `rotateAbout`).

---

## Constraints (do not break)

- **Do not edit the melt plan file** (`organic_rounded_blending_*.plan.md`).
- **Do not commit or push** unless the user asks.
- **Do not replace** the `origin` remote (`origin.cursor.com`). GitHub is `github` (`Sgdotcom/gridz`).
- Keep smoke-critical UI: testids, `Start workshop`, h1 `Shape`, paint-export, options-gear.
- Do not execute deletions from `DEADCODE.md`.
- Work in **Agent** (or Cursor **Debug**). Ask mode cannot run the matrix or edit code.

---

## How to test (mandatory)

```bash
# If npx vite-node hits EPERM on this machine, use the cached binary:
/Users/simongrey/.npm/_npx/f2342a4b64a2bc92/node_modules/.bin/vite-node scripts/fuse-matrix.ts
```

Or `npm run fuse:matrix` if `vite-node` resolves.

**900 cases:** every `PRESET_SHAPES` × sizes 24/42/56 × softness 0.35/0.55/1 × corners 0/8/18 × H/V, plus L-clusters.

Writes:

- `/tmp/gridz-fuse-matrix.json` — `flagged` list
- `/tmp/gridz-fuse-matrix.html` — visual gallery

Serve the gallery (`python3 -m http.server 8765` in `/tmp`) and **look at the tiles**. Numeric flags miss diamond collars, swallowed stars, and tilted necks. A single screenshot of the 35% row is not enough — check 24px @ 100%, vertical pairs, H+V capsules, and L-clusters.

Matrix grid matches Paint: `{ cols: 3, rows: 3, cellSize: 40, gap: 2 }`. A 24px stamp in a 40px cell has ~18px outline gap to its neighbor. 42px stamps nearly fill the cell (centers 42px apart).

`expectSeparate` in the matrix is `size <= 28 && softness < 0.95`. 24px @ 35%/55% may stay apart; 24px @ 100% **must** fuse.

Dev app: `npm run dev` → `http://127.0.0.1:43127` (do not use this as the primary test loop).

---

## Current fuse architecture

Live code: `src/lib/softness.ts`. Boolean union via `polygon-clipping` (`src/lib/polyBool.ts`).

`blendPairPolygons`:

1. **Circles / rings** → center-based `metaballRing` (holes punched back out for rings).
2. **Everything else** → `contactNeck`: a **stadium** between the closest outline points, inset toward each stamp center so the neck overlaps both silhouettes, thickness capped to `stamp.arm`.

Then `fuseComponent` unions pair-necks + original stamp polygons. If no member is a ring (`rings.length < 2`), **drop interior rings** so overlapping X/stars do not keep accidental holes.

Fused SVG paths use `fill-rule="nonzero"` (`Canvas.tsx` finish, `export.ts`, fuse-matrix gallery). Rings still get holes from `differencePolygons`.

Key knobs:

```ts
fuseMaxGap = meanSize * (0.16 + softness * 1.12)  // * 0.72 on circular diagonals
contactNeck r = arm * (0.32 + 0.7 * softness)
inset = min(r * 0.55, arm * 0.45)
```

`closestOutlinePoints` densifies contacts (`shapeContactSamples`). Among pairs within 0.45px of the minimum gap, it prefers **axis-aligned** hits (small Δy for horizontal neighbors, small Δx for vertical), then the pair nearest the stamp center. Do **not** move the contact points onto the center line — that broke stacked chevrons.

X preset = Cross rotated 45° and fit back into the box.

Debug `fetch` logs are still in `softness.ts` / `sdfBlend.ts` (`#region agent log`). Remove them only after the user confirms the look is good. In Cursor Debug mode, POST to the ingest URL from the system reminder (session/log path change per session).

---

## What the logs already proved

| Hypothesis | Result | Evidence |
|---|---|---|
| smin `blendK` capped below the gap → no weld | **Confirmed, then fixed** | Square 24px 100%: gap 18, old k≈11.5, two outlines |
| Raising k alone | **Rejected** | Extra marching-squares islands |
| Centroid metaballs on sharp squares/octagons | Works for some convex; **fails triangles** | Discs miss facing tips |
| Outline-centered contact metaball (`d > 2r`) | **Rejected** | `r=8.64`, `d=18` → `outPaths:3` floating bridge |
| `gap < 1.5` skip neck (already touching) | **Rejected** | Circles that kiss at a point stayed 2 outlines (148+ flags) |
| Contact **metaball** at inset points with small `arm` radius | **Rejected** | 148 multi-outline; peanut in the gap does not overlap stamps |
| Snap contact x/y onto the neighbor axis | **Rejected** | Chevron V stopped fusing (points left the arms) |
| Midpoint-of-pair closest to cell midpoint | **Rejected for pluses** | 24px Cross H: `pdy:3.84`, `deg:8.7` — diagonal pair straddles center |
| Inset **stadium** + arm-capped radius + skew pick | **Confirmed** | 900/900 unflagged; Cross H `deg:0`, `pay=pby=20` |

Matrix last green run: **900 total, 0 flagged, 0 multi-outline, 0 islands**.

---

## Remaining visual problems (flags will not catch these)

Inspect `/tmp/gridz-fuse-matrix.html`:

1. **24px Cross @ 100%** — now a horizontal bar between two pluses (fixed tilt). Still looks like a *bar*, not a circle-style peanut. User wants organic blob, not an inserted capsule.
2. **Stars / 4-star @ 100%** — thin stadium bar between tips. Better than swallowing them; still a bit “glued on”.
3. **Triangle @ 35%** — small round blob on the facing edges; stacked V @ 100% looks like an arrow with a waist.
4. **X stacked vertically @ 42px 100%** — two overlapping diagonal pluses; crotch can still read as a diamond gap (geometry of two X’s, not a second path).
5. **Pentagon / some convex @ 35%** — short stadium neck, flatter than circle metaballs.
6. **H capsule beside V capsule** — much better than the old diamond collar; 100% still a bit lumpy at the corner.
7. **Header comment in `softness.ts` is stale** — it still describes smin remesh + centroid metaballs for capsules. Live path is circle metaball + contact stadium.

Do not “fix” these by flooding concavities (old smin remesh) or by putting huge discs on outline points (floating bridges).

---

## Approaches that already failed (do not revive blindly)

- Full-component cubic-smin field extract / pair-solid remesh (`extractFieldPaths`, `evalPairFillet`, `blendStampRings` on live fuse). Archived ideas under `archive/`. `blendStampRings` is **not** on the live pair path anymore.
- Centroid 2-disc metaballs on capsules/rects/diamonds → **diamond collars**.
- smin remesh of stars/X/cross/chevron → filled valleys, extra islands, lag.
- `contactNeck` with two large circles + metaball sized from **gap** (`r ≈ d*0.52`) → swallowed stars/crosses, bump on rectangles.
- Skipping the neck when `gap < 1.5`.
- Axis-snapping contact coordinates.

---

## Files to touch

| File | Role |
|---|---|
| `src/lib/softness.ts` | Fuse: `contactNeck`, `fuseMaxGap`, `closestOutlinePoints`, `fuseComponent` |
| `src/lib/polyBool.ts` | `metaballRing`, `unionPolygons`, `toPolygon` |
| `src/lib/shapes.ts` | Silhouettes, `shapeContactSamples`, `shapeOutlineRings`, Cross/X |
| `src/lib/sdfBlend.ts` | Dead for live fuse; still has debug log in `blendStampRings` |
| `scripts/fuse-matrix.ts` | Automatic test + gallery |
| `src/components/Canvas.tsx` | Finish paths `fillRule="nonzero"` |
| `src/lib/export.ts` | SVG export fill-rule |

`polygon-clipping` treats point-touch as disjoint. Necks must **overlap interiors**, not just kiss an outline vertex.

---

## Suggested next steps

1. Keep `npm run fuse:matrix` (or cached `vite-node`) as the regression gate. Stay at **0 flagged**.
2. Open the gallery and judge **organic vs bar**. If the stadium reads as a bridge, replace it with a neck that still overlaps both stamps (inset) but has a concave waist — without going back to gap-sized discs.
3. Optionally log `hypothesisId` + `runId` via the Debug ingest; grep `preset-cross` / `size:24` / `deg` in the session log.
4. After the user likes the look, **delete all `#region agent log` fetch calls**.

---

## Product reminder

This is a letter-building workshop: fused SVG → later Cloudflare → OTF. Joins must be a **single fillable outline** suitable for a glyph, not a pile of overlapping circles. iOS will be SwiftUI + a ported geometry core, not Capacitor — keep the fuse logic in `src/lib`, not in React.
