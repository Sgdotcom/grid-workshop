import type { GlyphDraft } from './types'

// A remote edit or letter switch must start a fresh resize source. Ignore clocks:
// local persistence advances them even when the drawing has not changed.
export function resizeIdentity(draft: GlyphDraft): string {
  const { char, filled, grid, brokenJoins, softness, cornerRadius, holeMode, fontDesign } = draft
  return JSON.stringify({ char, filled, grid, brokenJoins, softness, cornerRadius, holeMode, fontDesign })
}
