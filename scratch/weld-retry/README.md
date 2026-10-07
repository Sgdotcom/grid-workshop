# Rejected detached-ink examples — visual retry

Preview only. No production engine files modified by this retry.

The user rejected all three examples on the Phase 1 Detached ink tab. Removing floating fragments was not an aesthetic fix.

This experiment uses existing contour-field methods instead of the generic bridge:
- Sharp stars: smooth union, half the default field strength to retain the lower arms and avoid a broad merged mass.
- Arc/notch and wedge/notch: rounded contact (closing) at the smaller stamp's scale.
- Original bodies are unioned back into each result on a 0.001px grid.

Preview compares original shapes, current raw organic weld, and candidate at 21 softness levels. Original pointed notch tips remain intentionally; no promise of visual approval. This is limited to these three arrangements, not a general engine replacement. Closing can soften concavities away from the immediate contact; that tradeoff still needs review before adoption. Field sampling is 0.65px and needs export-quality/performance work before integration.

Generate: `node scratch/weld-retry/render.mjs`
Check: `node scratch/weld-retry/check.mjs`
Open: http://127.0.0.1:43127/docs/weld-retry.html

Validation permits 0.002% original-area discrepancy from the independent oracle rounding new intersection coordinates to 0.001px; it rejects detached output components and verifies zero-softness identity. These checks do not establish visual acceptance.
