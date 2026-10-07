/** Archived — Export blend brush / blur UI. Product Export is preview + SVG only. */
/**
 * Export finish — finished glyph SVG + blend brush (whole-silhouette blur).
 * No per-shape metaball joins. Preview matches Download SVG.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  buildGlyphBodyMarkup,
  glyphContentBounds,
  type ExportPayload,
} from '@/lib/export'
import {
  blendBrushRadius,
  blurStdDeviation,
  type BlendBrushMode,
  type BlendDab,
} from '@/lib/softness'
import type { FilledRegion, GridConfig, ShapeDef } from '@/lib/types'

export type { BlendBrushMode }

export interface ExportFinishCanvasProps {
  grid: GridConfig
  library: ShapeDef[]
  filled: Map<string, FilledRegion>
  /** Paint Softness baked into glyph paths. */
  softness: number
  /** Export-only blur amount. */
  blendAmount: number
  cornerRadius: number
  blendDabs: BlendDab[]
  softBrush: BlendBrushMode
  brushStrength: number
  onBlendDabsChange: (next: BlendDab[]) => void
}

function parsePathMarkup(markup: string) {
  const d = /d="([^"]*)"/.exec(markup)?.[1] ?? ''
  const fill = /fill="([^"]*)"/.exec(markup)?.[1] ?? '#14202b'
  const fillRule = /fill-rule="([^"]*)"/.exec(markup)?.[1] as
    | 'nonzero'
    | 'evenodd'
    | undefined
  return { d, fill, fillRule }
}

export function ExportFinishCanvas({
  grid,
  library,
  filled,
  softness,
  blendAmount,
  cornerRadius,
  blendDabs,
  softBrush,
  brushStrength,
  onBlendDabsChange,
}: ExportFinishCanvasProps) {
  const painting = useRef(false)
  const liveDabs = useRef(blendDabs)
  liveDabs.current = blendDabs
  const svgRef = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const stop = () => {
      painting.current = false
    }
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    window.addEventListener('blur', stop)
    return () => {
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
      window.removeEventListener('blur', stop)
    }
  }, [])

  const filledRegions = useMemo(() => [...filled.values()], [filled])

  const payload: ExportPayload = useMemo(
    () => ({
      grid,
      library,
      filledRegions,
      glyphChar: 'A',
      softness,
      blendAmount,
      cornerRadius,
      blendDabs,
    }),
    [grid, library, filledRegions, softness, blendAmount, cornerRadius, blendDabs],
  )

  const glyphPaths = useMemo(
    () => (filledRegions.length ? buildGlyphBodyMarkup(payload, '#14202b') : []),
    [payload, filledRegions.length],
  )
  const box = useMemo(() => glyphContentBounds(payload, 14), [payload])
  const blur = blurStdDeviation(blendAmount, grid.cellSize)
  const brushR = blendBrushRadius(grid.cellSize, brushStrength)
  const selective = blendDabs.length > 0
  const aspect = box.width / Math.max(1, box.height)

  const clientToSvg = (clientX: number, clientY: number) => {
    const svg = svgRef.current
    if (!svg) return null
    const pt = svg.createSVGPoint()
    pt.x = clientX
    pt.y = clientY
    const ctm = svg.getScreenCTM()
    if (!ctm) return null
    const local = pt.matrixTransform(ctm.inverse())
    return { x: local.x, y: local.y }
  }

  const applyAt = (x: number, y: number) => {
    if (softBrush === 'erase') {
      const next = liveDabs.current.filter((d) => Math.hypot(d.x - x, d.y - y) > d.r * 0.85)
      liveDabs.current = next
      onBlendDabsChange(next)
      return
    }
    const dab: BlendDab = { x, y, r: brushR, strength: brushStrength }
    const next = [...liveDabs.current, dab]
    // Cap dab count for perf
    const trimmed = next.length > 400 ? next.slice(next.length - 400) : next
    liveDabs.current = trimmed
    onBlendDabsChange(trimmed)
  }

  const onPointer = (e: ReactPointerEvent) => {
    e.preventDefault()
    const p = clientToSvg(e.clientX, e.clientY)
    if (!p) return
    setHover(p)
    if (e.type === 'pointerdown') painting.current = true
    if (painting.current || e.type === 'pointerdown') applyAt(p.x, p.y)
  }

  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl border border-line bg-[#f3f6f4]"
      style={{ aspectRatio: `${aspect}` }}
    >
      <svg
        ref={svgRef}
        viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        className="block touch-none select-none"
        role="img"
        aria-label="Export blend canvas"
        data-testid="export-softness-canvas"
        data-softness={String(softness)}
        data-blend={String(blendAmount)}
        data-blur={blur.toFixed(2)}
        data-path-count={String(glyphPaths.length)}
        data-dabs={String(blendDabs.length)}
        onPointerDown={onPointer}
        onPointerMove={onPointer}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          {blur > 0.15 && (
            <filter
              id="export-blend-blur"
              x="-30%"
              y="-30%"
              width="160%"
              height="160%"
              colorInterpolationFilters="sRGB"
            >
              <feGaussianBlur in="SourceGraphic" stdDeviation={blur} />
            </filter>
          )}
          {selective && blur > 0.15 && (
            <mask
              id="export-blend-mask"
              maskUnits="userSpaceOnUse"
              x={box.x}
              y={box.y}
              width={box.width}
              height={box.height}
            >
              <rect
                x={box.x}
                y={box.y}
                width={box.width}
                height={box.height}
                fill="black"
              />
              {blendDabs.map((d, i) => (
                <circle
                  key={`dab-${i}`}
                  cx={d.x}
                  cy={d.y}
                  r={d.r}
                  fill="white"
                  fillOpacity={Math.max(0.15, d.strength)}
                />
              ))}
            </mask>
          )}
        </defs>

        <rect
          x={box.x}
          y={box.y}
          width={box.width}
          height={box.height}
          fill="#f3f6f4"
        />

        {/* Crisp base when selective; otherwise blur wraps the glyph */}
        {blur > 0.15 && !selective ? (
          <g filter="url(#export-blend-blur)" className="pointer-events-none">
            {glyphPaths.map((m, i) => {
              const { d, fill, fillRule } = parsePathMarkup(m)
              return <path key={`g-${i}`} d={d} fill={fill} fillRule={fillRule} />
            })}
          </g>
        ) : (
          <g className="pointer-events-none">
            {glyphPaths.map((m, i) => {
              const { d, fill, fillRule } = parsePathMarkup(m)
              return <path key={`g-${i}`} d={d} fill={fill} fillRule={fillRule} />
            })}
          </g>
        )}

        {blur > 0.15 && selective && (
          <g
            className="pointer-events-none"
            filter="url(#export-blend-blur)"
            mask="url(#export-blend-mask)"
          >
            {glyphPaths.map((m, i) => {
              const { d, fill, fillRule } = parsePathMarkup(m)
              return <path key={`b-${i}`} d={d} fill={fill} fillRule={fillRule} />
            })}
          </g>
        )}

        {/* Brush cursor hint */}
        {hover && filled.size > 0 && (
          <circle
            cx={hover.x}
            cy={hover.y}
            r={brushR}
            fill="none"
            stroke="rgba(31,111,106,0.55)"
            strokeWidth={1.2}
            strokeDasharray="3 3"
            className="pointer-events-none"
          />
        )}
      </svg>
      {filled.size === 0 && (
        <p className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center font-mono text-xs text-ink-muted">
          Paint a glyph first
        </p>
      )}
    </div>
  )
}
