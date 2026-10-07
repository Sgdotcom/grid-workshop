# Arc / flat-side contacts — 1 October 2026

Preview only; no production changes. User requested arcs blending with squares and flat arc ends, followed by consistent relative sizing at the same px setting. Size clarification asked: dimensions vs optical weight. Pending answer, preview uses longest unrotated dimension after corner rounding, preserving aspect ratio.

## Arc candidate

Eight arrangements × five softness levels. Morphological closing at 65% of the existing field radius, unioned with original bodies. Protect the arc's quarter-circle opening; continue the inner contour with cubic transitions across the flat-end gap. Keep an exit to the outside for bottom contacts so a small arc above a large square does not create a closed hole.

This is an isolated experimental treatment, not the approved production arc-pair implementation. It requires wider rotation/cluster/export/performance testing before integration. Field discretization remains 0.65px; slight contour ripples are still visible. Protected opening model uses the current 0.28 inner-radius ratio and should use shared shape metadata in any final implementation. Original rounded caps can differ slightly from this idealized opening.

Generate `node scratch/arc-flat/render.mjs`; check `node scratch/arc-flat/check.mjs`.
Preview: `/docs/arc-flat-preview.html`.
Checks: 40 frames retain original bodies within a 0.005% coordinate-rounding tolerance, have no detached components or newly closed holes, and keep zero softness unchanged. Visual inspection covered all eight at full softness. These checks are not visual approval.

## Size candidate

Audit 342 configurations: 19 presets × 3 sizes × 2 corner settings × 3 rotations. Rounded tips shrink several actual extents; fitVerticesToBox also includes a 0.998 scale. At 37px / corners2: square37; arc36.869; diamond35.586; star5 35.144.

Preview 114 unrotated before/after frames. Uniformly scale the actual rounded outlines to the requested longest side, recenter, preserve proportions. Assertions check size and aspect ratio. Rotation should apply AFTER normalizing the base shape, preserving physical size as it turns; a rotated square naturally has a larger axis-aligned box at45°. No optical weight equalization is claimed. Proposed geometry is not integrated into paths, contacts, or exports.

Generate and check `node scratch/arc-flat/sizes.mjs`.
Preview: `/docs/shape-size-preview.html`.
