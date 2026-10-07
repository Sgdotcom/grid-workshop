import { useDeferredValue, useMemo } from 'react'
import { ChevronDown, ChevronUp, Sparkles, Type } from 'lucide-react'
import type { BrokenJoins } from '@/lib/softness'
import type { FilledRegion, GlyphDraft, GridConfig, HoleMode, ShapeDef } from '@/lib/types'
import { buildGlyphBodyMarkup } from '@/lib/export'
import { canvasPixelSize } from '@/lib/gridGeometry'

export interface WordTesterProps {
  activeChar: string
  activeFilled: Map<string, FilledRegion>
  drafts: Map<string, GlyphDraft>
  grid: GridConfig
  library: ShapeDef[]
  softness: number
  cornerRadius: number
  brokenJoins: BrokenJoins
  holeMode?: HoleMode
  /** The text being proofed. Owned by the app so it survives collapsing and reloads. */
  value: string
  onValueChange: (value: string) => void
  collapsed?: boolean
  onToggleCollapsed?: () => void
  onSelectChar: (char: string) => void
}

const PRESET_WORDS = ['HOH', 'noon', 'hamburge', 'type', 'minimum', 'PACK', 'åäö']

interface Ink {
  markup: string
  viewBox: string
}

function inkFor(
  regions: FilledRegion[],
  grid: GridConfig,
  library: ShapeDef[],
  softness: number,
  cornerRadius: number,
  brokenJoins: BrokenJoins,
  holeMode: HoleMode,
  char: string,
): Ink | null {
  if (!regions.length) return null
  try {
    const { width, height } = canvasPixelSize(grid)
    const markup = buildGlyphBodyMarkup(
      { grid, library, filledRegions: regions, glyphChar: char, softness, cornerRadius, brokenJoins, holeMode },
      '#000000',
    ).join('')
    return markup ? { markup, viewBox: `0 0 ${width} ${height}` } : null
  } catch {
    return null
  }
}

export function WordTester({
  activeChar,
  activeFilled,
  drafts,
  grid,
  library,
  softness,
  cornerRadius,
  brokenJoins,
  holeMode = 'open',
  value,
  onValueChange,
  collapsed = false,
  onToggleCollapsed,
  onSelectChar,
}: WordTesterProps) {
  const tokens = useMemo(() => [...value], [value])
  const charsKey = useMemo(() => [...new Set(tokens)].filter((ch) => ch.trim()).join(''), [tokens])

  // Painting must stay fluid: the proof follows a beat behind the canvas.
  const liveFilled = useDeferredValue(activeFilled)
  const liveSoftness = useDeferredValue(softness)
  const liveCorner = useDeferredValue(cornerRadius)

  // Saved letters keep the Softness, corners, joins and grid they were drawn with.
  const savedInk = useMemo(() => {
    const map = new Map<string, Ink>()
    if (collapsed) return map
    for (const ch of charsKey) {
      if (ch === activeChar) continue
      const draft = drafts.get(ch)
      if (!draft) continue
      const ink = inkFor(
        draft.filled,
        draft.grid ?? grid,
        library,
        draft.softness ?? 0.55,
        draft.cornerRadius ?? 0,
        new Set(draft.brokenJoins),
        draft.holeMode ?? 'open',
        ch,
      )
      if (ink) map.set(ch, ink)
    }
    return map
  }, [charsKey, activeChar, drafts, grid, library, collapsed])

  const activeInk = useMemo(
    () =>
      collapsed || !charsKey.includes(activeChar)
        ? null
        : inkFor([...liveFilled.values()], grid, library, liveSoftness, liveCorner, brokenJoins, holeMode, activeChar),
    [collapsed, charsKey, activeChar, liveFilled, grid, library, liveSoftness, liveCorner, brokenJoins, holeMode],
  )

  return (
    <div className="shrink-0 border-t border-line/60 bg-paper-deep/30 px-3 py-2" data-testid="word-tester">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          data-testid="word-tester-toggle"
          aria-expanded={!collapsed}
          disabled={!onToggleCollapsed}
          onClick={onToggleCollapsed}
          className="flex items-center gap-1.5 text-[11px] font-bold text-ink-muted enabled:hover:text-ink"
        >
          <Type className="h-3.5 w-3.5" />
          <span>Word tester</span>
          {onToggleCollapsed &&
            (collapsed ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />)}
        </button>

        {!collapsed && (
          <div className="flex flex-wrap items-center gap-1">
            {PRESET_WORDS.map((word) => (
              <button
                key={word}
                type="button"
                onClick={() => onValueChange(word)}
                className="rounded border border-line bg-paper px-1.5 py-0.5 text-[10px] font-semibold text-ink-muted hover:border-ink/50 hover:text-ink"
              >
                {word}
              </button>
            ))}
            <button
              type="button"
              title="Test the current letter between two o's"
              onClick={() => onValueChange(`${activeChar}o${activeChar}`)}
              className="flex items-center gap-1 rounded border border-brass/60 bg-brass/10 px-1.5 py-0.5 text-[10px] font-semibold text-ink hover:bg-brass/20"
            >
              <Sparkles className="h-2.5 w-2.5 text-brass-deep" />
              <span>
                {activeChar}o{activeChar}
              </span>
            </button>
          </div>
        )}
      </div>

      {!collapsed && (
        <>
          <input
            type="text"
            value={value}
            aria-label="Text to test"
            onChange={(e) => onValueChange(e.target.value.slice(0, 40))}
            placeholder="Type words to test spacing and rhythm…"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="mt-1.5 w-full rounded border border-line bg-paper px-2 py-1 font-mono text-xs text-ink placeholder:text-ink-muted/50 focus:border-ink focus:outline-none"
          />

          <div className="-mx-1 mt-2 overflow-x-auto px-1 pb-1">
            <div className="flex min-w-max items-end gap-1.5 rounded border border-line/60 bg-paper p-2 shadow-sm">
              {tokens.map((ch, idx) => {
                if (!ch.trim()) return <div key={`space-${idx}`} className="w-5 shrink-0" />
                const isActive = ch === activeChar
                const ink = isActive ? activeInk : savedInk.get(ch)
                return (
                  <button
                    key={`${ch}-${idx}`}
                    type="button"
                    onClick={() => onSelectChar(ch)}
                    title={`Edit "${ch}"`}
                    className={`group flex shrink-0 flex-col items-center rounded p-1 transition-colors ${
                      isActive ? 'bg-brass/15 ring-1 ring-brass' : 'hover:bg-paper-deep/80'
                    }`}
                  >
                    <div className="flex h-14 w-11 items-center justify-center lg:h-16 lg:w-12">
                      {ink ? (
                        <svg
                          viewBox={ink.viewBox}
                          className="h-full w-full"
                          aria-hidden="true"
                          dangerouslySetInnerHTML={{ __html: ink.markup }}
                        />
                      ) : (
                        <span className="font-sans text-2xl font-bold opacity-15">{ch}</span>
                      )}
                    </div>
                    <span
                      className={`mt-0.5 font-mono text-[10px] font-bold ${
                        isActive ? 'text-brass-deep' : 'text-ink-muted group-hover:text-ink'
                      }`}
                    >
                      {ch}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
