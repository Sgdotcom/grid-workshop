import { cellCenter, cellOrigin } from './gridGeometry'
import { makeSoftStamp, organicWeld, softnessFinishPathList } from './softness'
import { differencePolygons, metaballRing, multiPolygonToPathList, toPolygon, unionPolygons } from './polyBool'
import type { Polygon } from 'polygon-clipping'
import type { ShapeDef } from './types'
import { fieldBlend } from './fieldExperiments'

export const JOIN_CASES = [
  { id: 'horizontal', label: 'Horizontal', cells: [[0, 0], [1, 0]] },
  { id: 'vertical', label: 'Vertical', cells: [[0, 0], [0, 1]] },
  { id: 'diagonal-right', label: 'Diagonal ↘', cells: [[0, 0], [1, 1]] },
  { id: 'diagonal-left', label: 'Diagonal ↙', cells: [[1, 0], [0, 1]] },
  { id: 'elbow', label: 'L cluster', cells: [[0, 0], [1, 0], [0, 1]] },
  { id: 'block', label: '2 × 2 cluster', cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
] as const

export const JOIN_METHODS = [
  { id: 'current', label: 'A · Current', description: 'The exact workshop behaviour, kept as the reference.' },
  { id: 'weld', label: 'B · Outline weld', description: 'Connects facing outlines with curves; keeps the original stamp bodies.' },
  { id: 'metaball', label: 'C · Inner-circle melt', description: 'Builds a metaball from circles fitted inside each silhouette.' },
  { id: 'sdf', label: 'D · Distance-field blend', description: 'Smoothly blends distances to the actual outlines. Small holes can close as Softness increases.' },
  { id: 'offset', label: 'E · Expand / union / shrink', description: 'Expands shapes, combines them, then contracts. Sampled geometric closing, not circle bridges.' },
] as const
export type JoinMethod = typeof JOIN_METHODS[number]['id']

export interface ExperimentSettings {
  size: number
  softness: number
  roundedness: number
  radius: number
  neck: number
}

function innerRadius(points: [number, number][], cx: number, cy: number) {
  let minimum = Infinity
  for (let index = 0; index < points.length; index++) {
    const start = points[index]
    const end = points[(index + 1) % points.length]
    const deltaX = end[0] - start[0]
    const deltaY = end[1] - start[1]
    const squared = deltaX ** 2 + deltaY ** 2
    const fraction = squared ? Math.max(0, Math.min(1, ((cx - start[0]) * deltaX + (cy - start[1]) * deltaY) / squared)) : 0
    minimum = Math.min(minimum, Math.hypot(cx - start[0] - fraction * deltaX, cy - start[1] - fraction * deltaY))
  }
  return minimum
}

export function compareJoin(shape: ShapeDef, cells: readonly (readonly number[])[], settings: ExperimentSettings, method: JoinMethod) {
  const grid = { cols: 2, rows: 2, cellSize: 40, gap: 2 }
  const stamps = cells.map(([col, row]) => {
    const { cx, cy } = cellCenter(col, row, grid)
    const { x, y } = cellOrigin(col, row, grid)
    const offset = (40 - settings.size) / 2
    return makeSoftStamp(`${col}:${row}`, col, row, cx, cy, settings.size, shape, x + offset, y + offset, settings.roundedness)
  })
  const originals = stamps.map(stamp => toPolygon(stamp.rings)).filter((polygon): polygon is Polygon => !!polygon)
  const outlines = multiPolygonToPathList(originals)
  if (method === 'current') return { paths: softnessFinishPathList(stamps, settings.softness), outlines }
  if (settings.softness <= 0.02) return { paths: outlines, outlines }
  if (method === 'sdf' || method === 'offset') {
    return { paths: fieldBlend(stamps.map(stamp => stamp.rings), settings.size, settings.softness, method), outlines }
  }
  const bridges: Polygon[] = []
  for (let first = 0; first < stamps.length; first++) {
    for (let second = first + 1; second < stamps.length; second++) {
      const left = stamps[first]
      const right = stamps[second]
      if (method === 'weld') {
        bridges.push(...organicWeld(left, right, settings.softness))
      } else {
        const ring = metaballRing(left.cx, left.cy, innerRadius(left.rings[0], left.cx, left.cy) * settings.radius,
          right.cx, right.cy, innerRadius(right.rings[0], right.cx, right.cy) * settings.radius,
          (1.7 + settings.softness * 1.25) * settings.neck, 0.4 + settings.softness * 0.28)
        if (ring) {
          const polygon = toPolygon([ring])
          if (polygon) bridges.push(polygon)
        }
      }
    }
  }
  const holes = stamps.flatMap(stamp => stamp.rings.slice(1).map(ring => toPolygon([ring])))
    .filter((polygon): polygon is Polygon => !!polygon)
  const merged = unionPolygons([...originals, ...bridges])
  return { paths: multiPolygonToPathList(holes.length ? differencePolygons(merged, holes) : merged), outlines }
}
