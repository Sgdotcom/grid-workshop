import type { GridConfig } from '@/lib/types'

/** Original workshop lattice. Detail > 1 subdivides this recipe. */
export const DEFAULT_GRID: GridConfig = {
  cols: 7,
  rows: 9,
  cellSize: 40,
  gap: 2,
}

export const DEFAULT_BRUSH = 42

export function formatPx(n: number) {
  const rounded = Math.round(n * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

/** More cells and smaller stamps; overall glyph size stays near the original. */
export function gridFromDetail(detail: number) {
  return {
    grid: {
      cols: Math.round(DEFAULT_GRID.cols * detail),
      rows: Math.round(DEFAULT_GRID.rows * detail),
      cellSize: DEFAULT_GRID.cellSize / detail,
      gap: Math.round((DEFAULT_GRID.gap / detail) * 10) / 10,
    } satisfies GridConfig,
    brushSize: DEFAULT_BRUSH / detail,
  }
}

export function stepSize(grid: GridConfig) {
  return grid.cellSize + grid.gap
}

export function canvasPixelSize(grid: GridConfig) {
  const baseW = grid.cols * grid.cellSize + (grid.cols - 1) * grid.gap
  const baseH = grid.rows * grid.cellSize + (grid.rows - 1) * grid.gap
  return { width: baseW, height: baseH }
}

export function cellOrigin(col: number, row: number, grid: GridConfig) {
  const step = stepSize(grid)
  return { x: col * step, y: row * step }
}

export function cellCenter(col: number, row: number, grid: GridConfig) {
  const { x, y } = cellOrigin(col, row, grid)
  return { cx: x + grid.cellSize / 2, cy: y + grid.cellSize / 2 }
}

/** Arial Bold vertical metrics as fractions of the font size (hhea ascent/descent, OS/2 heights). */
export const ARIAL_METRICS = { ascent: 0.9053, descent: 0.2119, cap: 0.716, xHeight: 0.519 } as const

/**
 * Construction box from fixed Arial metrics, aligned to the centred letter guide.
 * Deterministic (nothing is measured), so the font export uses it: every machine
 * produces the same baseline whether or not Arial is installed.
 */
export function letterGuideMetrics(width: number, height: number, letterScale: number) {
  const em = Math.min(width, height) * 0.92 * letterScale
  const cx = width / 2
  const cy = height / 2
  // The guide is drawn with dominant-baseline: central, i.e. the em box is centred on cy.
  const baseline = cy + ((ARIAL_METRICS.ascent - ARIAL_METRICS.descent) / 2) * em
  const cap = baseline - em * ARIAL_METRICS.cap
  const descender = baseline + em * ARIAL_METRICS.descent
  const pad = Math.max(1.5, em * 0.03)
  return {
    em,
    cx,
    cy,
    emTop: cap - pad,
    emBottom: descender + pad,
    emLeft: cx - em * 0.36,
    emRight: cx + em * 0.36,
    cap,
    xHeight: baseline - em * ARIAL_METRICS.xHeight,
    baseline,
    descender,
  }
}

let measureCtx: CanvasRenderingContext2D | null | undefined

function measureFontContext() {
  if (measureCtx !== undefined) return measureCtx
  if (typeof document === 'undefined') {
    measureCtx = null
    return null
  }
  measureCtx = document.createElement('canvas').getContext('2d')
  return measureCtx
}

/** Construction grid sized to the current guide letter and the same font-size. */
export function letterGuideMetricsForLetter(
  width: number,
  height: number,
  letterScale: number,
  letter: string,
) {
  const fallback = letterGuideMetrics(width, height, letterScale)
  const ctx = measureFontContext()
  const ch = letter.slice(0, 1)
  if (!ctx || !ch) return fallback

  const fontSize = Math.min(width, height) * 0.92 * letterScale
  const cx = width / 2
  const cy = height / 2
  ctx.font = `700 ${fontSize}px Arial, Helvetica, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'

  const font = ctx.measureText('H')
  const fontAscent = font.fontBoundingBoxAscent || font.actualBoundingBoxAscent
  const fontDescent = font.fontBoundingBoxDescent || font.actualBoundingBoxDescent
  if (!(fontAscent > 0)) return fallback

  const baseline = cy + (fontAscent - fontDescent) / 2
  const capM = ctx.measureText('H')
  const xM = ctx.measureText('x')
  const pM = ctx.measureText('p')
  const letterM = ctx.measureText(ch)
  const pad = Math.max(1.5, fontSize * 0.03)
  const cap = baseline - capM.actualBoundingBoxAscent
  const xHeight = baseline - xM.actualBoundingBoxAscent
  const descender = baseline + Math.max(pM.actualBoundingBoxDescent, fontDescent * 0.35)

  return {
    em: descender - cap,
    cx,
    cy,
    emTop: cap - pad,
    emBottom: descender + pad,
    emLeft: cx - letterM.actualBoundingBoxLeft - pad,
    emRight: cx + letterM.actualBoundingBoxRight + pad,
    cap,
    xHeight,
    baseline,
    descender,
  }
}
