import polygonClipping from 'polygon-clipping'
import type { MultiPolygon, Polygon } from 'polygon-clipping'

function closedRing(ring: [number, number][]): [number, number][] {
  if (ring.length < 3) return []
  const pts: [number, number][] = ring.map(([x, y]) => [x, y])
  const a = pts[0]
  const b = pts[pts.length - 1]
  if (a[0] !== b[0] || a[1] !== b[1]) pts.push([a[0], a[1]])
  return pts
}

function signedArea(ring: [number, number][]): number {
  let a = 0
  const n = ring.length
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    a += ring[i][0] * ring[j][1] - ring[j][0] * ring[i][1]
  }
  return a / 2
}

export function ringAbsArea(ring: [number, number][]): number {
  return Math.abs(signedArea(ring))
}

function ringContains(x: number, y: number, ring: [number, number][]): boolean {
  let inside = false
  const n = ring.length
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i][0]
    const yi = ring[i][1]
    const xj = ring[j][0]
    const yj = ring[j][1]
    if (yi === yj) continue
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

/** True if evenodd fill of this multipolygon would paint (x, y). */
export function multiPolygonFills(mp: MultiPolygon, x: number, y: number): boolean {
  for (const poly of mp) {
    let hits = 0
    for (const ring of poly) {
      if (ringContains(x, y, ring)) hits++
    }
    if (hits % 2 === 1) return true
  }
  return false
}

/** Exterior CCW, holes CW — GeoJSON winding for polygon-clipping. */
export function toPolygon(rings: [number, number][][]): Polygon | null {
  if (!rings.length || rings[0].length < 3) return null
  const out: Polygon = []
  for (let i = 0; i < rings.length; i++) {
    const copy = rings[i].map(([x, y]) => [x, y] as [number, number])
    const area = signedArea(copy)
    const wantCcw = i === 0
    if (wantCcw ? area < 0 : area > 0) copy.reverse()
    const closed = closedRing(copy)
    if (closed.length >= 4) out.push(closed as Polygon[number])
  }
  return out.length ? out : null
}

function vec(cx: number, cy: number, angle: number, length: number): [number, number] {
  return [cx + Math.cos(angle) * length, cy + Math.sin(angle) * length]
}

export function sampleCubic(
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  steps = 16,
): [number, number][] {
  const pts: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const mt = 1 - t
    const mt2 = mt * mt
    const t2 = t * t
    pts.push([
      mt2 * mt * p0[0] + 3 * mt2 * t * p1[0] + 3 * mt * t2 * p2[0] + t2 * t * p3[0],
      mt2 * mt * p0[1] + 3 * mt2 * t * p1[1] + 3 * mt * t2 * p2[1] + t2 * t * p3[1],
    ])
  }
  return pts
}

/**
 * Classic 2-disc metaball as a closed ring (concave necks, not a stadium).
 * Null if too far, concentric, or one disc contains the other.
 */
export function metaballRing(
  x1: number,
  y1: number,
  r1: number,
  x2: number,
  y2: number,
  r2: number,
  handleSize: number,
  v: number,
): [number, number][] | null {
  if (r1 < 0.5 || r2 < 0.5) return null
  const d = Math.hypot(x2 - x1, y2 - y1)
  if (d < 1e-4) return null
  if (d > (r1 + r2) * handleSize) return null
  if (d <= Math.abs(r1 - r2) + 0.01) return null

  let u1: number
  let u2: number
  if (d < r1 + r2) {
    u1 = Math.acos(Math.min(1, Math.max(-1, (r1 * r1 + d * d - r2 * r2) / (2 * r1 * d))))
    u2 = Math.acos(Math.min(1, Math.max(-1, (r2 * r2 + d * d - r1 * r1) / (2 * r2 * d))))
  } else {
    u1 = 0
    u2 = 0
  }

  const angleBetween = Math.atan2(y2 - y1, x2 - x1)
  const maxSpread = Math.acos(Math.min(1, Math.max(-1, (r1 - r2) / d)))
  const angle1 = angleBetween + u1 + (maxSpread - u1) * v
  const angle2 = angleBetween - u1 - (maxSpread - u1) * v
  const angle3 = angleBetween + Math.PI - u2 - (Math.PI - u2 - maxSpread) * v
  const angle4 = angleBetween - Math.PI + u2 + (Math.PI - u2 - maxSpread) * v

  const p1 = vec(x1, y1, angle1, r1)
  const p2 = vec(x1, y1, angle2, r1)
  const p3 = vec(x2, y2, angle3, r2)
  const p4 = vec(x2, y2, angle4, r2)

  const totalRadius = r1 + r2
  const d2 = Math.min(v * handleSize, Math.hypot(p3[0] - p1[0], p3[1] - p1[1]) / totalRadius)
  const halfPi = Math.PI / 2
  const h1 = vec(p1[0], p1[1], angle1 - halfPi, r1 * d2)
  const h2 = vec(p2[0], p2[1], angle2 + halfPi, r1 * d2)
  const h3 = vec(p3[0], p3[1], angle3 + halfPi, r2 * d2)
  const h4 = vec(p4[0], p4[1], angle4 - halfPi, r2 * d2)

  const ring = [...sampleCubic(p1, h1, h3, p3, 20), ...sampleCubic(p4, h4, h2, p2, 20)]
  return ring.length >= 8 ? ring : null
}

/** True if two polygons share a real area — not a point or hairline kiss. */
export function polygonsOverlap(a: Polygon, b: Polygon, minArea = 1): boolean {
  try {
    const hit = polygonClipping.intersection(a, b) as MultiPolygon
    return hit.some((poly) => poly[0] && ringAbsArea(poly[0]) >= minArea)
  } catch {
    return false
  }
}

export function unionPolygons(polygons: Polygon[]): MultiPolygon {
  const valid = polygons.filter((p) => p.length && p[0].length >= 4)
  if (!valid.length) return []
  if (valid.length === 1) return [valid[0]]
  // One sweep is much cheaper than folding union(acc, next) as the outline grows.
  try {
    return polygonClipping.union(valid[0], ...valid.slice(1)) as MultiPolygon
  } catch {
    // Weld tangents can coincide with stamp edges to floating-point precision.
    // Retry on an integer grid before the last-resort contour fallback, which
    // would otherwise silently discard a valid join in one orientation.
    const scale = 1000
    const snapped = valid.map(poly => poly.map(ring => ring.map(([x, y]) =>
      [Math.round(x * scale), Math.round(y * scale)] as [number, number],
    )))
    try {
      const result = polygonClipping.union(snapped[0], ...snapped.slice(1))
      return result.map(poly => poly.map(ring => ring.map(([x, y]) => [x / scale, y / scale]))) as MultiPolygon
    } catch {
      // Malformed inputs still fall back to preserving the surviving bodies.
    }
    let acc: MultiPolygon = [valid[0]]
    for (let i = 1; i < valid.length; i++) {
      try {
        acc = polygonClipping.union(acc, valid[i]) as MultiPolygon
      } catch {
        /* skip a bad contour rather than dropping the whole glyph */
      }
    }
    return acc
  }
}

export function multiPolygonToPathList(mp: MultiPolygon): string[] {
  const paths: string[] = []
  for (const poly of mp) {
    const parts: string[] = []
    for (const ring of poly) {
      if (!ring || ring.length < 3) continue
      const last = ring[ring.length - 1]
      const pts =
        ring.length > 1 && ring[0][0] === last[0] && ring[0][1] === last[1]
          ? ring.slice(0, -1)
          : ring
      if (pts.length < 3) continue
      parts.push(`M ${pts.map(([x, y]) => `${x} ${y}`).join(' L ')} Z`)
    }
    if (parts.length) paths.push(parts.join(' '))
  }
  return paths
}

export function differencePolygons(subjects: Polygon[], cutters: Polygon[]): MultiPolygon {
  let acc = unionPolygons(subjects)
  if (!acc.length) return []
  for (const c of cutters) {
    if (!c.length || c[0].length < 4) continue
    try {
      acc = polygonClipping.difference(acc, c) as MultiPolygon
    } catch {
      const scale = 1000
      const snappedAcc = acc.map((poly) =>
        poly.map((ring) =>
          ring.map(([x, y]) => [Math.round(x * scale), Math.round(y * scale)] as [number, number]),
        ),
      )
      const snappedC = c.map((ring) =>
        ring.map(([x, y]) => [Math.round(x * scale), Math.round(y * scale)] as [number, number]),
      )
      try {
        const result = polygonClipping.difference(snappedAcc, snappedC) as MultiPolygon
        acc = result.map((poly) =>
          poly.map((ring) => ring.map(([x, y]) => [x / scale, y / scale])),
        ) as MultiPolygon
      } catch {
        /* keep acc */
      }
    }
  }
  return acc
}

export function ringsToPath(rings: [number, number][][]): string {
  const poly = toPolygon(rings)
  if (!poly) return ''
  return multiPolygonToPathList([poly])[0] ?? ''
}

/**
 * Filters holes in a list of polygons based on HoleMode:
 * - 'open': keeps all holes as-is.
 * - 'no-gaps': removes tiny interstitial holes between stamps (area <= maxGapArea)
 *              while preserving intentional letter counters (like the bowl of 'a', 'o', 'e').
 * - 'solid': removes all internal holes completely, leaving a solid silhouette.
 *
 * Ring-brush holes are not handled here — use filterPolygonHolesPreserving with
 * intentionalHoleCutters so Gaps fill/solid never seals ring centers.
 */
export function filterPolygonHoles(
  polygons: Polygon[],
  mode: 'open' | 'no-gaps' | 'solid',
  maxGapArea = 600,
): Polygon[] {
  if (mode === 'open') return polygons

  return polygons
    .map((poly) => {
      if (poly.length <= 1) return poly
      const exterior = poly[0]
      if (mode === 'solid') {
        return [exterior]
      }
      // mode === 'no-gaps': drop hole rings whose absolute area <= maxGapArea
      const keptHoles = poly.slice(1).filter((holeRing) => {
        const area = ringAbsArea(holeRing)
        return area > maxGapArea
      })
      return [exterior, ...keptHoles]
    })
    .filter((poly) => poly.length > 0)
}

/**
 * Solid cutters for intentional inner rings (e.g. ring brush).
 * Hole rings are stored clockwise for evenodd; flip them into exteriors for difference.
 */
export function intentionalHoleCutters(ringSets: [number, number][][][]): Polygon[] {
  const cutters: Polygon[] = []
  for (const rings of ringSets) {
    for (let i = 1; i < rings.length; i++) {
      const hole = rings[i]
      if (!hole || hole.length < 3) continue
      const cutter = toPolygon([hole.slice().reverse()])
      if (cutter) cutters.push(cutter)
    }
  }
  return cutters
}

/** Apply Gaps mode, then re-punch intentional holes (ring centers, etc.). */
export function filterPolygonHolesPreserving(
  polygons: Polygon[],
  mode: 'open' | 'no-gaps' | 'solid',
  maxGapArea = 600,
  preserveCutters: Polygon[] = [],
): Polygon[] {
  const filtered = filterPolygonHoles(polygons, mode, maxGapArea)
  if (mode === 'open' || !preserveCutters.length || !filtered.length) return filtered
  return differencePolygons(filtered, preserveCutters)
}
