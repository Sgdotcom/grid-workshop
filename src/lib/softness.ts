/**
 * Paint Softness — rounded neighbors melt; everything else only joins if it
 * already overlaps.
 *
 * Roundedness is the eligibility switch: circles, rings, capsules, and convex
 * stamps with enough corner radius grow a metaball neck. Stars, X, crosses,
 * chevrons, and sharp polygons never get a glued-on bar — if large stamps
 * already overlap in the grid, boolean union is enough (both X arms included).
 * Softness 0 = crisp. Break join disables a pair.
 * Enclosed empty cells stay open — union holes are kept (only sliver holes drop).
 */

import { arcFlatBlend, usesArcFlatBlend } from './arcFlatBlend'
import type { PresetShapeId, ShapeDef } from '@/lib/types'
import {
  MELT_OFF_STORAGE_KEY,
  SHAPE_JOIN_STORAGE_KEY,
  getActiveJoinMethod,
  getJoinEngineMode,
  getMixedPairJoinMethod,
  isPresetMeltOff,
} from '@/lib/shapeJoinRegistry'
import type { MixedPairMethod } from '@/lib/shapeJoinRegistry'
import { fieldBlendRings } from '@/lib/fieldExperiments'
import {
  BAR_THICKNESS,
  shapeContactSamples,
  shapeIsBlobLike,
  shapeIsCapsule,
  shapeIsCircular,
  shapeOutlineRings,
  shapeRoundness,
} from '@/lib/shapes'
import {
  differencePolygons,
  filterPolygonHolesPreserving,
  intentionalHoleCutters,
  metaballRing,
  multiPolygonFills,
  multiPolygonToPathList,
  polygonsOverlap,
  ringAbsArea,
  sampleCubic,
  toPolygon,
  unionPolygons,
} from '@/lib/polyBool'
import polygonClipping, { type Polygon } from 'polygon-clipping'

export interface SoftStamp {
  id: string
  cx: number
  cy: number
  /** Size-based envelope radius used for distance gating. */
  r: number
  size: number
  rotation?: number
  col: number
  row: number
  circular?: boolean
  /** Circle / ring / capsule, or a convex stamp with enough corner rounding. */
  blobLike?: boolean
  /** Sharp triangle (centroid discs miss the facing edges). */
  pointy?: boolean
  /** Stadium — centroid metaballs grow diamond collars. */
  capsule?: boolean
  /** True H/V capsule (already round; keep contact stadium). */
  capsuleBody?: boolean
  /** Rotated plus — two facing arms, weld both. */
  forked?: boolean
  /** Preset id when this stamp is a built-in module. */
  preset?: PresetShapeId
  /** Facing-side family; unlike kinds only melt at max Softness unless they already meet. */
  family: string
  /** Half-thickness of the stamped bar / arm, for neck sizing. */
  arm: number
  roundness: number
  contacts: [number, number][]
  /** Real silhouette rings (outer + holes) for boolean fuse. */
  rings: [number, number][][]
}

/** Order-independent neighbor edge key. */
export function softEdgeKey(c1: number, r1: number, c2: number, r2: number) {
  if (c1 < c2 || (c1 === c2 && r1 < r2)) return `${c1}:${r1}|${c2}:${r2}`
  return `${c2}:${r2}|${c1}:${r1}`
}

export type BrokenJoins = Set<string>

function dist(x1: number, y1: number, x2: number, y2: number) {
  return Math.hypot(x2 - x1, y2 - y1)
}

export function softnessExpandStroke(_size: number, _softness: number): number {
  // Fuse is boolean union, not fattened strokes (those circularized shapes).
  void _size
  void _softness
  return 0
}

/** Envelope radius from module size — larger stamps reach farther. */
export function stampEnvelopeRadius(size: number, _circular = false): number {
  void _circular
  return size * 0.48
}

function stampArmWidth(def: ShapeDef, size: number): number {
  if (def.kind === 'star') return size * 0.13
  if (def.kind === 'polygon') return size * 0.48
  switch (def.preset) {
    case 'capsule':
    case 'capsuleV':
    case 'rect':
      return size * BAR_THICKNESS * 0.5
    case 'cross':
    case 'x':
      return size * 0.16
    case 'star5':
    case 'star4':
      return size * 0.13
    case 'chevron':
      return size * 0.12
    case 'triangle':
      return size * 0.2
    case 'diamond':
      return size * 0.22
    case 'circle':
    case 'ring':
      return size * 0.5
    default:
      return size * 0.48
  }
}

function stampFamily(def: ShapeDef): string {
  if (shapeIsCircular(def)) return 'round'
  if (shapeIsCapsule(def)) return 'capsule'
  if (def.kind === 'star') return 'star'
  if (def.kind === 'polygon') return def.sides <= 3 ? 'point' : 'flat'
  switch (def.preset) {
    case 'x':
      return 'x'
    case 'cross':
      return 'cross'
    case 'star5':
    case 'star4':
      return 'star'
    case 'chevron':
      return 'chevron'
    case 'triangle':
      return 'point'
    default:
      return 'flat'
  }
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
  rotation = 0,
): SoftStamp {
  const circular = shapeIsCircular(def)
  const roundness = shapeRoundness(def, cornerRadius, size)
  const blobLike = shapeIsBlobLike(def, cornerRadius, size)
  const pointy =
    (def.kind === 'preset' && def.preset === 'triangle') ||
    (def.kind === 'polygon' && def.sides <= 3)
  const capsule =
    shapeIsCapsule(def) ||
    (def.kind === 'preset' && (def.preset === 'rect' || def.preset === 'diamond'))
  const rings = shapeOutlineRings(def, ox, oy, size, cornerRadius, rotation)
  return {
    id,
    cx,
    cy,
    r: stampEnvelopeRadius(size, circular),
    size,
    rotation,
    col,
    row,
    circular,
    blobLike,
    pointy,
    capsule,
    capsuleBody: shapeIsCapsule(def),
    forked: def.kind === 'preset' && def.preset === 'x',
    preset: def.kind === 'preset' ? def.preset : undefined,
    family: stampFamily(def),
    arm: stampArmWidth(def, size),
    roundness,
    contacts: shapeContactSamples(def, ox, oy, size, cornerRadius, rotation),
    rings,
  }
}

/**
 * Max outline-to-outline gap that still fuses at this Softness.
 * Low slider ≈ must almost touch. High slider ≈ join across a bigger gap.
 * Larger modules reach a little farther.
 */
export function fuseMaxGap(meanSize: number, softness: number, diagonal = false): number {
  if (softness <= 0.02) return 0
  return meanSize * (0.16 + softness * 1.12) * (diagonal ? 0.88 : 1)
}

/** Outlines this close already meet (overlap, or a large stamp filling the cell). */
export function meetGap(meanSize: number): number {
  return Math.max(2.4, meanSize * 0.07)
}

/** Horizontal bar (rectangle). Capsules use `capsuleBody`; diamonds are pointy. */
function isElongatedBar(s: SoftStamp): boolean {
  return !!s.capsule && !s.capsuleBody && s.arm >= s.size * 0.3
}

/** Circles, capsules, and convex stamps that have been rounded enough to blob. */
export function stampBlobs(s: SoftStamp): boolean {
  if (s.circular || s.capsuleBody) return true
  if (s.pointy || s.forked) return false
  if (s.arm < s.size * 0.22) return false
  return s.roundness >= 0.4
}

export function facingSidesMatch(a: SoftStamp, b: SoftStamp): boolean {
  return a.family === b.family
}

/**
 * Whether this pair becomes one outline.
 * Overlap always unions. A melt-neck is only grown between blob-capable stamps.
 */
export function pairCanFuse(
  a: SoftStamp,
  b: SoftStamp,
  softness: number,
  diagonal = false,
): boolean {
  if (softness <= 0.02) return false
  const { gap } = closestOutlinePoints(a, b)
  const meanSize = (a.size + b.size) * 0.5
  if (gap > fuseMaxGap(meanSize, softness, diagonal)) return false
  // Per-shape “Melt off”: no Softness neck across a gap (touch still unions below).
  if (isPresetMeltOff(a.preset) || isPresetMeltOff(b.preset)) {
    return gap <= meetGap(meanSize)
  }
  if (usesArcFlatBlend(a,b) && getJoinEngineMode() !== 'fork-current') return true
  if (gap <= meetGap(meanSize)) return true
  // Same-preset joins own their own melt; mixed pairs still need blob-capable stamps
  // unless the preview lab picked an explicit method for this pair.
  if (a.preset && a.preset === b.preset) return true
  const mixed = getMixedPairJoinMethod(a.preset, b.preset)
  // `none` = no Softness melt across a gap (overlap still unions via meetGap above).
  if (mixed === 'none') return false
  if (mixed) return true
  return stampBlobs(a) && stampBlobs(b)
}

/**
 * Whether two stamps fuse at this Softness — based on outline distance, not
 * just cell centers. Null = too far (or Softness 0).
 */
export function blendStrength(
  a: SoftStamp,
  b: SoftStamp,
  softness: number,
  diagonal: boolean,
): { strength: number; proximity: number; d: number; gap: number } | null {
  if (softness <= 0.02) return null
  if (!pairCanFuse(a, b, softness, diagonal)) return null

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

type ContactSite = { pa: [number, number]; pb: [number, number]; gap: number }

function neighborFrame(a: SoftStamp, b: SoftStamp) {
  const ux = b.cx - a.cx
  const uy = b.cy - a.cy
  const ulen = Math.hypot(ux, uy) || 1
  return {
    nx: -uy / ulen,
    ny: ux / ulen,
    mx: (a.cx + b.cx) * 0.5,
    my: (a.cy + b.cy) * 0.5,
    diagonal: a.col !== b.col && a.row !== b.row,
    horizontal: a.row === b.row,
  }
}

function gatherContactHits(
  a: SoftStamp,
  b: SoftStamp,
  band: number,
): { pa: [number, number]; pb: [number, number]; d: number }[] {
  let best = Infinity
  const hits: { pa: [number, number]; pb: [number, number]; d: number }[] = []
  const ca = a.contacts
  const cb = b.contacts
  for (let i = 0; i < ca.length; i++) {
    for (let j = 0; j < cb.length; j++) {
      const d = dist(ca[i][0], ca[i][1], cb[j][0], cb[j][1])
      if (d < best - band) {
        best = d
        hits.length = 0
        hits.push({ pa: ca[i], pb: cb[j], d })
      } else if (d <= best + band) {
        hits.push({ pa: ca[i], pb: cb[j], d })
        if (d < best) best = d
      }
    }
  }
  // The minimum may decrease by less than band several times during the scan.
  // Remove earlier hits outside the final band so vertex order cannot bias it.
  return hits.filter(hit => hit.d <= best + band)
}

function pickContactSite(
  a: SoftStamp,
  b: SoftStamp,
  hits: { pa: [number, number]; pb: [number, number]; d: number }[],
): ContactSite {
  const { nx, ny, mx, my, diagonal, horizontal } = neighborFrame(a, b)
  let pa: [number, number] = [a.cx, a.cy]
  let pb: [number, number] = [b.cx, b.cy]
  if (!hits.length) return { pa, pb, gap: dist(a.cx, a.cy, b.cx, b.cy) }
  let gap = Infinity
  let skewBest = Infinity
  let alongBest = Infinity
  for (const h of hits) {
    if (h.d < gap) gap = h.d
    const skew = diagonal
      ? Math.abs((h.pa[0] - h.pb[0]) * nx + (h.pa[1] - h.pb[1]) * ny)
      : horizontal
        ? Math.abs(h.pa[1] - h.pb[1])
        : Math.abs(h.pa[0] - h.pb[0])
    const along = diagonal
      ? Math.abs(
          ((h.pa[0] + h.pb[0]) * 0.5 - mx) * nx + ((h.pa[1] + h.pb[1]) * 0.5 - my) * ny,
        )
      : horizontal
        ? Math.abs((h.pa[1] + h.pb[1]) * 0.5 - a.cy)
        : Math.abs((h.pa[0] + h.pb[0]) * 0.5 - a.cx)
    if (
      skew < skewBest - 1e-6 ||
      (Math.abs(skew - skewBest) <= 1e-6 && along < alongBest - 1e-6)
    ) {
      skewBest = skew
      alongBest = along
      pa = h.pa
      pb = h.pb
    }
  }
  return { pa, pb, gap }
}

function closestOutlinePoints(a: SoftStamp, b: SoftStamp): ContactSite {
  return pickContactSite(a, b, gatherContactHits(a, b, 0.45))
}

/**
 * One site for a single facing edge; two when the closest hits sit in two
 * clusters on opposite sides of the neighbor axis and nothing in between —
 * the X / rotated-plus case, where both pairs of arms should weld.
 */
export function contactSites(a: SoftStamp, b: SoftStamp): ContactSite[] {
  const primary = closestOutlinePoints(a, b)
  if (!a.forked || !b.forked) return [primary]
  if (a.col !== b.col && a.row !== b.row) return [primary]
  const meanSize = (a.size + b.size) * 0.5
  const { nx, ny, mx, my } = neighborFrame(a, b)
  const alongOf = (pa: [number, number], pb: [number, number]) =>
    ((pa[0] + pb[0]) * 0.5 - mx) * nx + ((pa[1] + pb[1]) * 0.5 - my) * ny
  let high: ContactSite | null = null
  let low: ContactSite | null = null
  const ca = a.contacts
  const cb = b.contacts
  for (let i = 0; i < ca.length; i++) {
    for (let j = 0; j < cb.length; j++) {
      const along = alongOf(ca[i], cb[j])
      const d = dist(ca[i][0], ca[i][1], cb[j][0], cb[j][1])
      if (along > meanSize * 0.18) {
        if (!high || d < high.gap) high = { pa: ca[i], pb: cb[j], gap: d }
      } else if (along < -meanSize * 0.18) {
        if (!low || d < low.gap) low = { pa: ca[i], pb: cb[j], gap: d }
      }
    }
  }
  if (high && low) return [high, low]
  return [primary]
}

function outerRadius(stamp: SoftStamp): number {
  const ring = stamp.rings[0]
  if (!ring?.length) return stamp.size * 0.5
  let best = 0
  for (const [x, y] of ring) {
    const d = dist(stamp.cx, stamp.cy, x, y)
    if (d > best) best = d
  }
  return best || stamp.size * 0.5
}

/** Distance from stamp center to its outer outline, toward another point. */
function radiusToward(stamp: SoftStamp, tx: number, ty: number): number {
  const ring = stamp.rings[0]
  if (!ring?.length) return stamp.size * 0.5
  const dx = tx - stamp.cx
  const dy = ty - stamp.cy
  const len = Math.hypot(dx, dy)
  if (len < 1e-4) return outerRadius(stamp)
  const ux = dx / len
  const uy = dy / len
  let best = Infinity
  const n = ring.length
  for (let i = 0; i < n; i++) {
    const ax = ring[i][0] - stamp.cx
    const ay = ring[i][1] - stamp.cy
    const bx = ring[(i + 1) % n][0] - stamp.cx
    const by = ring[(i + 1) % n][1] - stamp.cy
    const vx = bx - ax
    const vy = by - ay
    const det = ux * vy - uy * vx
    if (Math.abs(det) < 1e-9) continue
    const t = (ax * vy - ay * vx) / det
    const s = (ax * uy - ay * ux) / det
    if (t > 0.2 && s >= -0.02 && s <= 1.02 && t < best) best = t
  }
  if (!Number.isFinite(best) || best > stamp.size * 1.2) return outerRadius(stamp)
  return best
}

function holePolygon(stamp: SoftStamp): Polygon | null {
  if (stamp.rings.length < 2) return null
  let r = 0
  for (const [x, y] of stamp.rings[1]) {
    const d = dist(stamp.cx, stamp.cy, x, y)
    if (d > r) r = d
  }
  if (r < 0.5) return toPolygon([stamp.rings[1]])
  const circle: [number, number][] = []
  for (let i = 0; i < 48; i++) {
    const a = (i * 2 * Math.PI) / 48
    circle.push([stamp.cx + r * Math.cos(a), stamp.cy + r * Math.sin(a)])
  }
  return toPolygon([circle])
}

function pairMetaball(
  a: SoftStamp,
  b: SoftStamp,
  softness: number,
  diagonal: boolean,
  r1: number,
  r2: number,
  melt = 1,
  vScale = 1,
): Polygon[] {
  const roundBoost = 1 + Math.max(a.roundness, b.roundness) * 0.12
  const handleSize = (1.7 + softness * 1.25) * (diagonal ? 1.15 : 1) * roundBoost * melt
  const v = (0.4 + softness * 0.28) * vScale
  const ring = metaballRing(a.cx, a.cy, r1, b.cx, b.cy, r2, handleSize, v)
  if (!ring) return []
  const blob = toPolygon([ring])
  if (!blob) return []
  const holes = [holePolygon(a), holePolygon(b)].filter((p): p is Polygon => !!p)
  if (!holes.length) return [blob]
  return differencePolygons([blob], holes)
}

function circularMetaball(
  a: SoftStamp,
  b: SoftStamp,
  softness: number,
  diagonal: boolean,
  melt = 1,
): Polygon[] {
  return pairMetaball(a, b, softness, diagonal, outerRadius(a), outerRadius(b), melt)
}

function blobRadius(stamp: SoftStamp, ox: number, oy: number): number {
  const r = radiusToward(stamp, ox, oy)
  if (stamp.circular) return r
  // A little extra so rounded flats still grow a metaball neck, not a flat weld.
  const padded = r * (1 + stamp.roundness * 0.1)
  // Rectangles: radiusToward along the long axis is half-length, which grows a
  // disc thicker than the bar and a diamond collar at the join.
  if (isElongatedBar(stamp)) return Math.min(padded, stamp.arm * 1.08)
  return padded
}

function blobMetaball(
  a: SoftStamp,
  b: SoftStamp,
  softness: number,
  diagonal: boolean,
  melt = 1,
): Polygon[] {
  return pairMetaball(
    a,
    b,
    softness,
    diagonal,
    blobRadius(a, b.cx, b.cy),
    blobRadius(b, a.cx, a.cy),
    melt,
  )
}

function circlePoly(cx: number, cy: number, r: number): Polygon | null {
  if (r < 0.8) return null
  const ring: [number, number][] = []
  for (let i = 0; i < 16; i++) {
    const a = (i * 2 * Math.PI) / 16
    ring.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
  }
  return toPolygon([ring])
}

function stadiumPoly(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  r: number,
): Polygon | null {
  if (r < 0.8) return null
  const d = dist(ax, ay, bx, by)
  if (d < 0.8) return circlePoly((ax + bx) * 0.5, (ay + by) * 0.5, r)
  const ang = Math.atan2(by - ay, bx - ax)
  const ring: [number, number][] = []
  const cap = 10
  for (let i = 0; i <= cap; i++) {
    const a = ang - Math.PI / 2 + (i * Math.PI) / cap
    ring.push([bx + r * Math.cos(a), by + r * Math.sin(a)])
  }
  for (let i = 0; i <= cap; i++) {
    const a = ang + Math.PI / 2 + (i * Math.PI) / cap
    ring.push([ax + r * Math.cos(a), ay + r * Math.sin(a)])
  }
  return toPolygon([ring])
}

function pullToward(p: [number, number], cx: number, cy: number, amount: number): [number, number] {
  const dx = cx - p[0]
  const dy = cy - p[1]
  const len = Math.hypot(dx, dy) || 1
  return [p[0] + (dx / len) * amount, p[1] + (dy / len) * amount]
}

/**
 * Neck is a stadium along the closest mid-edge points, thickness capped
 * to the stamped arm so discs cannot swallow stars / bump thin bars.
 */
function contactNeck(
  a: SoftStamp,
  b: SoftStamp,
  softness: number,
  diagonal: boolean,
  site?: ContactSite,
): Polygon[] {
  void diagonal
  const { pa, pb } = site ?? closestOutlinePoints(a, b)
  const arm = Math.max(2.4, Math.min(a.arm, b.arm))
  const r = Math.max(2.2, arm * (0.32 + 0.7 * softness))
  const inset = Math.min(r * 0.55, arm * 0.45)
  const ia = pullToward(pa, a.cx, a.cy, inset)
  const ib = pullToward(pb, b.cx, b.cy, inset)
  const poly = stadiumPoly(ia[0], ia[1], ib[0], ib[1], r)
  return poly ? [poly] : []
}

/** Ring orientation, for convex / concave corner tests. */
function ringSignedArea(ring: [number, number][]): number {
  let area = 0
  for (let i = 0; i < ring.length; i++) {
    const j = (i + 1) % ring.length
    area += ring[i][0] * ring[j][1] - ring[j][0] * ring[i][1]
  }
  return area * 0.5
}

function pointInRing(ring: [number, number][], px: number, py: number): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0]
    const yi = ring[i][1]
    const xj = ring[j][0]
    const yj = ring[j][1]
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Closest point on a ring, as the segment it lies on plus the point. */
function nearestRingPosition(
  ring: [number, number][],
  px: number,
  py: number,
): { seg: number; pt: [number, number] } {
  const n = ring.length
  let best = Infinity
  let seg = 0
  let pt: [number, number] = [ring[0][0], ring[0][1]]
  for (let i = 0; i < n; i++) {
    const ax = ring[i][0]
    const ay = ring[i][1]
    const vx = ring[(i + 1) % n][0] - ax
    const vy = ring[(i + 1) % n][1] - ay
    const len2 = vx * vx + vy * vy
    const t = len2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len2))
    const qx = ax + vx * t
    const qy = ay + vy * t
    const d = (qx - px) * (qx - px) + (qy - py) * (qy - py)
    if (d < best) {
      best = d
      seg = i
      pt = [qx, qy]
    }
  }
  return { seg, pt }
}

/**
 * Snap to a fixed grid, then drop repeated and collinear points.
 * polygon-clipping throws on rings with duplicate or degenerate segments, and
 * `unionPolygons` swallows that by skipping the contour — which silently drops
 * a weld and leaves the pair as two outlines.
 */
function simplifyRing(ring: [number, number][]): [number, number][] {
  const snapped: [number, number][] = []
  for (const [x, y] of ring) {
    const px = Math.round(x * 1e3) / 1e3
    const py = Math.round(y * 1e3) / 1e3
    const last = snapped[snapped.length - 1]
    if (last && Math.abs(last[0] - px) < 1e-3 && Math.abs(last[1] - py) < 1e-3) continue
    snapped.push([px, py])
  }
  while (
    snapped.length > 1 &&
    Math.abs(snapped[0][0] - snapped[snapped.length - 1][0]) < 1e-3 &&
    Math.abs(snapped[0][1] - snapped[snapped.length - 1][1]) < 1e-3
  ) {
    snapped.pop()
  }
  const out: [number, number][] = []
  const n = snapped.length
  for (let i = 0; i < n; i++) {
    const prev = out.length ? out[out.length - 1] : snapped[(i - 1 + n) % n]
    const cur = snapped[i]
    const next = snapped[(i + 1) % n]
    const cross = (cur[0] - prev[0]) * (next[1] - cur[1]) - (cur[1] - prev[1]) * (next[0] - cur[0])
    if (Math.abs(cross) < 1e-4) continue
    out.push(cur)
  }
  return out.length >= 3 ? out : snapped
}

/** Where a weld leaves a silhouette, and the tangent it leaves on. */
interface WeldEnd {
  pt: [number, number]
  /** Unit outline tangent, pointing back toward the contact. */
  exit: [number, number]
}

/**
 * Walk the silhouette outward from the contact until Softness' arc length runs
 * out, stopping early at the first concave corner so a weld cannot flood a
 * star's valley or a cross's armpit. Skips outline still inside the neighbor.
 */
function walkToWeldEnd(
  stamp: SoftStamp,
  other: SoftStamp,
  seg: number,
  from: [number, number],
  dir: 1 | -1,
  maxArc: number,
  minArc: number,
): WeldEnd | null {
  const ring = stamp.rings[0]
  const n = ring?.length ?? 0
  if (n < 3) return null
  const otherRing = other.rings[0]
  const convexSign = (ringSignedArea(ring) >= 0 ? 1 : -1) * dir
  const limit = maxArc * 1.4 + 3
  const reflexArc = Math.max(minArc, stamp.size * 0.16)
  let px = from[0]
  let py = from[1]
  let arc = 0
  let vi = dir > 0 ? (seg + 1) % n : seg
  let outside = false
  let end: WeldEnd | null = null

  for (let guard = 0; guard <= n && arc < limit; guard++) {
    const cx = ring[vi][0]
    const cy = ring[vi][1]
    const ex = cx - px
    const ey = cy - py
    const len = Math.hypot(ex, ey)
    if (len > 1e-6) {
      const tx = ex / len
      const ty = ey / len
      const steps = Math.max(1, Math.ceil(len / 2))
      const fractions = Array.from({ length: steps }, (_, i) => (i + 1) / steps)
      // Include the exact arc endpoint. Keep later samples too, since an
      // overlapping neighbor can hide the desired attachment inside its body.
      const target = (maxArc - arc) / len
      if (target > 0 && target < 1) fractions.push(target)
      fractions.sort((left, right) => left - right)
      for (const t of fractions) {
        const qx = px + ex * t
        const qy = py + ey * t
        const qArc = arc + len * t
        if (!outside && !pointInRing(otherRing, qx, qy)) {
          // A point exactly on the neighbor's edge belongs to the overlap.
          // Ray casting alone classifies opposite edges differently.
          const boundary = nearestRingPosition(otherRing, qx, qy).pt
          if (dist(qx, qy, ...boundary) > 1e-6) outside = true
        }
        if (!outside || qArc < minArc) continue
        end = { pt: [qx, qy], exit: [-tx, -ty] }
        if (qArc >= maxArc - 1e-6) return end
      }
      arc += len
      // Past the flood guard, the first concave corner ends the weld. Before it
      // the contact itself sits in a valley, and stopping there welds nothing.
      if (end && arc >= reflexArc) {
        const fx = ring[(vi + dir + n) % n][0] - cx
        const fy = ring[(vi + dir + n) % n][1] - cy
        const fl = Math.hypot(fx, fy)
        if (fl > 1e-6 && (tx * (fy / fl) - ty * (fx / fl)) * convexSign < -0.04) return end
      }
    }
    px = cx
    py = cy
    vi = (vi + dir + n) % n
  }
  return end
}

/**
 * Weld knobs. Exported so the fuse matrix can label each run with the values
 * it tested — tuning these is a look-at-the-gallery job, not a numeric one.
 */
export const WELD_TUNING = {
  /** Outline arc a weld may claim, as a fraction of module size. */
  arcBase: 0.3,
  arcSoft: 0.25,
  /** Upper bound on the cubic handle, as a fraction of the attachment chord. */
  handle: 0.5,
  /** How far the waist is drawn toward the weld axis. */
  pinch: 0.75,
  /** Target waist, as a fraction of the narrower attachment height. */
  waistBase: 0.34,
  waistSoft: 0.18,
  /**
   * Waist fraction for attachments that are already thin relative to the
   * module (cross arms, star tips). Keep a visible hourglass so the join
   * does not read as a rectangle glued between the tips.
   */
  waistThin: 0.38,
}

/**
 * Weld two silhouettes the way a metaball joins two circles: attach along a
 * real arc of each outline and close the gap with tangent-continuous cubics.
 * The join is then a pinched waist grown out of both shapes rather than a
 * stadium bar dropped into the gap. Null when the geometry degenerates.
 */
export function organicWeld(
  a: SoftStamp,
  b: SoftStamp,
  softness: number,
  site?: ContactSite,
): Polygon[] {
  if (!site && usesArcFlatBlend(a,b)) return arcFlatBlend(a,b,softness)
  const ringA = a.rings[0]
  const ringB = b.rings[0]
  if (!ringA?.length || !ringB?.length) return []
  const contact = site ?? closestOutlinePoints(a, b)
  const posA = nearestRingPosition(ringA, contact.pa[0], contact.pa[1])
  const posB = nearestRingPosition(ringB, contact.pb[0], contact.pb[1])
  if (!site) {
    // Concave faces can have two equally close attachments on opposite sides
    // of the join axis. Use both real contacts instead of letting ring order
    // choose one arm of an X, star or chevron. Never average into empty space.
    const { nx, ny, mx, my } = neighborFrame(a, b)
    const mirror = ([x, y]: [number, number]): [number, number] => {
      const offset = (x - mx) * nx + (y - my) * ny
      return [x - 2 * offset * nx, y - 2 * offset * ny]
    }
    const reflectedA = mirror(posA.pt)
    const reflectedB = mirror(posB.pt)
    const onA = nearestRingPosition(ringA, ...reflectedA).pt
    const onB = nearestRingPosition(ringB, ...reflectedB).pt
    if (
      (dist(...posA.pt, ...reflectedA) > 1e-3 || dist(...posB.pt, ...reflectedB) > 1e-3) &&
      dist(...onA, ...reflectedA) < 1e-4 &&
      dist(...onB, ...reflectedB) < 1e-4
    ) {
      return [
        ...organicWeld(a, b, softness, { pa: posA.pt, pb: posB.pt, gap: contact.gap }),
        ...organicWeld(a, b, softness, { pa: onA, pb: onB, gap: contact.gap }),
      ]
    }
  }
  const pa = posA.pt
  const pb = posB.pt

  const arcFrac = WELD_TUNING.arcBase + WELD_TUNING.arcSoft * softness
  const arcPair = a.preset === 'arc' && b.preset === 'arc'
  const walk = (s: SoftStamp, o: SoftStamp, at: { seg: number; pt: [number, number] }) =>
    ([1, -1] as const).map((dir) =>
      walkToWeldEnd(s, o, at.seg, at.pt, dir, s.size * arcFrac,
        arcPair ? Math.max(0.6, s.arm * 0.25) : Math.max(1.5, s.size * 0.06)),
    )
  const [a0, a1] = walk(a, b, posA)
  const [b0, b1] = walk(b, a, posB)
  if (!a0 || !a1 || !b0 || !b1) return []

  // Pair the ends that do not cross the gap past each other.
  const span = (p: WeldEnd, q: WeldEnd) => dist(p.pt[0], p.pt[1], q.pt[0], q.pt[1])
  const flanks: [WeldEnd, WeldEnd][] =
    span(a0, b0) + span(a1, b1) <= span(a0, b1) + span(a1, b0)
      ? [
          [a0, b0],
          [a1, b1],
        ]
      : [
          [a0, b1],
          [a1, b0],
        ]

  // Axis through the attachment chords rather than the contact points: stamps
  // that touch at a tip (stars) have a contact axis tangent to both outlines,
  // so offsets measured from it are lopsided and the waist collapses.
  const midA = [(a0.pt[0] + a1.pt[0]) * 0.5, (a0.pt[1] + a1.pt[1]) * 0.5]
  const midB = [(b0.pt[0] + b1.pt[0]) * 0.5, (b0.pt[1] + b1.pt[1]) * 0.5]
  let ux = midB[0] - midA[0]
  let uy = midB[1] - midA[1]
  let ulen = Math.hypot(ux, uy)
  if (ulen < 0.75) {
    ux = b.cx - a.cx
    uy = b.cy - a.cy
    ulen = Math.hypot(ux, uy)
  }
  if (ulen < 1e-6) return []
  const nx = -uy / ulen
  const ny = ux / ulen
  const mx = (midA[0] + midB[0]) * 0.5
  const my = (midA[1] + midB[1]) * 0.5
  const offset = (p: [number, number]) => (p[0] - mx) * nx + (p[1] - my) * ny
  const contactOffset = offset([(pa[0] + pb[0]) * 0.5, (pa[1] + pb[1]) * 0.5])

  // Each flank has to own one side of the axis or there is no closed weld.
  const sign0 = Math.sign(offset(flanks[0][0].pt))
  const sign1 = Math.sign(offset(flanks[1][0].pt))
  if (sign0 === 0 || sign1 === 0 || sign0 === sign1) return []

  // The weld never gets thinner than this, whatever the silhouettes do — a
  // waist pinched to nothing unions as two outlines instead of one glyph.
  const meanSize = (a.size + b.size) * 0.5
  const waistFloor = Math.max(1.1, meanSize * 0.03)
  const waistFrac = WELD_TUNING.waistBase + WELD_TUNING.waistSoft * softness
  const flank = (p: WeldEnd, q: WeldEnd, sign: number) => {
    const op = offset(p.pt) * sign
    const oq = offset(q.pt) * sign
    const chord = dist(p.pt[0], p.pt[1], q.pt[0], q.pt[1])
    if (arcPair) {
      // Approved arc preview: retain the outline tangents and join two
      // cubics at a shared waist tangent, without clamping sampled points.
      const height = Math.max(0.4, Math.min(op, oq))
      const waist = Math.min(height, Math.max(0.45, height * (0.24 + softness * 0.35)))
      const mid: [number, number] = [mx + nx * sign * waist, my + ny * sign * waist]
      const dx = q.pt[0] - p.pt[0]
      const dy = q.pt[1] - p.pt[1]
      const len = Math.hypot(dx, dy) || 1
      const tx = dx / len
      const ty = dy / len
      const h = Math.min(chord * 0.27, height * 0.85)
      const mh = chord * 0.16
      const left = sampleCubic(p.pt,
        [p.pt[0] + p.exit[0] * h, p.pt[1] + p.exit[1] * h],
        [mid[0] - tx * mh, mid[1] - ty * mh], mid, 20)
      const right = sampleCubic(mid,
        [mid[0] + tx * mh, mid[1] + ty * mh],
        [q.pt[0] + q.exit[0] * h, q.pt[1] + q.exit[1] * h], q.pt, 20)
      return [...left, ...right.slice(1)]
    }
    const full = chord * WELD_TUNING.handle
    const height = Math.min(op, oq)
    // The weld has to stay outside the contact on its own side. Bowing past it
    // leaves the notch between the two stamps outside the weld, which unions
    // as a small enclosed pocket (triangle bases, X crotches).
    // Bounded so it never exceeds height and flattens the curve into a straight bar.
    const seal = contactOffset * sign > 0 && contactOffset * sign < height
      ? contactOffset * sign + 0.4
      : 0
    // A weld may not bow further out than the outline it grew from, or it
    // arcs over the stamps instead of joining them.
    const peakCap = Math.max(op, oq, seal) + 0.75
    const handle = (e: WeldEnd, o: number, h: number): [number, number] => {
      // Tangents pointing outward from the join axis must not balloon outward,
      // which would otherwise cause peakCap to slice the curve flat.
      const outward = (e.exit[0] * nx + e.exit[1] * ny) * sign
      const dirX = e.exit[0] - nx * sign * Math.max(0, outward)
      const dirY = e.exit[1] - ny * sign * Math.max(0, outward)
      const pull = Math.max(0, o - waistFloor) * WELD_TUNING.pinch * (h / Math.max(full, 1e-6))
      return [
        e.pt[0] + dirX * h - nx * sign * pull,
        e.pt[1] + dirY * h - ny * sign * pull,
      ]
    }
    const curve = (h: number) => sampleCubic(p.pt, handle(p, op, h), handle(q, oq, h), q.pt, 18)
    const waistOf = (pts: [number, number][]) => {
      let worst = Infinity
      for (const pt of pts) {
        const o = offset(pt) * sign
        if (o < worst) worst = o
      }
      return worst
    }
    // How far a tangent dips depends on the silhouette it left, so solve for
    // the longest handle that still leaves the target waist. A fixed fraction
    // of the chord drives 45-degree tangents (diamond, star) straight through
    // the axis and the weld flattens into a thread.
    const thin = Math.max(0, Math.min(1, (0.35 - height / meanSize) / 0.28))
    const target = Math.max(
      waistFloor,
      seal,
      height * (waistFrac + (WELD_TUNING.waistThin - waistFrac) * thin),
    )
    let lo = 0
    let hi = full
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) * 0.5
      if (waistOf(curve(mid)) >= target) lo = mid
      else hi = mid
    }
    return curve(lo).map(([x, y]): [number, number] => {
      const o = ((x - mx) * nx + (y - my) * ny) * sign
      const capped = Math.min(Math.max(o, waistFloor), peakCap)
      if (capped === o) return [x, y]
      const push = (capped - o) * sign
      return [x + nx * push, y + ny * push]
    })
  }

  // Closed by the chords back through each stamp, which the stamp's own
  // polygon covers in the union.
  const flank0 = flank(flanks[0][0], flanks[0][1], sign0)
  const flank1 = flank(flanks[1][1], flanks[1][0], sign1)
  if (polylinesCross(flank0, flank1)) return []
  const ring = [...flank0, ...flank1]
  const poly = toPolygon([simplifyRing(ring)])
  if (!poly) return []
  const holes = [holePolygon(a), holePolygon(b)].filter((p): p is Polygon => !!p)
  return holes.length ? differencePolygons([poly], holes) : [poly]
}

function segmentsIntersect(
  a: [number, number],
  b: [number, number],
  c: [number, number],
  d: [number, number],
): boolean {
  const abx = b[0] - a[0]
  const aby = b[1] - a[1]
  const cdx = d[0] - c[0]
  const cdy = d[1] - c[1]
  const den = abx * cdy - aby * cdx
  if (Math.abs(den) < 1e-9) return false
  const acx = c[0] - a[0]
  const acy = c[1] - a[1]
  const t = (acx * cdy - acy * cdx) / den
  const u = (acx * aby - acy * abx) / den
  return t > 0.02 && t < 0.98 && u > 0.02 && u < 0.98
}

function polylinesCross(a: [number, number][], b: [number, number][]): boolean {
  for (let i = 0; i < a.length - 1; i++) {
    for (let j = 0; j < b.length - 1; j++) {
      if (segmentsIntersect(a[i], a[i + 1], b[j], b[j + 1])) return true
    }
  }
  return false
}

function pairRoundness(a: SoftStamp, b: SoftStamp) {
  return Math.max(a.roundness, b.roundness)
}

type AxisId = 'h' | 'v' | 'd'

function pairAxis(a: SoftStamp, b: SoftStamp): AxisId {
  if (a.col !== b.col && a.row !== b.row) return 'd'
  return a.row === b.row ? 'h' : 'v'
}

function axisMelt(h: number, v: number, d: number, axis: AxisId) {
  return axis === 'h' ? h : axis === 'v' ? v : d
}

/**
 * Metaball using each stamp's inscribed radius.
 * Vertex-facing blobMetaball uses radiusToward (half-diagonal) and grows
 * star spikes; inscribed circles stay inside the silhouette and melt in the gap.
 */
function inRadius(stamp: SoftStamp): number {
  let best = Infinity
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI) / 8
    const r = radiusToward(stamp, stamp.cx + Math.cos(a), stamp.cy + Math.sin(a))
    if (r < best) best = r
  }
  if (!Number.isFinite(best) || best < 1) return stamp.arm
  return best
}

function inscribedMetaball(
  a: SoftStamp,
  b: SoftStamp,
  softness: number,
  melt: number,
): Polygon[] {
  const pad = 1 + Math.max(a.roundness, b.roundness) * 0.08
  return pairMetaball(a, b, softness, true, inRadius(a) * pad, inRadius(b) * pad, melt, 1.45)
}

function faceMetaball(
  a: SoftStamp,
  b: SoftStamp,
  softness: number,
  axis: AxisId,
  melt: number,
): Polygon[] {
  if (stampsAreaOverlap(a, b)) return []
  if (pairRoundness(a, b) < 0.4) return []
  return blobMetaball(a, b, softness, axis === 'd', melt)
}

/** Flats face H/V; vertices face diagonally (square, octagon). */
function squareJoin(a: SoftStamp, b: SoftStamp, softness: number, axis: AxisId) {
  const melt = axisMelt(1, 1, 1.35, axis)
  if (axis === 'd') return inscribedMetaball(a, b, softness, melt)
  return faceMetaball(a, b, softness, axis, melt)
}

function octagonJoin(a: SoftStamp, b: SoftStamp, softness: number, axis: AxisId) {
  const melt = axisMelt(1, 1, 1.1, axis)
  if (axis === 'd') return inscribedMetaball(a, b, softness, melt)
  return faceMetaball(a, b, softness, axis, melt)
}

/** Vertices face H/V; flats face diagonally (diamond). */
function diamondJoin(a: SoftStamp, b: SoftStamp, softness: number, axis: AxisId) {
  const melt = axisMelt(1.15, 1.15, 1, axis)
  if (axis !== 'd') return inscribedMetaball(a, b, softness, melt)
  return faceMetaball(a, b, softness, axis, melt)
}

function rectJoin(
  a: SoftStamp,
  b: SoftStamp,
  softness: number,
  axis: AxisId,
  gap: number,
  meanSize: number,
): Polygon[] {
  if (axis === 'd') return inscribedMetaball(a, b, softness, 0.9)
  if (stampsAreaOverlap(a, b)) return []
  if (pairRoundness(a, b) >= 0.4) {
    return blobMetaball(a, b, softness, false, axisMelt(1, 0.88, 1, axis))
  }
  if (gap <= meetGap(meanSize)) {
    const slab = facingGapSlab(a, b)
    return slab ? [slab] : []
  }
  return []
}

function circleJoin(a: SoftStamp, b: SoftStamp, softness: number, axis: AxisId) {
  return circularMetaball(a, b, softness, axis === 'd', axisMelt(1, 1, 1.05, axis))
}

function ringJoin(a: SoftStamp, b: SoftStamp, softness: number, axis: AxisId) {
  return circularMetaball(a, b, softness, axis === 'd', axisMelt(1, 1, 1.05, axis))
}

function capsuleAlongJoin(
  a: SoftStamp,
  b: SoftStamp,
  softness: number,
  melt: number,
  safe: boolean,
): Polygon[] {
  if (safe) return contactNeck(a, b, softness, false)
  const r = Math.max(a.arm, b.arm) * 1.04
  const blob = pairMetaball(a, b, softness, false, r, r, melt, 1.05)
  if (blob.length) return blob
  const weld = organicWeld(a, b, softness)
  return weld.length ? weld : contactNeck(a, b, softness, false)
}

function capsuleFlankJoin(
  a: SoftStamp,
  b: SoftStamp,
  softness: number,
  melt: number,
  safe: boolean,
): Polygon[] {
  if (stampsAreaOverlap(a, b)) return []
  if (safe) return contactNeck(a, b, softness, false)
  const weld = organicWeld(a, b, softness)
  if (weld.length) return weld
  const r = Math.max(a.arm, b.arm) * 1.08
  return pairMetaball(a, b, softness, false, r, r, melt, 1.12)
}

function capsuleDiagJoin(
  a: SoftStamp,
  b: SoftStamp,
  softness: number,
  melt: number,
  safe: boolean,
): Polygon[] {
  if (stampsAreaOverlap(a, b)) return []
  if (safe) return contactNeck(a, b, softness, true)
  const weld = organicWeld(a, b, Math.min(1, softness * melt))
  if (weld.length) return weld
  const r = Math.max(a.arm, b.arm) * 1.06
  return pairMetaball(a, b, softness, true, r, r, melt, 1.2)
}

/** Horizontal stadium: caps face H, long sides face V. */
function hCapsuleJoin(
  a: SoftStamp,
  b: SoftStamp,
  softness: number,
  axis: AxisId,
  safe: boolean,
): Polygon[] {
  const melt = axisMelt(1.1, 1, 0.88, axis)
  if (axis === 'h') return capsuleAlongJoin(a, b, softness, melt, safe)
  if (axis === 'v') return capsuleFlankJoin(a, b, softness, melt, safe)
  return capsuleDiagJoin(a, b, softness, melt, safe)
}

/** Vertical stadium: caps face V, long sides face H. */
function vCapsuleJoin(
  a: SoftStamp,
  b: SoftStamp,
  softness: number,
  axis: AxisId,
  safe: boolean,
): Polygon[] {
  const melt = axisMelt(1, 1.1, 0.88, axis)
  if (axis === 'v') return capsuleAlongJoin(a, b, softness, melt, safe)
  if (axis === 'h') return capsuleFlankJoin(a, b, softness, melt, safe)
  return capsuleDiagJoin(a, b, softness, melt, safe)
}

function hexagonJoin(a: SoftStamp, b: SoftStamp, softness: number, axis: AxisId) {
  const melt = axisMelt(1, 0.96, 1.12, axis)
  if (axis === 'd') return inscribedMetaball(a, b, softness, melt)
  return faceMetaball(a, b, softness, axis, melt)
}

function pentagonJoin(a: SoftStamp, b: SoftStamp, softness: number, axis: AxisId) {
  const melt = axisMelt(0.95, 0.92, 1.16, axis)
  if (axis === 'd') return inscribedMetaball(a, b, softness, melt)
  return faceMetaball(a, b, softness, axis, melt)
}

/** Sharp / concave: boolean union only — no glued-on bar or tip pimple. */
function silhouetteOnlyJoin(a: SoftStamp, b: SoftStamp): Polygon[] {
  void a
  void b
  return []
}

function triangleJoin(a: SoftStamp, b: SoftStamp) {
  return silhouetteOnlyJoin(a, b)
}

function star5Join(a: SoftStamp, b: SoftStamp) {
  return silhouetteOnlyJoin(a, b)
}

function star4Join(a: SoftStamp, b: SoftStamp) {
  return silhouetteOnlyJoin(a, b)
}

function crossJoin(a: SoftStamp, b: SoftStamp, softness: number, axis: AxisId): Polygon[] {
  // Overlapping pluses already union into a lattice — extra necks bead the crotches.
  if (stampsAreaOverlap(a, b)) return []
  const meanSize = (a.size + b.size) * 0.5
  const { gap } = closestOutlinePoints(a, b)
  if (axis === 'd') {
    // Kitty-corner pluses are far apart; an inscribed metaball draws a snake.
    if (pairRoundness(a, b) < 0.4) return []
    if (gap > meetGap(meanSize) * 1.35) return []
    return organicWeld(a, b, softness)
  }
  if (pairRoundness(a, b) < 0.4) return []
  const weld = organicWeld(a, b, softness)
  if (weld.length) return weld
  const r = Math.max(a.arm, b.arm) * 1.12
  return pairMetaball(a, b, softness, false, r, r, axisMelt(1.28, 1.28, 1, axis), 1.2)
}

function chevronJoin(a: SoftStamp, b: SoftStamp) {
  return silhouetteOnlyJoin(a, b)
}

function xJoin(
  a: SoftStamp,
  b: SoftStamp,
  _softness: number,
  axis: AxisId,
  gap: number,
  meanSize: number,
): Polygon[] {
  if (stampsAreaOverlap(a, b)) return []
  if (gap > meetGap(meanSize) * 1.5) return []
  const out: Polygon[] = []
  for (const site of contactSites(a, b)) {
    if (site.gap > meetGap(meanSize) * 1.5) continue
    out.push(...contactNeck(a, b, 0.12, axis === 'd', site))
  }
  return out
}

function presetWeld(
  preset: PresetShapeId,
  a: SoftStamp,
  b: SoftStamp,
  softness: number,
  axis: AxisId,
): Polygon[] {
  // Cross: on diagonal, take outer contour if dual struts trap a hole
  if (preset === 'cross') {
    if (axis === 'd') {
      const weld = organicWeld(a, b, softness)
      if (weld.length && weld[0].length > 1) {
        return [weld[0].slice(0, 1)]
      }
      return weld
    }
    return organicWeld(a, b, softness)
  }

  // X: on horizontal/vertical, take outer contour if dual struts trap a slit
  if (preset === 'x') {
    const weld = organicWeld(a, b, softness)
    if (weld.length && weld[0].length > 1) {
      return [weld[0].slice(0, 1)]
    }
    return weld
  }

  // Chevron, Square, Rect, Capsule, CapsuleV, Diamond, Star 5, Pentagon:
  return organicWeld(a, b, softness)
}

function legacyJoinPreset(
  preset: PresetShapeId,
  a: SoftStamp,
  b: SoftStamp,
  softness: number,
  axis: AxisId,
  gap: number,
  meanSize: number,
  safe: boolean,
): Polygon[] {
  switch (preset) {
    case 'square':
      return squareJoin(a, b, softness, axis)
    case 'octagon':
      return octagonJoin(a, b, softness, axis)
    case 'diamond':
      return diamondJoin(a, b, softness, axis)
    case 'rect':
      return rectJoin(a, b, softness, axis, gap, meanSize)
    case 'capsule':
      return hCapsuleJoin(a, b, softness, axis, safe)
    case 'capsuleV':
      return vCapsuleJoin(a, b, softness, axis, safe)
    case 'hexagon':
      return hexagonJoin(a, b, softness, axis)
    case 'pentagon':
      return pentagonJoin(a, b, softness, axis)
    case 'triangle':
      return triangleJoin(a, b)
    case 'star5':
      return star5Join(a, b)
    case 'star4':
      return star4Join(a, b)
    case 'cross':
      return crossJoin(a, b, softness, axis)
    case 'chevron':
      return chevronJoin(a, b)
    case 'x':
      return xJoin(a, b, softness, axis, gap, meanSize)
    default:
      return []
  }
}

function joinSamePreset(
  preset: PresetShapeId,
  a: SoftStamp,
  b: SoftStamp,
  softness: number,
  gap: number,
  meanSize: number,
  safe: boolean,
): Polygon[] {
  const axis = pairAxis(a, b)

  // Circle and Ring welding: NEVER modified, always uses dedicated metaball / ring weld
  if (preset === 'circle') return circleJoin(a, b, softness, axis)
  if (preset === 'ring') return ringJoin(a, b, softness, axis)

  const engineMode = getJoinEngineMode()

  // FORK 1: Pure Weld (Previous Method B version across all shapes)
  if (engineMode === 'fork-weld') {
    return organicWeld(a, b, softness)
  }

  // FORK 2: Legacy Workshop (Method A)
  if (engineMode === 'fork-current') {
    return legacyJoinPreset(preset, a, b, softness, axis, gap, meanSize, safe)
  }

  // MAIN ENGINE (Default): Optimal per-shape joins (user's preferred methods)
  const method = getActiveJoinMethod(preset, axis)
  if (method === 'weld') {
    return presetWeld(preset, a, b, softness, axis)
  }
  if (method === 'metaball') {
    const melt = axisMelt(1, 1, 1.1, axis)
    return inscribedMetaball(a, b, softness, melt)
  }
  if (method === 'offset') {
    const melt = axisMelt(1.1, 1.1, 1.1, axis)
    return faceMetaball(a, b, softness, axis, melt)
  }

  return legacyJoinPreset(preset, a, b, softness, axis, gap, meanSize, safe)
}

/** SDF / offset melt of two stamps as polygons (preview lab methods). */
function mixedFieldBlend(a: SoftStamp, b: SoftStamp, softness: number, method: 'sdf' | 'offset'): Polygon[] {
  try {
    const size = Math.min(a.size, b.size)
    const rings = fieldBlendRings([a.rings, b.rings], size, softness, method)
    if (!rings.length) return []
    const poly = toPolygon(rings)
    return poly ? [poly] : []
  } catch {
    return []
  }
}

/** Legacy mixed-pair path (pre-lab “Current”). */
function blendMixedPairLegacy(
  a: SoftStamp,
  b: SoftStamp,
  softness: number,
  diagonal: boolean,
  safe: boolean,
  gap: number,
  meanSize: number,
): Polygon[] {
  const bar = isElongatedBar(a) && isElongatedBar(b)
  if (bar && stampsAreaOverlap(a, b)) return []

  let out: Polygon[] = []
  const bothBlob = stampBlobs(a) && stampBlobs(b)
  if (a.circular && b.circular) {
    out = circularMetaball(a, b, softness, diagonal)
  } else if (bothBlob && !a.capsuleBody && !b.capsuleBody) {
    out = blobMetaball(a, b, softness, diagonal)
  } else if (bothBlob) {
    const piece = safe ? [] : organicWeld(a, b, softness)
    out = piece.length ? piece : contactNeck(a, b, softness, diagonal)
  } else if (gap <= meetGap(meanSize)) {
    if (bar) {
      const slab = facingGapSlab(a, b)
      if (slab) out.push(slab)
    } else {
      const sites = contactSites(a, b)
      for (const site of sites) {
        if (site.gap > meetGap(meanSize) * 1.5) continue
        out.push(...contactNeck(a, b, 0.12, diagonal, site))
      }
    }
  }
  const holes = [holePolygon(a), holePolygon(b)].filter((p): p is Polygon => !!p)
  if (holes.length && out.length) {
    out = differencePolygons(out, holes)
  }
  return out
}

function blendMixedPairMethod(
  method: MixedPairMethod,
  a: SoftStamp,
  b: SoftStamp,
  softness: number,
  diagonal: boolean,
  safe: boolean,
  gap: number,
  meanSize: number,
): Polygon[] {
  // No melt neck — overlapping stamps still share a component and boolean-union.
  if (method === 'none') return []
  if (method === 'weld') {
    if (safe) return contactNeck(a, b, softness, diagonal)
    const piece = organicWeld(a, b, softness)
    return piece.length ? piece : contactNeck(a, b, softness, diagonal)
  }
  if (method === 'sdf' || method === 'offset') {
    const melted = mixedFieldBlend(a, b, softness, method)
    if (melted.length) return melted
    // Fall back to weld if the field sampler fails on a weird outline.
    return blendMixedPairMethod('weld', a, b, softness, diagonal, safe, gap, meanSize)
  }
  if (method === 'metaball') {
    return blobMetaball(a, b, softness, diagonal)
  }
  return blendMixedPairLegacy(a, b, softness, diagonal, safe, gap, meanSize)
}

function blendPairPolygons(
  a: SoftStamp,
  b: SoftStamp,
  softness: number,
  diagonal: boolean,
  /** Skip the organic weld and use the plain stadium neck. */
  safe = false,
): Polygon[] {
  const meanSize = (a.size + b.size) * 0.5
  const { gap } = closestOutlinePoints(a, b)
  const maxGap = fuseMaxGap(meanSize, softness, diagonal)
  if (gap > maxGap) return []
  // Melt-off shapes: no neck — bodies still union when the pair is connected.
  if (isPresetMeltOff(a.preset) || isPresetMeltOff(b.preset)) return []
  if (usesArcFlatBlend(a,b) && getJoinEngineMode() !== 'fork-current') return arcFlatBlend(a,b,softness)
  if (!pairCanFuse(a, b, softness, diagonal)) return []

  if (a.preset && a.preset === b.preset) {
    return joinSamePreset(a.preset, a, b, softness, gap, meanSize, safe)
  }

  const picked = getJoinEngineMode() === 'fork-current'
    ? null
    : getMixedPairJoinMethod(a.preset, b.preset)
  if (picked) {
    return blendMixedPairMethod(picked, a, b, softness, diagonal, safe, gap, meanSize)
  }
  if (getJoinEngineMode() === 'fork-weld') {
    return blendMixedPairMethod('weld', a, b, softness, diagonal, safe, gap, meanSize)
  }

  return blendMixedPairLegacy(a, b, softness, diagonal, safe, gap, meanSize)
}

function stampPolygon(stamp: SoftStamp): Polygon | null {
  return toPolygon(stamp.rings)
}

function stampsAreaOverlap(a: SoftStamp, b: SoftStamp): boolean {
  const pa = stampPolygon(a)
  const pb = stampPolygon(b)
  if (!pa || !pb) return false
  return polygonsOverlap(pa, pb, 1.5)
}

function stampBounds(s: SoftStamp) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of s.rings[0] ?? []) {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }
  return { minX, minY, maxX, maxY }
}

/** Thin quad covering a hairline gap between two elongated stamps' facing sides. */
function facingGapSlab(a: SoftStamp, b: SoftStamp): Polygon | null {
  const A = stampBounds(a)
  const B = stampBounds(b)
  const pad = 1.2
  if (a.row === b.row) {
    const x0 = Math.min(A.maxX, B.maxX) - pad
    const x1 = Math.max(A.minX, B.minX) + pad
    const y0 = Math.max(A.minY, B.minY)
    const y1 = Math.min(A.maxY, B.maxY)
    if (x1 - x0 < 0.4 || y1 - y0 < 2) return null
    return toPolygon([
      [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
      ],
    ])
  }
  const y0 = Math.min(A.maxY, B.maxY) - pad
  const y1 = Math.max(A.minY, B.minY) + pad
  const x0 = Math.max(A.minX, B.minX)
  const x1 = Math.min(A.maxX, B.maxX)
  if (y1 - y0 < 0.4 || x1 - x0 < 2) return null
  return toPolygon([
    [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ],
  ])
}

function collectNeighborPairs(
  stamps: SoftStamp[],
  softness: number,
  brokenJoins?: BrokenJoins,
): { a: SoftStamp; b: SoftStamp; diagonal: boolean; strength: number }[] {
  const byCell = new Map<string, SoftStamp>()
  for (const s of stamps) byCell.set(`${s.col}:${s.row}`, s)
  const pairs: { a: SoftStamp; b: SoftStamp; diagonal: boolean; strength: number }[] = []
  const seen = new Set<string>()

  const add = (a: SoftStamp, b: SoftStamp, diagonal: boolean) => {
    const edge = softEdgeKey(a.col, a.row, b.col, b.row)
    if (seen.has(edge) || brokenJoins?.has(edge)) return
    seen.add(edge)
    const blend = blendStrength(a, b, softness, diagonal)
    if (!blend) return
    pairs.push({ a, b, diagonal, strength: blend.strength })
  }

  for (const s of byCell.values()) {
    const { col, row } = s
    const right = byCell.get(`${col + 1}:${row}`)
    const down = byCell.get(`${col}:${row + 1}`)
    if (right) add(s, right, false)
    if (down) add(s, down, false)
    const se = byCell.get(`${col + 1}:${row + 1}`)
    const ne = byCell.get(`${col + 1}:${row - 1}`)
    const up = byCell.get(`${col}:${row - 1}`)
    // Isolated kitty-corner only — skip when the 2×2 already has an ortho
    // neighbor, so L-clusters and enclosed holes stay open.
    if (se && !right && !down) add(s, se, true)
    if (ne && !right && !up) add(s, ne, true)
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

/** Add arc welds to a protected body union; malformed bridges cannot erase ink. */
function unionArcWelds(bodies: Polygon[], bridges: Polygon[]): Polygon[] {
  const scale = 1000
  const snap = (poly: Polygon): Polygon => poly.map(ring => ring.map(([x, y]) =>
    [Math.round(x * scale), Math.round(y * scale)],
  ))
  const area = (polys: Polygon[]) => polys.reduce((total, poly) =>
    total + ringAbsArea(poly[0]) - poly.slice(1).reduce((sum, ring) => sum + ringAbsArea(ring), 0), 0)
  const holes = bodies.flatMap(poly => poly.slice(1).map(ring => snap([ring])))
  try {
    // Normalize each body using its SVG even-odd fill before combining it.
    const normalizedBodies = bodies.flatMap(poly => {
      const rings = snap(poly).map(ring => [ring])
      return polygonClipping.xor(rings[0], ...rings.slice(1))
    })
    if (!normalizedBodies.length) return []
    const raw = polygonClipping.union(normalizedBodies[0], ...normalizedBodies.slice(1))
    const base = holes.length ? polygonClipping.difference(raw, ...holes) : raw
    let result = base
    for (const bridge of bridges) {
      try {
        // Resolve a bridge's self intersections independently of the stamps.
        const normalized = polygonClipping.union(snap(bridge))
        const attached = normalized.filter(poly => area(polygonClipping.intersection([poly], result)) > 1)
        if (!attached.length) continue
        let next = polygonClipping.union(result, ...attached)
        if (holes.length) next = polygonClipping.difference(next, ...holes)
        // One unit on this grid is 0.000001 square pixels.
        if (area(polygonClipping.difference(base, next)) > 1) continue
        result = next
      } catch {
        // A rejected bridge leaves the complete stamp bodies in place.
      }
    }
    return result.map(poly => poly.map(ring => ring.map(([x, y]) => [x / scale, y / scale])))
  } catch {
    const originalHoles = bodies.flatMap(poly => poly.slice(1).map(ring => [ring]))
    const originalBodies = unionPolygons(bodies)
    return originalHoles.length ? differencePolygons(originalBodies, originalHoles) : originalBodies
  }
}

function fuseComponentPolygons(
  members: SoftStamp[],
  pairs: { a: SoftStamp; b: SoftStamp; strength: number; diagonal?: boolean }[],
  softness: number,
): Polygon[] {
  if (!members.length) return []
  if (members.length === 1) {
    const poly = stampPolygon(members[0])
    return poly ? [poly] : []
  }

  const ids = new Set(members.map((m) => m.id))
  if (members.some(stamp => stamp.preset === 'arc')) {
    // Incremental clipping must not depend on the order stamps were painted.
    const ordered = [...members].sort((a, b) => a.row - b.row || a.col - b.col)
    const bodies = ordered.map(stampPolygon).filter((poly): poly is Polygon => !!poly)
    const bridges = pairs.filter(pair => ids.has(pair.a.id) && ids.has(pair.b.id))
      .sort((a, b) => a.a.row - b.a.row || a.a.col - b.a.col || a.b.row - b.b.row || a.b.col - b.b.col)
      .flatMap(pair => blendPairPolygons(pair.a, pair.b, softness, pair.diagonal ?? false))
    return unionArcWelds(bodies, bridges)
  }
  // Slivers left between welded arms (X crotches, chevron notches) scale with
  // the module, so the threshold has to as well. A deliberately enclosed empty
  // cell is far larger than this and still keeps its hole.
  const meanSize = members.reduce((n, m) => n + m.size, 0) / members.length
  const minHoleArea = Math.max(12, meanSize * meanSize * 0.02)
  const build = (safe: boolean): Polygon[] => {
    const polygons: Polygon[] = []
    for (const pair of pairs) {
      if (!ids.has(pair.a.id) || !ids.has(pair.b.id)) continue
      polygons.push(...blendPairPolygons(pair.a, pair.b, softness, pair.diagonal ?? false, safe))
    }
    for (const s of members) {
      const poly = stampPolygon(s)
      if (poly) polygons.push(poly)
    }
    if (!polygons.length) return []
    return unionPolygons(polygons)
      .map((poly) => {
        if (poly.length < 2) return poly
        return [poly[0], ...poly.slice(1).filter((h) => ringAbsArea(h) >= minHoleArea)]
      })
      .filter((p) => p.length)
  }

  // Every member is in one connected component, so anything but a single
  // outline means the boolean union mis-handled a weld contour. Prefer a
  // stadium neck, then the stamps alone (already-overlapping 56px modules
  // split when a self-crossing weld is unioned in).
  const fused = build(false)
  let result: Polygon[]
  if (fused.length <= 1) {
    result = fused
  } else {
    const safe = build(true)
    if (safe.length <= 1) {
      result = safe
    } else {
      const stampsOnly: Polygon[] = []
      for (const s of members) {
        const poly = stampPolygon(s)
        if (poly) stampsOnly.push(poly)
      }
      const raw = unionPolygons(stampsOnly)
        .map((poly) => {
          if (poly.length < 2) return poly
          return [poly[0], ...poly.slice(1).filter((h) => ringAbsArea(h) >= minHoleArea)]
        })
        .filter((p) => p.length)
      if (raw.length <= 1) result = raw
      else result = safe.length <= fused.length ? safe : fused
    }
  }
  const holes = members
    .flatMap((s) => s.rings.slice(1).map((ring) => toPolygon([ring])))
    .filter((p): p is Polygon => !!p)
  return holes.length ? differencePolygons(result, holes) : result
}

export interface SoftnessFinishOptions {
  softness: number
  /** Disabled Softness joins (softEdgeKey). */
  brokenJoins?: BrokenJoins
  holeMode?: 'open' | 'no-gaps' | 'solid'
  maxGapArea?: number
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

/**
 * Fused silhouette paths. Softness 0 → empty (caller draws crisp stamps).
 * Higher Softness melts close outlines into each other.
 */
export function softnessFinishPathList(
  stamps: SoftStamp[],
  softnessOrOpts: number | SoftnessFinishOptions,
): string[] {
  const polys = softnessFinishPolygons(stamps, softnessOrOpts)
  return multiPolygonToPathList(polys)
}

/**
 * The canvas, the autosave preview, the word tester and the export all ask for
 * the same fuse after every stroke. Results are remembered by everything that
 * can change them, so the geometry is computed once and shared. Callers treat
 * the returned polygons as read-only.
 */
const finishCache = new Map<string, Polygon[]>()
const FINISH_CACHE_MAX = 32

function finishCacheKey(
  stamps: SoftStamp[],
  softness: number,
  brokenJoins: BrokenJoins | undefined,
  holeMode: string,
  maxGapArea: number,
): string {
  let prefs = ''
  let meltOff = ''
  try {
    if (typeof window !== 'undefined') {
      prefs = window.localStorage.getItem(SHAPE_JOIN_STORAGE_KEY) ?? ''
      meltOff = window.localStorage.getItem(MELT_OFF_STORAGE_KEY) ?? ''
    }
  } catch {
    prefs = ''
    meltOff = ''
  }
  const parts: string[] = [String(softness), holeMode, String(maxGapArea), getJoinEngineMode(), prefs, meltOff]
  parts.push(brokenJoins?.size ? [...brokenJoins].sort().join(',') : '')
  for (const s of stamps) {
    // Outline checksum: any change of shape, size, rounding or rotation moves it.
    let sum = 0
    let count = 0
    for (const ring of s.rings) {
      for (const [x, y] of ring) {
        sum += x * 13 + y * 7
        count++
      }
    }
    parts.push(`${s.id}|${s.col}|${s.row}|${s.cx}|${s.cy}|${s.size}|${s.rotation ?? 0}|${s.preset ?? s.family}|${s.roundness}|${count}|${sum}`)
  }
  return parts.join(';')
}

export function softnessFinishPolygons(
  stamps: SoftStamp[],
  softnessOrOpts: number | SoftnessFinishOptions,
): Polygon[] {
  const opts: SoftnessFinishOptions =
    typeof softnessOrOpts === 'number'
      ? { softness: softnessOrOpts }
      : softnessOrOpts
  const { softness, brokenJoins, holeMode = 'open', maxGapArea = 600 } = opts
  if (softness <= 0.02 || stamps.length === 0) return []

  const key = finishCacheKey(stamps, softness, brokenJoins, holeMode, maxGapArea)
  const cached = finishCache.get(key)
  if (cached) {
    // Refresh recency.
    finishCache.delete(key)
    finishCache.set(key, cached)
    return cached
  }

  const pairs = collectNeighborPairs(stamps, softness, brokenJoins)
  const components = connectedComponents(stamps, pairs)
  const polys: Polygon[] = []
  for (const members of components) {
    polys.push(...fuseComponentPolygons(members, pairs, softness))
  }
  const ringHoles = intentionalHoleCutters(stamps.map((s) => s.rings))
  const result =
    holeMode !== 'open'
      ? filterPolygonHolesPreserving(polys, holeMode, maxGapArea, ringHoles)
      : polys
  if (finishCache.size >= FINISH_CACHE_MAX) finishCache.delete(finishCache.keys().next().value!)
  finishCache.set(key, result)
  return result
}

/** Whether the fused evenodd silhouette would paint this canvas point. */
export function softnessFinishContains(
  stamps: SoftStamp[],
  softness: number,
  x: number,
  y: number,
  brokenJoins?: BrokenJoins,
): boolean {
  if (softness <= 0.02 || stamps.length === 0) return false
  const pairs = collectNeighborPairs(stamps, softness, brokenJoins)
  const components = connectedComponents(stamps, pairs)
  for (const members of components) {
    if (multiPolygonFills(fuseComponentPolygons(members, pairs, softness), x, y)) return true
  }
  return false
}

/** Midpoints of neighbor pairs for join-break UI (only pairs in fuse range). */
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
    const up = byCell.get(`${col}:${row - 1}`)
    // Isolated kitty-corner only — skip when the 2×2 already has an ortho
    // neighbor, so L-clusters and enclosed holes stay open.
    if (se && !right && !down) add(s, se, true)
    if (ne && !right && !up) add(s, ne, true)
  }

  return hints
}

export function softnessHint(softness: number): string {
  if (softness < 0.08) return 'Crisp'
  if (softness < 0.35) return 'Near melt'
  if (softness < 0.65) return 'Rounded melt'
  if (softness < 0.85) return 'Heavy melt'
  return 'Max melt'
}
