import type { FestivalSession } from './festival'
import { DEFAULT_FONT_DESIGN, STANDARD_CHARACTERS } from './fontDesign'

export function restoreDeskCharacter(session: FestivalSession | null, char: string | null): FestivalSession | null {
  if (!session || !char || !(STANDARD_CHARACTERS.includes(char) || session.customSymbols?.some(symbol => symbol.char === char && !symbol.deleted))) return session
  const drafts = new Map(session.drafts.map(draft => [draft.char, draft]))
  drafts.set(session.active.char, session.active)
  const active = drafts.get(char) ?? { ...session.active, char, filled: [], brokenJoins: [], fontDesign: DEFAULT_FONT_DESIGN, softness: .55, cornerRadius: 0, holeMode: 'open' as const }
  return { ...session, active, drafts: [...drafts.values()] }
}
