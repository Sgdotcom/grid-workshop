# Phase 1 weld correction candidate — 28 September 2026

This candidate is isolated. No workshop engine changes were applied in this pass. The approved arc implementation remains in production. Preview: http://127.0.0.1:43127/docs/phase1-weld-preview.html.

## Changes under review

- Canonical geometry-based argument ordering for organicWeld when no explicit contact site is supplied. Stamp ids do not influence this order.
- Normalize non-arc bridge pieces on a 0.001px grid and keep pieces attached to either original body. Shared-edge contact is accepted; original stamp components are never pruned. The approved arc construction is unchanged.
- Restore original interior rings after Fill Gaps in the candidate welding pipeline. Open and explicit Solid modes keep their intended behaviour.
- No triangle tolerance change: the exact reported triangle case already passes and the code already projects onto segments.

Rebuild candidate: `node scratch/phase1/build-candidate.mjs`.
Verify: `node scratch/phase1/smoke-weld-alignment.mjs`, `node scratch/phase1/smoke-arc-weld.mjs`, `node scratch/phase1/verify.mjs`, `node scratch/phase1/audit.mjs`.
Render: `node scratch/phase1/render.mjs`.
Typecheck: `node node_modules/typescript/bin/tsc --project scratch/phase1/tsconfig.json`.

## Evidence

Current and candidate pass the 128 weld checks and 288 arc configurations plus 21 approved arc frames. Candidate also passes 1,520 exact pair-order/id checks, 60 ring-mode checks, and 20 square diagonal reference frames. Ring-area verification allows 0.01 square pixels for the oracle's 0.001px coordinate quantization. Build and relevant lint/type checks pass.

Both coverage audits rendered 9,408 configurations, checked 9,408 reversed orders, 4,632 rotations and 48 O counters. Baseline has 3 detached-addition flags; candidate has 0. Neither reports order failures over the audit's 0.5% area threshold. Both still report 28 raw-weld body-loss cases, 28 raw-weld rotation differences and one workshop-path wedge body-loss case. These were NOT fixed by this candidate. Original sharp-star sliver reproduction no longer fails, though its low-softness pair remains disconnected. The new sliver cases involve arcs/wedges with notches/crosses.

Files: `baseline-validation.json`, `validation.json`, `preview-validation.json`. The audits' sourceHashes describe production files, not the isolated candidate; candidateSourceSha256 is added separately to validation.json.

## Limits and next work

The 10-case preview makes the unresolved wedge loss explicit. Visual checking confirms reference silhouettes remain unchanged and Fill Gaps can retain the ring hole; it does not establish aesthetic success for stars/crosses/X/chevrons.

The ring-mode proposal currently covers the welding function. Canvas/export also perform hole filtering after punch-outs and on zero-softness paths; those integration points need a common hole-preservation policy when the candidate is approved. Do not claim the complete UI/export pipeline is fixed yet. Solid mode must remain deliberately solid, and original cutouts must not be confused with incidental gap holes.

The standard review generator was repaired to include all 19 presets (228 B/C renders) and refresh public/docs/blend-visual-review.html, which Vite was serving ahead of docs/blend-visual-review.html. Browser inspection confirmed the regenerated gallery and candidate preview. No Phase 2 contour redesign was applied.
