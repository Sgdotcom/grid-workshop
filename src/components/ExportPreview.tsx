/**
 * Export preview — finished glyph only (Softness joins baked in).
 * No blend brush / blur. Matches Download SVG.
 */

import { useMemo } from 'react'
import { buildSvgMarkup, type ExportPayload } from '@/lib/export'
import type { BrokenJoins } from '@/lib/softness'
import type { FilledRegion, GridConfig, HoleMode, ShapeDef } from '@/lib/types'

export interface ExportPreviewProps {
  grid: GridConfig
  library: ShapeDef[]
  filled: Map<string, FilledRegion>
  softness: number
  cornerRadius: number
  brokenJoins: BrokenJoins
  holeMode?: HoleMode
}

export function ExportPreview({
  grid,
  library,
  filled,
  softness,
  cornerRadius,
  brokenJoins,
  holeMode = 'open',
  compact = false,
  caption,
}: ExportPreviewProps & { compact?: boolean; caption?: string }) {
  const svg = useMemo(() => {
    if (filled.size === 0) return null
    const payload: ExportPayload = {
      grid,
      library,
      filledRegions: [...filled.values()],
      glyphChar: caption || 'A',
      softness,
      cornerRadius,
      brokenJoins,
      holeMode,
    }
    return buildSvgMarkup(payload)
  }, [grid, library, filled, softness, cornerRadius, brokenJoins, holeMode, caption])

  if (!svg) {
    return (
      <div className="overflow-hidden rounded-[3px] border border-ink/15 bg-paper-deep">
        <p className="px-4 py-14 text-center text-xs text-ink-muted">Paint on the Paint tab first.</p>
      </div>
    )
  }

  return (
    <div
      data-testid={compact ? undefined : 'export-preview'}
      className={
        compact
          ? 'overflow-hidden rounded-none border border-ink/20 bg-paper'
          : 'overflow-hidden rounded-none border border-ink bg-paper-deep'
      }
    >
      <img
        alt={caption ? `Finished ${caption}` : 'Finished glyph preview'}
        data-testid={compact ? undefined : 'export-softness-canvas'}
        className={
          compact
            ? 'mx-auto block h-16 w-16 object-contain p-1'
            : 'mx-auto block max-h-[min(36vh,240px)] w-full object-contain p-3 lg:max-h-[min(72vh,560px)] lg:p-8'
        }
        src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
      />
    </div>
  )
}

export function GlyphThumb({
  svg,
  char,
  active,
  onClick,
}: {
  svg: string
  char: string
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      data-testid={`export-glyph-${char}`}
      aria-label={`Open letter ${char}`}
      aria-pressed={active}
      onClick={onClick}
      className={
        active
          ? 'flex w-16 shrink-0 flex-col overflow-hidden rounded-none border border-brass bg-ink text-paper'
          : 'flex w-16 shrink-0 flex-col overflow-hidden rounded-none border border-ink/20 bg-paper text-ink'
      }
    >
      <img
        alt=""
        className="h-14 w-full object-contain bg-paper p-1"
        src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
      />
      <span className="py-0.5 text-center font-sans text-xs font-bold">{char}</span>
    </button>
  )
}
