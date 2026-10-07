/**
 * Polygon signed-distance sampling and marching squares at sdf = 0.
 * Field melts in `fieldExperiments.ts` build on these.
 */

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

/** Even-odd inside test (matches ring holes). */
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

/** Signed distance: negative inside the filled silhouette (holes stay outside). */
export function sdfRings(x: number, y: number, rings: [number, number][][]): number {
  if (!rings.length) return 1e6
  const d = minEdgeDist(x, y, rings)
  return evenOddInside(x, y, rings) ? -d : d
}

function lerpZero(
  x0: number,
  y0: number,
  v0: number,
  x1: number,
  y1: number,
  v1: number,
): [number, number] {
  const den = v0 - v1
  const t = Math.abs(den) < 1e-9 ? 0.5 : v0 / den
  const u = Math.max(0, Math.min(1, t))
  return [x0 + (x1 - x0) * u, y0 + (y1 - y0) * u]
}

/**
 * Marching squares at sdf = 0. Returns closed rings (may include holes).
 */
export function marchingSquares(
  values: number[],
  cols: number,
  rows: number,
  originX: number,
  originY: number,
  step: number,
  minArea = 10,
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
      const b0 = v00 < 0 ? 1 : 0
      const b1 = v10 < 0 ? 2 : 0
      const b2 = v11 < 0 ? 4 : 0
      const b3 = v01 < 0 ? 8 : 0
      const code = b0 | b1 | b2 | b3
      if (code === 0 || code === 15) continue

      const e: [[number, number], [number, number], [number, number], [number, number]] = [
        lerpZero(x0, y0, v00, x1, y0, v10),
        lerpZero(x1, y0, v10, x1, y1, v11),
        lerpZero(x0, y1, v01, x1, y1, v11),
        lerpZero(x0, y0, v00, x0, y1, v01),
      ]

      const add = (i: number, j: number) => segs.push([e[i], e[j]])
      // Directed so solid stays on the left (CCW).
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
        case 5:
          add(3, 0)
          add(1, 2)
          break
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
        case 10:
          add(0, 1)
          add(2, 3)
          break
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

  return chainRings(segs, minArea)
}

function ptKey(p: [number, number]): string {
  return `${Math.round(p[0] * 200) / 200},${Math.round(p[1] * 200) / 200}`
}

function chainRings(segs: [[number, number], [number, number]][], minArea: number): [number, number][][] {
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
    while (guard++ < 4000) {
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
    if (ring.length >= 8) {
      const last = ring[ring.length - 1]
      if (ptKey(last) === ptKey(ring[0])) ring.pop()
      if (ringArea(ring) > minArea) rings.push(ring)
    }
  }
  return rings
}

function ringArea(ring: [number, number][]): number {
  let a = 0
  const n = ring.length
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    a += ring[i][0] * ring[j][1] - ring[j][0] * ring[i][1]
  }
  return Math.abs(a) / 2
}
