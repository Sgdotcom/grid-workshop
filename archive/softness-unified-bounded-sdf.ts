/**
 * Paint Softness — close shapes melt into one outline via a bounded SDF field.
 *
 * Softness 0 = crisp vector stamps. Above that, neighbor pairs inside fuseMaxGap
 * and g ≤ k·1.15 are cubic-smin'd in a corridor; the component is extracted with
 * sub-pixel marching squares. Isolated stamps keep their exact outlines.
 */

import type { ShapeDef } from '@/lib/types'
import {
  shapeAnalyticSdf,
  shapeContactSamples,
  shapeIsCircular,
  shapeOutlineRings,
  shapeRoundness,
  type AnalyticSdf,
} from '@/lib/shapes'
import {
  evalBlendedField,
  groupOutersAndHoles,
  marchingSquares,
  pairBlendK,
  pruneFieldTopology,
  simplifyClosed,
  softnessK,
  stampSdf,
  type SpatialPair,
} from '@/lib/sdfBlend'
import { ringsToPath } from '@/lib/polyBool'

export interface SoftStamp {
  id: string
  cx: number
  cy: number
  r: number
  size: number
  col: number
  row: number
  circular?: boolean
  roundness: number
  contacts: [number, number][]
  rings: [number, number][][]
  sdf: AnalyticSdf | null
}

export function softEdgeKey(c1: number, r1: number, c2: number, r2: number) {
  if (c1 < c2 || (c1 === c2 && r1 < r2)) return `${c1}:${r1}|${c2}:${r2}`
  return `${c2}:${r2}|${c1}:${r1}`
}

export type BrokenJoins = Set<string>

function dist(x1: number, y1: number, x2: number, y2: number) {
  return Math.hypot(x2 - x1, y2 - y1)
}

export function softnessExpandStroke(_size: number, _softness: number): number {
  void _size
  void _softness
  return 0
}

export function stampEnvelopeRadius(size: number, _circular = false): number {
  void _circular
  return size * 0.48
}

export function makeSoftStamp(
  id: string,
  col: number,
  row: number,
  cx: number,
  cy: number,
  size: number,
  def: ShapeDef,
  ox: number,
  oy: number,
  cornerRadius = 0,
): SoftStamp {
  const circular = shapeIsCircular(def)
  const roundness = shapeRoundness(def, cornerRadius, size)
  const rings = shapeOutlineRings(def, ox, oy, size, cornerRadius)
  return {
    id,
    cx,
    cy,
    r: stampEnvelopeRadius(size, circular),
    size,
    col,
    row,
    circular,
    roundness,
    contacts: rings[0]?.length ? rings[0] : shapeContactSamples(def, ox, oy, size, cornerRadius),
    rings,
    sdf: shapeAnalyticSdf(def, ox, oy, size, cornerRadius),
  }
}

export function fuseMaxGap(meanSize: number, softness: number, diagonal = false): number {
  if (softness <= 0.02) return 0
  return meanSize * (0.02 + softness * 0.78) * (diagonal ? 0.72 : 1)
}

export function blendStrength(
  a: SoftStamp,
  b: SoftStamp,
  softness: number,
  diagonal: boolean,
): { strength: number; proximity: number; d: number; gap: number } | null {
  if (softness <= 0.02) return null

  const { gap } = closestOutlinePoints(a, b)
  const meanSize = (a.size + b.size) * 0.5
  const maxGap = fuseMaxGap(meanSize, softness, diagonal)
  if (gap > maxGap) return null

  const proximity = 1 - gap / Math.max(maxGap, 1e-6)
  const sizeFactor = Math.min(1.35, Math.max(0.7, meanSize / 42))
  const strength = Math.min(
    1,
    softness * (0.3 + 0.7 * proximity) * (0.72 + 0.28 * sizeFactor),
  )
  if (strength < 0.03) return null
  return { strength, proximity, d: dist(a.cx, a.cy, b.cx, b.cy), gap }
}

function closestOutlinePoints(
  a: SoftStamp,
  b: SoftStamp,
): { pa: [number, number]; pb: [number, number]; gap: number } {
  let best = Infinity
  const hits: { pa: [number, number]; pb: [number, number]; d: number }[] = []
  const ca = a.contacts
  const cb = b.contacts
  const stepA = ca.length > 28 ? 2 : 1
  const stepB = cb.length > 28 ? 2 : 1
  for (let i = 0; i < ca.length; i += stepA) {
    for (let j = 0; j < cb.length; j += stepB) {
      const d = dist(ca[i][0], ca[i][1], cb[j][0], cb[j][1])
      if (d < best - 0.35) {
        best = d
        hits.length = 0
        hits.push({ pa: ca[i], pb: cb[j], d })
      } else if (d <= best + 1.2) {
        hits.push({ pa: ca[i], pb: cb[j], d })
      }
    }
  }
  if (!hits.length) {
    return { pa: [a.cx, a.cy], pb: [b.cx, b.cy], gap: dist(a.cx, a.cy, b.cx, b.cy) }
  }
  if (hits.length >= 4) {
    const pa: [number, number] = [
      hits.reduce((s, h) => s + h.pa[0], 0) / hits.length,
      hits.reduce((s, h) => s + h.pa[1], 0) / hits.length,
    ]
    const pb: [number, number] = [
      hits.reduce((s, h) => s + h.pb[0], 0) / hits.length,
      hits.reduce((s, h) => s + h.pb[1], 0) / hits.length,
    ]
    return { pa, pb, gap: dist(pa[0], pa[1], pb[0], pb[1]) }
  }
  const h = hits.reduce((m, x) => (x.d < m.d ? x : m), hits[0])
  return { pa: h.pa, pb: h.pb, gap: h.d }
}

function ringBBox(rings: [number, number][][]): {
  minX: number
  minY: number
  maxX: number
  maxY: number
} {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const ring of rings) {
    for (const [x, y] of ring) {
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  return { minX, minY, maxX, maxY }
}

type NeighborPair = {
  a: SoftStamp
  b: SoftStamp
  diagonal: boolean
  strength: number
  gap: number
  pa: [number, number]
  pb: [number, number]
}

function collectNeighborPairs(
  stamps: SoftStamp[],
  softness: number,
  brokenJoins?: BrokenJoins,
): NeighborPair[] {
  const byCell = new Map<string, SoftStamp>()
  for (const s of stamps) byCell.set(`${s.col}:${s.row}`, s)
  const pairs: NeighborPair[] = []
  const seen = new Set<string>()

  const add = (a: SoftStamp, b: SoftStamp, diagonal: boolean) => {
    const edge = softEdgeKey(a.col, a.row, b.col, b.row)
    if (seen.has(edge) || brokenJoins?.has(edge)) return
    seen.add(edge)
    const blend = blendStrength(a, b, softness, diagonal)
    if (!blend) return
    const { pa, pb, gap } = closestOutlinePoints(a, b)
    pairs.push({ a, b, diagonal, strength: blend.strength, gap, pa, pb })
  }

  for (const s of byCell.values()) {
    const { col, row } = s
    const right = byCell.get(`${col + 1}:${row}`)
    const down = byCell.get(`${col}:${row + 1}`)
    if (right) add(s, right, false)
    if (down) add(s, down, false)
    const se = byCell.get(`${col + 1}:${row + 1}`)
    const ne = byCell.get(`${col + 1}:${row - 1}`)
    if (se && s.circular && se.circular) add(s, se, true)
    if (ne && s.circular && ne.circular) add(s, ne, true)
  }
  return pairs
}

function connectedComponents(
  stamps: SoftStamp[],
  pairs: { a: SoftStamp; b: SoftStamp }[],
): SoftStamp[][] {
  const parent = new Map<string, string>()
  const find = (id: string): string => {
    const p = parent.get(id) ?? id
    if (p !== id) parent.set(id, find(p))
    return parent.get(id) ?? id
  }
  const unite = (a: string, b: string) => {
    const pa = find(a)
    const pb = find(b)
    if (pa !== pb) parent.set(pa, pb)
  }
  for (const s of stamps) parent.set(s.id, s.id)
  for (const p of pairs) unite(p.a.id, p.b.id)
  const groups = new Map<string, SoftStamp[]>()
  for (const s of stamps) {
    const root = find(s.id)
    const list = groups.get(root) ?? []
    list.push(s)
    groups.set(root, list)
  }
  return [...groups.values()]
}

function spatialPairsFor(
  members: SoftStamp[],
  pairs: NeighborPair[],
  softness: number,
): SpatialPair[] {
  const index = new Map<string, number>()
  members.forEach((s, i) => index.set(s.id, i))
  const out: SpatialPair[] = []
  const ids = new Set(members.map((m) => m.id))
  for (const pair of pairs) {
    if (!ids.has(pair.a.id) || !ids.has(pair.b.id)) continue
    const ia = index.get(pair.a.id)
    const ib = index.get(pair.b.id)
    if (ia == null || ib == null) continue
    const meanSize = (pair.a.size + pair.b.size) * 0.5
    const k = pairBlendK(meanSize, softness, pair.gap)
    const extra = Math.max(12, k * 0.32)
    // #region agent log
    fetch('http://127.0.0.1:7323/ingest/58b93ecf-ee8b-4f53-b020-157329368e3c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8cc64a'},body:JSON.stringify({sessionId:'8cc64a',hypothesisId:'C',location:'softness.ts:spatialPairsFor',message:'spatial k',data:{gap:+pair.gap.toFixed(2),k:+k.toFixed(2),meanSize:+meanSize.toFixed(1),soft:+softness.toFixed(2)},timestamp:Date.now(),runId:'auto'})}).catch(()=>{})
    // #endregion
    out.push({
      ia,
      ib,
      k,
      minX: Math.min(pair.pa[0], pair.pb[0]) - extra,
      minY: Math.min(pair.pa[1], pair.pb[1]) - extra,
      maxX: Math.max(pair.pa[0], pair.pb[0]) + extra,
      maxY: Math.max(pair.pa[1], pair.pb[1]) + extra,
    })
  }
  return out
}

function stampInterior(m: SoftStamp): [number, number] {
  if (stampSdf(m.cx, m.cy, m.rings, m.sdf) < -0.3) return [m.cx, m.cy]
  const ring = m.rings[0]
  if (!ring?.length) return [m.cx, m.cy]
  for (const v of ring) {
    for (let t = 0.2; t <= 0.8; t += 0.15) {
      const x = v[0] + (m.cx - v[0]) * t
      const y = v[1] + (m.cy - v[1]) * t
      if (stampSdf(x, y, m.rings, m.sdf) < -0.4) return [x, y]
    }
  }
  return [m.cx, m.cy]
}

function holeSeedsFor(m: SoftStamp): [number, number][] {
  const seeds: [number, number][] = []
  if (m.sdf?.kind === 'ring') seeds.push([m.sdf.cx, m.sdf.cy])
  if (m.sdf?.kind === 'polygon' && m.sdf.holes) {
    for (const hole of m.sdf.holes) {
      let x = 0
      let y = 0
      for (const p of hole) {
        x += p[0]
        y += p[1]
      }
      if (hole.length) seeds.push([x / hole.length, y / hole.length])
    }
  }
  for (const ring of m.rings.slice(1)) {
    let x = 0
    let y = 0
    for (const p of ring) {
      x += p[0]
      y += p[1]
    }
    if (ring.length) seeds.push([x / ring.length, y / ring.length])
  }
  return seeds
}

function extractFieldPaths(
  members: SoftStamp[],
  spatial: SpatialPair[],
  softness: number,
): string[] {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let meanSize = 0
  for (const s of members) {
    meanSize += s.size
    const b = ringBBox(s.rings)
    if (b.minX < minX) minX = b.minX
    if (b.minY < minY) minY = b.minY
    if (b.maxX > maxX) maxX = b.maxX
    if (b.maxY > maxY) maxY = b.maxY
  }
  meanSize /= members.length || 1
  const k = softnessK(meanSize, softness)
  const margin = k + 4
  minX -= margin
  minY -= margin
  maxX += margin
  maxY += margin

  let step = 1.25
  let cols = Math.max(8, Math.ceil((maxX - minX) / step))
  let rows = Math.max(8, Math.ceil((maxY - minY) / step))
  if (cols > 180 || rows > 240) {
    step = Math.max(step, (maxX - minX) / 180, (maxY - minY) / 240)
    cols = Math.max(8, Math.ceil((maxX - minX) / step))
    rows = Math.max(8, Math.ceil((maxY - minY) / step))
  }

  const values = new Float32Array((cols + 1) * (rows + 1))
  const fieldStamps = members.map((s) => ({ rings: s.rings, sdf: s.sdf }))
  for (let y = 0; y <= rows; y++) {
    const py = minY + y * step
    for (let x = 0; x <= cols; x++) {
      const px = minX + x * step
      values[y * (cols + 1) + x] = evalBlendedField(px, py, fieldStamps, spatial)
    }
  }

  const raw = marchingSquares(values, cols, rows, minX, minY, step)
  const grouped = pruneFieldTopology(
    groupOutersAndHoles(raw.map((ring) => simplifyClosed(ring, 0.35))),
    members.map(stampInterior),
    members.flatMap(holeSeedsFor),
  )
  const paths: string[] = []
  for (const rings of grouped) {
    const d = ringsToPath(rings)
    if (d) paths.push(d)
  }
  // #region agent log
  {
    const sub = paths.reduce((n, d) => n + (d.match(/M /g)?.length ?? 0), 0)
    fetch('http://127.0.0.1:7323/ingest/58b93ecf-ee8b-4f53-b020-157329368e3c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8cc64a'},body:JSON.stringify({sessionId:'8cc64a',hypothesisId:'A',location:'softness.ts:extractFieldPaths',message:'field extract',data:{n:members.length,soft:+softness.toFixed(2),k:+k.toFixed(2),step:+step.toFixed(2),cols,rows,outPaths:paths.length,subpaths:sub},timestamp:Date.now(),runId:'auto'})}).catch(()=>{})
  }
  // #endregion
  return paths
}

function fuseComponent(
  members: SoftStamp[],
  pairs: NeighborPair[],
  softness: number,
): string[] {
  if (!members.length) return []
  const spatial = spatialPairsFor(members, pairs, softness)
  if (!spatial.length) {
    return members.map((m) => ringsToPath(m.rings)).filter(Boolean)
  }
  return extractFieldPaths(members, spatial, softness)
}

export interface SoftnessFinishOptions {
  softness: number
  brokenJoins?: BrokenJoins
}

export interface SoftJoinHint {
  key: string
  mx: number
  my: number
  colA: number
  rowA: number
  colB: number
  rowB: number
  broken: boolean
}

export function softnessFinishPathList(
  stamps: SoftStamp[],
  softnessOrOpts: number | SoftnessFinishOptions,
): string[] {
  const opts: SoftnessFinishOptions =
    typeof softnessOrOpts === 'number'
      ? { softness: softnessOrOpts }
      : softnessOrOpts
  const { softness, brokenJoins } = opts
  if (softness <= 0.02 || stamps.length === 0) return []

  const pairs = collectNeighborPairs(stamps, softness, brokenJoins)
  const components = connectedComponents(stamps, pairs)
  const paths: string[] = []
  for (const members of components) {
    paths.push(...fuseComponent(members, pairs, softness))
  }
  return paths
}

export function softnessJoinHints(
  stamps: SoftStamp[],
  softness = 1,
  brokenJoins?: BrokenJoins,
): SoftJoinHint[] {
  if (stamps.length < 2 || softness <= 0.02) return []
  const byCell = new Map<string, SoftStamp>()
  for (const s of stamps) byCell.set(`${s.col}:${s.row}`, s)
  const hints: SoftJoinHint[] = []
  const seen = new Set<string>()

  const add = (a: SoftStamp, b: SoftStamp, diagonal: boolean) => {
    const key = softEdgeKey(a.col, a.row, b.col, b.row)
    if (seen.has(key)) return
    seen.add(key)
    if (!blendStrength(a, b, softness, diagonal) && !brokenJoins?.has(key)) return
    hints.push({
      key,
      mx: (a.cx + b.cx) / 2,
      my: (a.cy + b.cy) / 2,
      colA: a.col,
      rowA: a.row,
      colB: b.col,
      rowB: b.row,
      broken: !!brokenJoins?.has(key),
    })
  }

  for (const s of byCell.values()) {
    const { col, row } = s
    const right = byCell.get(`${col + 1}:${row}`)
    const down = byCell.get(`${col}:${row + 1}`)
    if (right) add(s, right, false)
    if (down) add(s, down, false)
    const se = byCell.get(`${col + 1}:${row + 1}`)
    const ne = byCell.get(`${col + 1}:${row - 1}`)
    if (se && s.circular && se.circular) add(s, se, true)
    if (ne && s.circular && ne.circular) add(s, ne, true)
  }

  return hints
}

export function softnessHint(softness: number): string {
  if (softness < 0.08) return 'Crisp'
  if (softness < 0.35) return 'Near melt'
  if (softness < 0.65) return 'Blob'
  if (softness < 0.85) return 'Heavy blob'
  return 'Max blob'
}
