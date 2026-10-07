/**
 * Bounded cubic smooth-min blend of module SDFs.
 * Boolean union is min(d_i). Pairwise cubic smin only runs inside each
 * neighbor corridor so far corners stay sharp.
 */

import type { AnalyticSdf } from '@/lib/shapes'

/** IQ cubic C2 smooth minimum. Max extra pull is k/6 when a === b. */
export function cubicSmin(a: number, b: number, k: number): number {
  if (k <= 0.05) return Math.min(a, b)
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return Math.min(a, b) - h * h * h * k * (1 / 6)
}

/** Softness 0–1 → mapped blend radius (spec). */
export function softnessK(meanSize: number, softness: number): number {
  const t = Math.min(1, Math.max(0, softness))
  return meanSize * (0.05 + 0.95 * t)
}

/**
 * Cubic smin only pulls k/6, so k must be ≥ ~3·gap to close a surface gap.
 * Mapped softness still wins when stamps already touch.
 */
export function pairBlendK(meanSize: number, softness: number, gap: number): number {
  return Math.max(softnessK(meanSize, softness), Math.max(0, gap) * 3.25 + 2)
}

function distToSeg(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const vx = bx - ax
  const vy = by - ay
  const len2 = vx * vx + vy * vy
  if (len2 < 1e-12) return Math.hypot(px - ax, py - ay)
  let t = ((px - ax) * vx + (py - ay) * vy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t))
}

/** Winding-number signed distance to a simple closed ring. */
function sdfWindingPolygon(x: number, y: number, verts: [number, number][]): number {
  const n = verts.length
  if (n < 3) return 1e6
  let wn = 0
  let best = Infinity
  for (let i = 0; i < n; i++) {
    const ax = verts[i][0]
    const ay = verts[i][1]
    const bx = verts[(i + 1) % n][0]
    const by = verts[(i + 1) % n][1]
    const d = distToSeg(x, y, ax, ay, bx, by)
    if (d < best) best = d
    const cross = (bx - ax) * (y - ay) - (by - ay) * (x - ax)
    if (ay <= y) {
      if (by > y && cross > 0) wn += 1
    } else if (by <= y && cross < 0) {
      wn -= 1
    }
  }
  return wn !== 0 ? -best : best
}

function evenOddInside(x: number, y: number, rings: [number, number][][]): boolean {
  let inside = false
  for (const ring of rings) {
    const n = ring.length
    if (n < 3) continue
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const yi = ring[i][1]
      const yj = ring[j][1]
      const xi = ring[i][0]
      const xj = ring[j][0]
      const hit = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi
      if (hit) inside = !inside
    }
  }
  return inside
}

function minEdgeDist(x: number, y: number, rings: [number, number][][]): number {
  let best = Infinity
  for (const ring of rings) {
    const n = ring.length
    if (n < 2) continue
    for (let i = 0; i < n; i++) {
      const a = ring[i]
      const b = ring[(i + 1) % n]
      const d = distToSeg(x, y, a[0], a[1], b[0], b[1])
      if (d < best) best = d
    }
  }
  return best
}

export function sdfRings(x: number, y: number, rings: [number, number][][]): number {
  if (!rings.length) return 1e6
  const d = minEdgeDist(x, y, rings)
  return evenOddInside(x, y, rings) ? -d : d
}

export function evalAnalyticSdf(x: number, y: number, prim: AnalyticSdf): number {
  if (prim.kind === 'circle') {
    return Math.hypot(x - prim.cx, y - prim.cy) - prim.r
  }
  if (prim.kind === 'ring') {
    const d = Math.hypot(x - prim.cx, y - prim.cy)
    return Math.max(d - prim.outer, prim.inner - d)
  }
  if (prim.kind === 'capsule') {
    const pax = x - prim.ax
    const pay = y - prim.ay
    const bax = prim.bx - prim.ax
    const bay = prim.by - prim.ay
    const denom = bax * bax + bay * bay
    const h = denom < 1e-12 ? 0 : Math.max(0, Math.min(1, (pax * bax + pay * bay) / denom))
    return Math.hypot(pax - bax * h, pay - bay * h) - prim.r
  }
  if (prim.kind === 'roundedBox') {
    const rr = Math.min(prim.r, prim.hx, prim.hy)
    const qx = Math.abs(x - prim.cx) - (prim.hx - rr)
    const qy = Math.abs(y - prim.cy) - (prim.hy - rr)
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rr
  }
  const dx = x - prim.cx
  const dy = y - prim.cy
  const far = prim.maxR + 1.5
  if (dx * dx + dy * dy > far * far) {
    return Math.hypot(dx, dy) - prim.maxR
  }
  let d = sdfWindingPolygon(x, y, prim.verts)
  if (prim.holes) {
    for (const hole of prim.holes) {
      d = Math.max(d, -sdfWindingPolygon(x, y, hole))
    }
  }
  return d
}

export function stampSdf(
  x: number,
  y: number,
  rings: [number, number][][],
  analytic?: AnalyticSdf | null,
): number {
  if (analytic) return evalAnalyticSdf(x, y, analytic)
  return sdfRings(x, y, rings)
}

/** Extra neck solid: smooth-union minus boolean union (closed blob in the gap). */
export function evalPairFillet(
  x: number,
  y: number,
  a: FieldStamp,
  b: FieldStamp,
  k: number,
): number {
  const da = stampSdf(x, y, a.rings, a.sdf)
  const db = stampSdf(x, y, b.rings, b.sdf)
  return cubicSmin(da, db, k)
}

export interface FieldStamp {
  rings: [number, number][][]
  sdf: AnalyticSdf | null
}

/** Neighbor pair that may cubic-smin inside its padded AABB. */
export interface SpatialPair {
  ia: number
  ib: number
  k: number
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/**
 * Boolean union of stamps, with cubic smin only inside each pair corridor.
 * Skip a pair when its surface gap exceeds k * 1.15 (caller filters those).
 */
export function evalBlendedField(
  x: number,
  y: number,
  stamps: FieldStamp[],
  pairs: SpatialPair[],
): number {
  const ds = new Array<number>(stamps.length)
  let d = Infinity
  for (let i = 0; i < stamps.length; i++) {
    const s = stamps[i]
    const v = stampSdf(x, y, s.rings, s.sdf)
    ds[i] = v
    if (v < d) d = v
  }
  for (const p of pairs) {
    if (x < p.minX || x > p.maxX || y < p.minY || y > p.maxY) continue
    const blended = cubicSmin(ds[p.ia], ds[p.ib], p.k)
    if (blended < d) d = blended
  }
  return d
}

function lerpZero(
  x0: number,
  y0: number,
  v0: number,
  x1: number,
  y1: number,
  v1: number,
): [number, number] {
  const den = v1 - v0
  const t = Math.abs(den) < 1e-9 ? 0.5 : Math.max(0, Math.min(1, -v0 / den))
  return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]
}

/** Marching squares at sdf = 0. Edge intercepts are linearly interpolated. */
export function marchingSquares(
  values: ArrayLike<number>,
  cols: number,
  rows: number,
  originX: number,
  originY: number,
  step: number,
): [number, number][][] {
  const segs: [[number, number], [number, number]][] = []
  const idx = (x: number, y: number) => y * (cols + 1) + x

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const x0 = originX + x * step
      const y0 = originY + y * step
      const x1 = x0 + step
      const y1 = y0 + step
      const v00 = values[idx(x, y)]
      const v10 = values[idx(x + 1, y)]
      const v11 = values[idx(x + 1, y + 1)]
      const v01 = values[idx(x, y + 1)]
      const code =
        (v00 < 0 ? 1 : 0) | (v10 < 0 ? 2 : 0) | (v11 < 0 ? 4 : 0) | (v01 < 0 ? 8 : 0)
      if (code === 0 || code === 15) continue

      const e: [[number, number], [number, number], [number, number], [number, number]] = [
        lerpZero(x0, y0, v00, x1, y0, v10),
        lerpZero(x1, y0, v10, x1, y1, v11),
        lerpZero(x0, y1, v01, x1, y1, v11),
        lerpZero(x0, y0, v00, x0, y1, v01),
      ]

      const add = (i: number, j: number) => segs.push([e[i], e[j]])
      switch (code) {
        case 1:
          add(3, 0)
          break
        case 2:
          add(0, 1)
          break
        case 3:
          add(3, 1)
          break
        case 4:
          add(1, 2)
          break
        case 5: {
          const center = (v00 + v10 + v11 + v01) * 0.25
          if (center < 0) {
            add(3, 2)
            add(0, 1)
          } else {
            add(3, 0)
            add(1, 2)
          }
          break
        }
        case 6:
          add(0, 2)
          break
        case 7:
          add(3, 2)
          break
        case 8:
          add(2, 3)
          break
        case 9:
          add(2, 0)
          break
        case 10: {
          const center = (v00 + v10 + v11 + v01) * 0.25
          if (center < 0) {
            add(0, 3)
            add(1, 2)
          } else {
            add(0, 1)
            add(2, 3)
          }
          break
        }
        case 11:
          add(2, 1)
          break
        case 12:
          add(1, 3)
          break
        case 13:
          add(1, 0)
          break
        case 14:
          add(0, 3)
          break
        default:
          break
      }
    }
  }

  return chainRings(segs)
}

function ptKey(p: [number, number]): string {
  return `${Math.round(p[0] * 200) / 200},${Math.round(p[1] * 200) / 200}`
}

function chainRings(segs: [[number, number], [number, number]][]): [number, number][][] {
  const out = new Map<string, [number, number][]>()
  const push = (a: [number, number], b: [number, number]) => {
    const k = ptKey(a)
    const list = out.get(k)
    if (list) list.push(b)
    else out.set(k, [b])
  }
  for (const [a, b] of segs) push(a, b)

  const used = new Set<string>()
  const rings: [number, number][][] = []
  const dirId = (a: [number, number], b: [number, number]) => `${ptKey(a)}>${ptKey(b)}`

  for (const [a, b] of segs) {
    const startId = dirId(a, b)
    if (used.has(startId)) continue
    const ring: [number, number][] = [a]
    let cur = a
    let nxt = b
    let guard = 0
    while (guard++ < 8000) {
      const id = dirId(cur, nxt)
      if (used.has(id)) break
      used.add(id)
      ring.push(nxt)
      if (ptKey(nxt) === ptKey(a) && ring.length > 3) break
      const nbrs = out.get(ptKey(nxt)) ?? []
      let next: [number, number] | null = null
      for (const n of nbrs) {
        if (used.has(dirId(nxt, n))) continue
        next = n
        break
      }
      if (!next) break
      cur = nxt
      nxt = next
    }
    if (ring.length >= 6) {
      const last = ring[ring.length - 1]
      if (ptKey(last) === ptKey(ring[0])) ring.pop()
      if (Math.abs(signedRingArea(ring)) > 8) rings.push(ring)
    }
  }
  return rings
}

function signedRingArea(ring: [number, number][]): number {
  let a = 0
  const n = ring.length
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    a += ring[i][0] * ring[j][1] - ring[j][0] * ring[i][1]
  }
  return a / 2
}

function pointInRing(x: number, y: number, ring: [number, number][]): boolean {
  return evenOddInside(x, y, [ring])
}

function centroid(ring: [number, number][]): [number, number] {
  let x = 0
  let y = 0
  for (const p of ring) {
    x += p[0]
    y += p[1]
  }
  const n = ring.length || 1
  return [x / n, y / n]
}

function ringContains(x: number, y: number, ring: [number, number][]): boolean {
  return pointInRing(x, y, ring)
}

/**
 * Keep outers that enclose a stamp center. Keep holes only if they enclose
 * an original hole seed (ring interiors). Drops floating bridge islands and
 * false neck holes on polygons.
 */
export function pruneFieldTopology(
  grouped: [number, number][][][],
  stampCenters: [number, number][],
  holeSeeds: [number, number][],
): [number, number][][][] {
  const out: [number, number][][][] = []
  for (const rings of grouped) {
    if (!rings.length) continue
    const outer = rings[0]
    const coversStamp = stampCenters.some(([x, y]) => ringContains(x, y, outer))
    if (!coversStamp) continue
    const holes = rings.slice(1).filter((hole) =>
      holeSeeds.some(([x, y]) => ringContains(x, y, hole)),
    )
    out.push(holes.length ? [outer, ...holes] : [outer])
  }
  return out.length ? out : grouped
}

/** Outer rings CCW, holes CW. */
export function groupOutersAndHoles(rings: [number, number][][]): [number, number][][][] {
  if (!rings.length) return []
  const scored = rings.map((ring) => ({ ring, area: signedRingArea(ring) }))
  scored.sort((a, b) => Math.abs(b.area) - Math.abs(a.area))
  const outers: { ring: [number, number][]; holes: [number, number][][] }[] = []
  for (const item of scored) {
    const ring = item.area >= 0 ? item.ring : [...item.ring].reverse()
    const [cx, cy] = centroid(ring)
    let parent = -1
    for (let i = 0; i < outers.length; i++) {
      if (pointInRing(cx, cy, outers[i].ring)) {
        parent = i
        break
      }
    }
    if (parent === -1) {
      outers.push({ ring, holes: [] })
    } else {
      const hole = signedRingArea(ring) > 0 ? [...ring].reverse() : ring
      outers[parent].holes.push(hole)
    }
  }
  return outers.map((o) => [o.ring, ...o.holes])
}

/** Closed-ring Douglas–Peucker. */
export function simplifyClosed(ring: [number, number][], epsilon: number): [number, number][] {
  if (ring.length < 5) return ring
  const open = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
    ? ring
    : [...ring, ring[0]]
  const simple = douglasPeucker(open, epsilon)
  if (simple.length >= 2) {
    const a = simple[0]
    const b = simple[simple.length - 1]
    if (a[0] === b[0] && a[1] === b[1]) simple.pop()
  }
  return simple.length >= 3 ? simple : ring
}

function douglasPeucker(pts: [number, number][], epsilon: number): [number, number][] {
  if (pts.length < 3) return pts.slice()
  const first = pts[0]
  const last = pts[pts.length - 1]
  let maxD = -1
  let idx = 0
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpDist(pts[i], first, last)
    if (d > maxD) {
      maxD = d
      idx = i
    }
  }
  if (maxD <= epsilon) return [first, last]
  const left = douglasPeucker(pts.slice(0, idx + 1), epsilon)
  const right = douglasPeucker(pts.slice(idx), epsilon)
  return [...left.slice(0, -1), ...right]
}

function perpDist(p: [number, number], a: [number, number], b: [number, number]): number {
  const vx = b[0] - a[0]
  const vy = b[1] - a[1]
  const len = Math.hypot(vx, vy)
  if (len < 1e-9) return Math.hypot(p[0] - a[0], p[1] - a[1])
  return Math.abs(vx * (a[1] - p[1]) - vy * (a[0] - p[0])) / len
}
