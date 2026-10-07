import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  canvasPixelSize,
  cellCenter,
  cellOrigin,
  letterGuideMetricsForLetter,
  stepSize,
} from '@/lib/gridGeometry'
import { moduleShapeFillRule, moduleShapePath, shapeOutlineRings } from '@/lib/shapes'
import {
  makeSoftStamp,
  softnessFinishPathList,
  softnessFinishPolygons,
  softnessJoinHints,
  type BrokenJoins,
  type SoftStamp,
} from '@/lib/softness'
import {
  differencePolygons,
  filterPolygonHolesPreserving,
  intentionalHoleCutters,
  multiPolygonToPathList,
  toPolygon,
  unionPolygons,
} from '@/lib/polyBool'
import type { Polygon } from 'polygon-clipping'
import type { FilledRegion, GridConfig, HoleMode, ShapeDef } from '@/lib/types'
import { regionKey } from '@/lib/types'
import { getMirroredCoord } from '@/lib/skeletons'

const INK = '#000000'
const PAPER = '#ffffff'

function resolveShape(library: ShapeDef[], id: string): ShapeDef {
  return library.find((s) => s.id === id) ?? library[0]
}

function pointerToCell(
  svg: SVGSVGElement,
  e: { clientX: number; clientY: number },
  grid: GridConfig,
): { col: number; row: number } | null {
  const ctm = svg.getScreenCTM()
  if (!ctm) return null
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
  const step = stepSize(grid)
  if (step <= 0) return null
  const col = Math.floor(p.x / step)
  const row = Math.floor(p.y / step)
  if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return null
  return { col, row }
}

export type PaintTool = 'stamp' | 'erase' | 'break-join'

export interface ShapeGridCanvasProps {
  grid: GridConfig
  library: ShapeDef[]
  shapeId: string
  filled: Map<string, FilledRegion>
  onChange: (next: Map<string, FilledRegion>) => void
  brushSize: number
  brushRotation?: number
  stampMode?: 'ink' | 'cutout'
  symmetryMode?: 'none' | 'horizontal' | 'vertical'
  cornerRadius: number
  guideLetter: string
  showLetterGuide: boolean
  letterScale: number
  guideOpacity: number
  softness: number
  brokenJoins: BrokenJoins
  onBrokenJoinsChange: (next: BrokenJoins) => void
  paintTool: PaintTool
  invertPreview?: boolean
  /** When false, join-break dots are hidden. */
  showJoinDots?: boolean
  showGridGuide?: boolean
  gridGuideOpacity?: number
  holeMode?: HoleMode
  /** Bumps when per-shape melt-off prefs change so Softness re-fuses. */
  meltOffRevision?: number
}

export function ShapeGridCanvas({
  grid,
  library,
  shapeId,
  filled,
  onChange,
  brushSize,
  brushRotation = 0,
  stampMode = 'ink',
  symmetryMode = 'none',
  cornerRadius,
  guideLetter,
  showLetterGuide,
  letterScale,
  guideOpacity,
  softness,
  brokenJoins,
  onBrokenJoinsChange,
  paintTool,
  invertPreview = false,
  showJoinDots = false,
  showGridGuide = false,
  gridGuideOpacity = 0.7,
  holeMode = 'open',
  meltOffRevision = 0,
}: ShapeGridCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const painting = useRef(false)
  const paintValue = useRef(true)
  const lastCell = useRef<{ col: number; row: number } | null>(null)
  const live = useRef(filled)
  live.current = filled
  const frozenFilled = useRef(filled)
  const [strokeLive, setStrokeLive] = useState(false)
  const [hover, setHover] = useState<{ col: number; row: number } | null>(null)

  if (!strokeLive) frozenFilled.current = filled

  useEffect(() => {
    const stop = () => {
      if (!painting.current) return
      painting.current = false
      setStrokeLive(false)
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

  const { width, height } = canvasPixelSize(grid)
  const brushShape = resolveShape(library, shapeId)
  const step = stepSize(grid)
  const fontSize = Math.min(width, height) * 0.92 * letterScale

  const bg = invertPreview ? INK : PAPER
  const fillColor = invertPreview ? PAPER : INK
  const guideStroke = invertPreview
    ? `rgba(247,250,248,${0.2 * guideOpacity})`
    : `rgba(20,32,43,${0.12 * guideOpacity})`
  const ghostStroke = invertPreview
    ? `rgba(247,250,248,${0.28 * guideOpacity})`
    : `rgba(20,32,43,${0.18 * guideOpacity})`
  const guideFill = invertPreview ? PAPER : INK

  const erasing = paintTool === 'erase'

  /** Returns the next map, or the same map when the cell needs no change. */
  const stampInto = (
    map: Map<string, FilledRegion>,
    col: number,
    row: number,
    rotation: number,
    on: boolean,
  ) => {
    if (erasing) {
      const ink = regionKey(col, row, 'ink')
      const cutout = regionKey(col, row, 'cutout')
      if (!map.has(ink) && !map.has(cutout)) return map
      const next = new Map(map)
      next.delete(ink)
      next.delete(cutout)
      return next
    }
    const key = regionKey(col, row, stampMode)
    const existing = map.get(key)
    if (on) {
      if (
        existing &&
        existing.shapeId === shapeId &&
        Math.abs(existing.size - brushSize) < 0.5 &&
        (existing.rotation ?? 0) === rotation &&
        (existing.mode ?? 'ink') === stampMode
      ) {
        return map
      }
      const next = new Map(map)
      next.set(key, {
        key,
        layer: 'a',
        col,
        row,
        kind: 'shape',
        shapeId,
        size: brushSize,
        rotation,
        mode: stampMode,
      })
      return next
    }
    if (!existing) return map
    const next = new Map(map)
    next.delete(key)
    return next
  }

  const applyCell = (col: number, row: number, on: boolean) => {
    let next = stampInto(live.current, col, row, brushRotation, on)
    if (symmetryMode !== 'none') {
      const mirror = getMirroredCoord(col, row, grid, symmetryMode, brushRotation, brushShape)
      if (mirror && (mirror.col !== col || mirror.row !== row)) {
        next = stampInto(next, mirror.col, mirror.row, mirror.rotation, on)
      }
    }
    if (next === live.current) return
    live.current = next
    onChange(next)
  }

  const beginStroke = (col: number, row: number) => {
    const key = regionKey(col, row, stampMode)
    if (!painting.current) {
      frozenFilled.current = live.current
      painting.current = true
      setStrokeLive(true)
    }
    lastCell.current = { col, row }
    const existing = live.current.get(key)
    if (erasing) {
      paintValue.current = false
    } else if (!existing) {
      paintValue.current = true
    } else if (
      existing.shapeId === shapeId &&
      Math.abs(existing.size - brushSize) < 0.5 &&
      (existing.rotation ?? 0) === brushRotation &&
      (existing.mode ?? 'ink') === stampMode
    ) {
      paintValue.current = false
    } else {
      paintValue.current = true
    }
    applyCell(col, row, paintValue.current)
    setHover({ col, row })
  }

  const continueStroke = (col: number, row: number) => {
    if (!hover || hover.col !== col || hover.row !== row) setHover({ col, row })
    if (paintTool === 'break-join' || !painting.current) return
    const from = lastCell.current
    lastCell.current = { col, row }
    if (!from) {
      applyCell(col, row, paintValue.current)
      return
    }
    // Fast drags skip cells between pointer events; walk the line so strokes stay continuous.
    let c = from.col
    let r = from.row
    const dc = Math.abs(col - c)
    const dr = Math.abs(row - r)
    const sc = c < col ? 1 : -1
    const sr = r < row ? 1 : -1
    let err = dc - dr
    for (let guard = 0; guard < 512; guard++) {
      if (c !== from.col || r !== from.row) applyCell(c, r, paintValue.current)
      if (c === col && r === row) break
      const e2 = err * 2
      if (e2 > -dr) {
        err -= dr
        c += sc
      }
      if (e2 < dc) {
        err += dc
        r += sr
      }
    }
  }

  const toggleJoin = (edgeKey: string) => {
    const next = new Set(brokenJoins)
    if (next.has(edgeKey)) next.delete(edgeKey)
    else next.add(edgeKey)
    onBrokenJoinsChange(next)
  }

  const fuseSource = strokeLive ? frozenFilled.current : filled
  // Sliders stay responsive: the expensive fuse follows a beat behind the thumb.
  const fuseSoftness = useDeferredValue(softness)
  const fuseCorner = useDeferredValue(cornerRadius)
  const stamps: SoftStamp[] = useMemo(
    () =>
      [...fuseSource.values()]
        .filter((fr) => fr.mode !== 'cutout')
        .map((fr) => {
          const { cx, cy } = cellCenter(fr.col, fr.row, grid)
          const { x, y } = cellOrigin(fr.col, fr.row, grid)
          const ox = x + (grid.cellSize - fr.size) / 2
          const oy = y + (grid.cellSize - fr.size) / 2
          const def = resolveShape(library, fr.shapeId)
          return makeSoftStamp(
            fr.key,
            fr.col,
            fr.row,
            cx,
            cy,
            fr.size,
            def,
            ox,
            oy,
            fuseCorner,
            fr.rotation ?? 0,
          )
        }),
    [fuseSource, grid, library, fuseCorner],
  )
  const maxGapArea = useMemo(() => {
    const s = stepSize(grid)
    return s * s * 0.6
  }, [grid])

  const finish = useMemo(
    () => {
      try {
        return softnessFinishPathList(stamps, { softness: fuseSoftness, brokenJoins, holeMode, maxGapArea })
      } catch (error) {
        // A geometry edge case must never blank the canvas mid-workshop.
        console.error('Softness fuse failed; showing crisp stamps.', error)
        return []
      }
    },
    [stamps, fuseSoftness, brokenJoins, holeMode, maxGapArea, meltOffRevision],
  )
  const joinHints = useMemo(
    () => (softness > 0.02 ? softnessJoinHints(stamps, softness, brokenJoins) : []),
    [stamps, softness, brokenJoins, meltOffRevision],
  )
  const fused = softness > 0.02 && fuseSoftness > 0.02 && finish.length > 0
  const fuseEdges = joinHints.filter((h) => !h.broken).length

  const crispFilteredPaths = useMemo(() => {
    if (holeMode === 'open' || softness > 0.02 || stamps.length === 0) return []
    const inkFills = [...fuseSource.values()].filter((fr) => fr.mode !== 'cutout')
    const ringSets: [number, number][][][] = []
    const rawPolys = inkFills
      .map((fr) => {
        const { x, y } = cellOrigin(fr.col, fr.row, grid)
        const ox = x + (grid.cellSize - fr.size) / 2
        const oy = y + (grid.cellSize - fr.size) / 2
        const def = resolveShape(library, fr.shapeId)
        const rings = shapeOutlineRings(def, ox, oy, fr.size, cornerRadius, fr.rotation ?? 0)
        ringSets.push(rings)
        return toPolygon(rings)
      })
      .filter((p): p is Polygon => p !== null)
    if (rawPolys.length === 0) return []
    try {
      const unioned = unionPolygons(rawPolys)
      const filtered = filterPolygonHolesPreserving(
        unioned,
        holeMode,
        maxGapArea,
        intentionalHoleCutters(ringSets),
      )
      return multiPolygonToPathList(filtered)
    } catch (error) {
      console.error('Gap fill failed; showing crisp stamps.', error)
      return []
    }
  }, [holeMode, softness, stamps.length, fuseSource, grid, library, cornerRadius, maxGapArea])

  const fuseShowsDeleted = strokeLive && [...fuseSource.keys()].some((key) => !filled.has(key))
  const showFuse = fused && !fuseShowsDeleted
  const showCrispFilter = !showFuse && crispFilteredPaths.length > 0

  // Punch polys stay on the frozen fuse source (expensive). Live red outlines
  // always follow `filled` so a cutout stroke is visible while dragging.
  const punchCutoutRegions = useMemo(
    () => [...fuseSource.values()].filter((fr) => fr.mode === 'cutout'),
    [fuseSource],
  )
  const cutoutRegions = useMemo(
    () => [...filled.values()].filter((fr) => fr.mode === 'cutout'),
    [filled],
  )

  const cutoutPolys = useMemo(() => {
    if (punchCutoutRegions.length === 0) return []
    return punchCutoutRegions
      .map((fr) => {
        const { x, y } = cellOrigin(fr.col, fr.row, grid)
        const ox = x + (grid.cellSize - fr.size) / 2
        const oy = y + (grid.cellSize - fr.size) / 2
        const def = resolveShape(library, fr.shapeId)
        const rings = shapeOutlineRings(def, ox, oy, fr.size, cornerRadius, fr.rotation ?? 0)
        return toPolygon(rings)
      })
      .filter((p): p is Polygon => p !== null)
  }, [punchCutoutRegions, grid, library, cornerRadius])

  const punchedPaths = useMemo(() => {
    if (cutoutPolys.length === 0) return []
    try {
      const ringHoles = intentionalHoleCutters(stamps.map((s) => s.rings))
      let subjectPolys: Polygon[] = []
      if (fuseSoftness > 0.02) {
        subjectPolys = softnessFinishPolygons(stamps, { softness: fuseSoftness, brokenJoins, holeMode, maxGapArea })
      } else {
        const rawPolys = [...fuseSource.values()]
          .filter((fr) => fr.mode !== 'cutout')
          .map((fr) => {
            const { x, y } = cellOrigin(fr.col, fr.row, grid)
            const ox = x + (grid.cellSize - fr.size) / 2
            const oy = y + (grid.cellSize - fr.size) / 2
            const def = resolveShape(library, fr.shapeId)
            const rings = shapeOutlineRings(def, ox, oy, fr.size, fuseCorner, fr.rotation ?? 0)
            return toPolygon(rings)
          })
          .filter((p): p is Polygon => p !== null)
        subjectPolys =
          holeMode !== 'open'
            ? filterPolygonHolesPreserving(unionPolygons(rawPolys), holeMode, maxGapArea, ringHoles)
            : rawPolys
      }
      if (subjectPolys.length === 0) return []
      const diff = differencePolygons(subjectPolys, cutoutPolys)
      const filtered =
        holeMode !== 'open'
          ? filterPolygonHolesPreserving(diff, holeMode, maxGapArea, ringHoles)
          : diff
      return multiPolygonToPathList(filtered)
    } catch (error) {
      console.error('Punch-out failed; showing the uncut shapes.', error)
      return []
    }
  }, [cutoutPolys, fuseSoftness, stamps, brokenJoins, holeMode, maxGapArea, fuseSource, grid, library, fuseCorner, meltOffRevision])

  // Same live-overlay trick as Softness: keep the expensive punched fuse frozen
  // during a drag, and paint new / changed ink cells on top so strokes stay visible.
  const showPunched = punchedPaths.length > 0 && !fuseShowsDeleted
  const overlayFills = (showFuse || showCrispFilter || showPunched)
    ? [...filled.values()].filter((fr) => {
        const prev = fuseSource.get(fr.key)
        return !prev || prev.shapeId !== fr.shapeId || Math.abs(prev.size - fr.size) > 0.5
      })
    : [...filled.values()]

  const renderInkOverlay = (regions: FilledRegion[]) =>
    regions
      .filter((fr) => fr.mode !== 'cutout')
      .map((fr) => {
        const def = resolveShape(library, fr.shapeId)
        const { x, y } = cellOrigin(fr.col, fr.row, grid)
        const ox = x + (grid.cellSize - fr.size) / 2
        const oy = y + (grid.cellSize - fr.size) / 2
        return (
          <path
            key={fr.key}
            d={moduleShapePath(def, ox, oy, fr.size, cornerRadius, fr.rotation ?? 0)}
            fill={fillColor}
            fillRule={moduleShapeFillRule(def)}
            className="pointer-events-none"
          />
        )
      })

  const ghostD = useMemo(
    () => moduleShapePath(brushShape, 0, 0, grid.cellSize, cornerRadius, brushRotation),
    [brushShape, grid.cellSize, cornerRadius, brushRotation],
  )
  const latticeStroke = Math.max(0.3, Math.min(0.7, grid.cellSize * 0.0175))
  const ghostWidth = Math.max(0.4, Math.min(0.9, grid.cellSize * 0.0225))
  const metrics = letterGuideMetricsForLetter(width, height, letterScale, guideLetter)
  const metricStroke = invertPreview
    ? `rgba(140,160,255,${0.45 + gridGuideOpacity * 0.5})`
    : `rgba(0,0,238,${0.38 + gridGuideOpacity * 0.55})`
  const metricLabel = invertPreview
    ? `rgba(140,160,255,${0.55 + gridGuideOpacity * 0.4})`
    : `rgba(0,0,238,${0.55 + gridGuideOpacity * 0.45})`
  const metricWidth = Math.max(0.7, Math.min(1.4, Math.min(width, height) * 0.0045))
  const labelSize = Math.max(7, Math.min(11, Math.min(width, height) * 0.032))

  const joinDotR = Math.max(2.5, Math.min(9, step * 0.215))
  const hoverKey = hover ? regionKey(hover.col, hover.row, stampMode) : null
  const hoverOrigin = hover ? cellOrigin(hover.col, hover.row, grid) : null

  const onCanvasPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (paintTool === 'break-join') return
    // One finger / the main button paints; a second touch or a right-click does nothing.
    if (!e.isPrimary || e.button !== 0) return
    const svg = svgRef.current
    if (!svg) return
    const cell = pointerToCell(svg, e, grid)
    if (!cell) return
    e.preventDefault()
    svg.setPointerCapture(e.pointerId)
    beginStroke(cell.col, cell.row)
  }

  const onCanvasPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg) return
    const cell = pointerToCell(svg, e, grid)
    if (!cell) {
      if (hover) setHover(null)
      // Leaving the grid breaks the line, so re-entering does not draw across the canvas.
      lastCell.current = null
      return
    }
    continueStroke(cell.col, cell.row)
  }

  return (
    <div className="relative flex h-full min-h-0 w-full items-center justify-center overflow-hidden">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className={
          paintTool !== 'break-join'
            ? 'mx-auto block h-full max-h-full w-full max-w-full cursor-crosshair touch-none select-none'
            : 'mx-auto block h-full max-h-full w-full max-w-full touch-none select-none'
        }
        role="img"
        aria-label="Shape grid canvas"
        data-softness={softness}
        data-tool={paintTool}
        data-cells={filled.size}
        data-bridges={String(fuseEdges)}
        data-broken={String(brokenJoins.size)}
        data-join-dots={showJoinDots ? '1' : '0'}
        data-shapes={[...new Set([...filled.values()].map((fr) => fr.shapeId))].sort().join(',')}
        onPointerDown={onCanvasPointerDown}
        onPointerMove={onCanvasPointerMove}
        onContextMenu={(e) => e.preventDefault()}
        onPointerUp={(e) => {
          // A finger does not hover: drop the preview so an erased cell looks erased.
          if (e.pointerType !== 'mouse') setHover(null)
        }}
        onPointerCancel={() => setHover(null)}
        onPointerLeave={() => {
          if (!painting.current) setHover(null)
        }}
      >
        <defs>
          <pattern
            id="grid-lattice"
            x={0}
            y={0}
            width={step}
            height={step}
            patternUnits="userSpaceOnUse"
          >
            <rect
              x={0}
              y={0}
              width={grid.cellSize}
              height={grid.cellSize}
              fill="none"
              stroke={guideStroke}
              strokeWidth={latticeStroke}
            />
            <path
              d={ghostD}
              fill="none"
              stroke={ghostStroke}
              strokeWidth={ghostWidth}
              fillRule={moduleShapeFillRule(brushShape)}
            />
          </pattern>
        </defs>
        <rect width={width} height={height} fill={bg} rx={8} />
        <rect width={width} height={height} fill="url(#grid-lattice)" className="pointer-events-none" />

        {showLetterGuide && guideLetter && (
          <text
            x={width / 2}
            y={height / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={fontSize}
            fontFamily="Arial, Helvetica, sans-serif"
            fontWeight={700}
            fill={guideFill}
            opacity={0.04 + guideOpacity * 0.12}
            className="pointer-events-none select-none"
          >
            {guideLetter}
          </text>
        )}

        {showGridGuide && (
          <g
            className="pointer-events-none select-none"
            data-testid="grid-guide"
            aria-hidden="true"
          >
            <rect
              x={metrics.emLeft}
              y={metrics.emTop}
              width={metrics.emRight - metrics.emLeft}
              height={metrics.emBottom - metrics.emTop}
              fill="none"
              stroke={metricStroke}
              strokeWidth={metricWidth}
            />
            <line
              x1={metrics.emLeft}
              y1={metrics.cap}
              x2={metrics.emRight}
              y2={metrics.cap}
              stroke={metricStroke}
              strokeWidth={metricWidth}
            />
            <line
              x1={metrics.emLeft}
              y1={metrics.xHeight}
              x2={metrics.emRight}
              y2={metrics.xHeight}
              stroke={metricStroke}
              strokeWidth={metricWidth * 0.85}
              strokeDasharray={`${metricWidth * 3} ${metricWidth * 2.5}`}
            />
            <line
              x1={metrics.emLeft}
              y1={metrics.baseline}
              x2={metrics.emRight}
              y2={metrics.baseline}
              stroke={metricStroke}
              strokeWidth={metricWidth * 1.25}
            />
            <line
              x1={metrics.emLeft}
              y1={metrics.descender}
              x2={metrics.emRight}
              y2={metrics.descender}
              stroke={metricStroke}
              strokeWidth={metricWidth * 0.85}
              strokeDasharray={`${metricWidth} ${metricWidth * 2}`}
            />
            <line
              x1={metrics.cx}
              y1={metrics.emTop}
              x2={metrics.cx}
              y2={metrics.emBottom}
              stroke={metricStroke}
              strokeWidth={metricWidth * 0.7}
              strokeDasharray={`${metricWidth * 2} ${metricWidth * 2}`}
            />
            {(
              [
                ['cap', metrics.cap],
                ['x', metrics.xHeight],
                ['base', metrics.baseline],
                ['desc', metrics.descender],
              ] as const
            ).map(([label, y]) => (
              <text
                key={label}
                x={metrics.emLeft + 3}
                y={y - 3}
                fontSize={labelSize}
                fontFamily="Arial, Helvetica, sans-serif"
                fontWeight={700}
                fill={metricLabel}
              >
                {label}
              </text>
            ))}
          </g>
        )}

        {showPunched ? (
          <g className="pointer-events-none" aria-hidden="true">
            {punchedPaths.map((d, i) => (
              <path key={`punched-${i}`} d={d} fill={fillColor} fillRule="evenodd" />
            ))}
            {renderInkOverlay(overlayFills)}
          </g>
        ) : (
          <>
            {showFuse ? (
              <g className="pointer-events-none" aria-hidden="true">
                {finish.map((d, i) => (
                  <path key={`finish-${i}`} d={d} fill={fillColor} fillRule="evenodd" />
                ))}
              </g>
            ) : showCrispFilter ? (
              <g className="pointer-events-none" aria-hidden="true">
                {crispFilteredPaths.map((d, i) => (
                  <path key={`crisp-${i}`} d={d} fill={fillColor} fillRule="evenodd" />
                ))}
              </g>
            ) : null}

            {renderInkOverlay(overlayFills)}
          </>
        )}

        {cutoutRegions.map((fr) => {
          const def = resolveShape(library, fr.shapeId)
          const { x, y } = cellOrigin(fr.col, fr.row, grid)
          const ox = x + (grid.cellSize - fr.size) / 2
          const oy = y + (grid.cellSize - fr.size) / 2
          const d = moduleShapePath(def, ox, oy, fr.size, cornerRadius, fr.rotation ?? 0)
          return (
            <g key={`cutout-${fr.key}`} className="pointer-events-none">
              <path
                d={d}
                fill="none"
                stroke="#ef4444"
                strokeWidth={1.2}
                strokeDasharray="2.5 2.5"
                opacity={stampMode === 'cutout' ? 0.85 : 0.35}
              />
            </g>
          )
        })}

        {showJoinDots &&
          joinHints.map((h) => {
            const active = paintTool === 'break-join'
            const r = active ? joinDotR : joinDotR * (2 / 3)
            const k = r * 0.39
            return (
              <g key={`join-${h.key}`} className={active ? 'cursor-pointer' : 'pointer-events-none'}>
                <circle
                  cx={h.mx}
                  cy={h.my}
                  r={r}
                  fill={h.broken ? '#000000' : '#0000ee'}
                  stroke={PAPER}
                  strokeWidth={Math.max(0.6, joinDotR / 6)}
                  className="pointer-events-none"
                />
                {h.broken && (
                  <path
                    d={`M ${h.mx - k} ${h.my - k} L ${h.mx + k} ${h.my + k} M ${h.mx + k} ${h.my - k} L ${h.mx - k} ${h.my + k}`}
                    stroke={PAPER}
                    strokeWidth={Math.max(0.6, joinDotR / 6.5)}
                    strokeLinecap="round"
                    className="pointer-events-none"
                  />
                )}
                {/* Finger-sized, invisible hit area on top of the dot. */}
                <circle
                  cx={h.mx}
                  cy={h.my}
                  r={active ? step * 0.33 : r}
                  fill="transparent"
                  data-testid={`join-break-${h.key}`}
                  data-broken={h.broken ? '1' : '0'}
                  onPointerDown={(e) => {
                    if (!active) return
                    e.preventDefault()
                    e.stopPropagation()
                    toggleJoin(h.key)
                  }}
                />
              </g>
            )
          })}

        {/* Symmetry mirror axis */}
        {symmetryMode === 'horizontal' && (
          <line
            x1={width / 2}
            y1={0}
            x2={width / 2}
            y2={height}
            stroke="#3b82f6"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            opacity={0.65}
            className="pointer-events-none"
          />
        )}
        {symmetryMode === 'vertical' && (
          <line
            x1={0}
            y1={height / 2}
            x2={width}
            y2={height / 2}
            stroke="#3b82f6"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            opacity={0.65}
            className="pointer-events-none"
          />
        )}

        {hoverOrigin && erasing && (
          <rect
            x={hoverOrigin.x}
            y={hoverOrigin.y}
            width={grid.cellSize}
            height={grid.cellSize}
            fill="rgba(239,68,68,0.14)"
            stroke="#ef4444"
            strokeWidth={Math.max(0.6, step * 0.03)}
            strokeDasharray={`${step * 0.08} ${step * 0.06}`}
            className="pointer-events-none"
          />
        )}

        {hoverOrigin && paintTool === 'stamp' && (
          <g className="pointer-events-none">
            {hoverKey && !filled.has(hoverKey) && (
              <rect
                x={hoverOrigin.x}
                y={hoverOrigin.y}
                width={grid.cellSize}
                height={grid.cellSize}
                fill={
                  stampMode === 'cutout'
                    ? 'rgba(239,68,68,0.1)'
                    : invertPreview
                    ? 'rgba(247,250,248,0.12)'
                    : 'rgba(31,111,106,0.1)'
                }
              />
            )}
            <path
              d={moduleShapePath(
                brushShape,
                hoverOrigin.x + (grid.cellSize - brushSize) / 2,
                hoverOrigin.y + (grid.cellSize - brushSize) / 2,
                brushSize,
                cornerRadius,
                brushRotation,
              )}
              fill={stampMode === 'cutout' ? 'rgba(239,68,68,0.3)' : fillColor}
              stroke={stampMode === 'cutout' ? '#ef4444' : undefined}
              strokeWidth={stampMode === 'cutout' ? 1.5 : undefined}
              strokeDasharray={stampMode === 'cutout' ? '3 3' : undefined}
              opacity={stampMode === 'cutout' ? 0.75 : 0.35}
            />

            {/* Symmetry mirrored hover ghost */}
            {(() => {
              if (symmetryMode === 'none' || !hover) return null
              const mirror = getMirroredCoord(hover.col, hover.row, grid, symmetryMode, brushRotation, brushShape)
              if (!mirror || (mirror.col === hover.col && mirror.row === hover.row)) return null
              const origin = cellOrigin(mirror.col, mirror.row, grid)
              return (
                <path
                  d={moduleShapePath(
                    brushShape,
                    origin.x + (grid.cellSize - brushSize) / 2,
                    origin.y + (grid.cellSize - brushSize) / 2,
                    brushSize,
                    cornerRadius,
                    mirror.rotation,
                  )}
                  fill={stampMode === 'cutout' ? 'rgba(239,68,68,0.25)' : fillColor}
                  stroke={stampMode === 'cutout' ? '#ef4444' : undefined}
                  strokeWidth={stampMode === 'cutout' ? 1.5 : undefined}
                  strokeDasharray={stampMode === 'cutout' ? '3 3' : undefined}
                  opacity={stampMode === 'cutout' ? 0.6 : 0.25}
                />
              )
            })()}
          </g>
        )}
      </svg>
    </div>
  )
}
