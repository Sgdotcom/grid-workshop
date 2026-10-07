/** Archived 2026-09-17 — per-shape metaball Softness joins (replaced by whole-glyph SVG blur). */
/**
 * Post-glyph Softness — contact-aware metaball necks between neighbors.
 *
 * Softness 0 = crisp modules. Higher = stronger necks at outline contact zones.
 * No covering discs. Mixed shapes join at facing outline samples.
 * Soft mask (per cell) scales local melt; Overall Softness scales everything.
 */

import type { ShapeDef } from '@/lib/types'
import { shapeContactSamples, shapeIsCircular } from '@/lib/shapes'

export interface SoftStamp {
  id: string
  cx: number
  cy: number
  /** Half-size scale for neck thickness. */
  r: number
  size: number
  col: number
  row: number
  circular?: boolean
  /** Outline samples in canvas space for contact pairing. */
  contacts: [number, number][]
}

/** Per-cell melt weight 0–1. Missing key = full melt (1) when mask empty; 0 when selective. */
export type SoftMask = Map<string, number>

export function softCellKey(col: number, row: number) {
  return `${col}:${row}`
}

export function softMaskWeight(mask: SoftMask | undefined, col: number, row: number): number {
  if (!mask || mask.size === 0) return 1
  const v = mask.get(softCellKey(col, row))
  return v === undefined ? 0 : Math.max(0, Math.min(1, v))
}

function dist(x1: number, y1: number, x2: number, y2: number) {
  return Math.hypot(x2 - x1, y2 - y1)
}

function vec(cx: number, cy: number, angle: number, length: number): [number, number] {
  return [cx + Math.cos(angle) * length, cy + Math.sin(angle) * length]
}

export function softnessExpandStroke(size: number, softness: number): number {
  if (softness <= 0.02) return 0
  // Stronger expand so Overall Softness is obvious in preview + SVG
  return size * (0.04 + softness * 0.22)
}

export function stampEnvelopeRadius(size: number, _circular = false): number {
  void _circular
  return size * 0.48
}

/** Build a SoftStamp from a filled cell (shared by canvas + SVG). */
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
): SoftStamp {
  const circular = shapeIsCircular(def)
  return {
    id,
    cx,
    cy,
    r: stampEnvelopeRadius(size, circular),
    size,
    col,
    row,
    circular,
    contacts: shapeContactSamples(def, ox, oy, size),
  }
}

/**
 * Classic 2-disc metaball bridge (concave necks).
 */
export function metaballBridge(
  x1: number,
  y1: number,
  r1: number,
  x2: number,
  y2: number,
  r2: number,
  handleSize: number,
  v: number,
): string | null {
  if (r1 < 0.5 || r2 < 0.5) return null
  const d = dist(x1, y1, x2, y2)
  if (d < 1e-4) return null
  if (d > (r1 + r2) * handleSize) return null
  if (d <= Math.abs(r1 - r2) + 0.01) return null

  let u1: number
  let u2: number
  if (d < r1 + r2) {
    u1 = Math.acos(
      Math.min(1, Math.max(-1, (r1 * r1 + d * d - r2 * r2) / (2 * r1 * d))),
    )
    u2 = Math.acos(
      Math.min(1, Math.max(-1, (r2 * r2 + d * d - r1 * r1) / (2 * r2 * d))),
    )
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
  const d2 = Math.min(v * handleSize, dist(p1[0], p1[1], p3[0], p3[1]) / totalRadius)
  const HALF_PI = Math.PI / 2

  const h1 = vec(p1[0], p1[1], angle1 - HALF_PI, r1 * d2)
  const h2 = vec(p2[0], p2[1], angle2 + HALF_PI, r1 * d2)
  const h3 = vec(p3[0], p3[1], angle3 + HALF_PI, r2 * d2)
  const h4 = vec(p4[0], p4[1], angle4 - HALF_PI, r2 * d2)

  return [
    `M ${p1[0]} ${p1[1]}`,
    `C ${h1[0]} ${h1[1]} ${h3[0]} ${h3[1]} ${p3[0]} ${p3[1]}`,
    `L ${p4[0]} ${p4[1]}`,
    `C ${h4[0]} ${h4[1]} ${h2[0]} ${h2[1]} ${p2[0]} ${p2[1]}`,
    'Z',
  ].join(' ')
}

type ContactHit = {
  pa: [number, number]
  pb: [number, number]
  gap: number
  score: number
}

/**
 * Facing outline contacts between two stamps.
 * Returns the best hit plus a contact cluster for wider mixed-shape necks.
 */
function contactZone(
  a: SoftStamp,
  b: SoftStamp,
): {
  best: ContactHit
  ca: [number, number]
  cb: [number, number]
  spread: number
} | null {
  const axisX = b.cx - a.cx
  const axisY = b.cy - a.cy
  const axisLen = Math.hypot(axisX, axisY) || 1
  const ux = axisX / axisLen
  const uy = axisY / axisLen

  const facingA = a.contacts.filter((p) => {
    const dx = p[0] - a.cx
    const dy = p[1] - a.cy
    return dx * ux + dy * uy > -0.05 * a.size
  })
  const facingB = b.contacts.filter((p) => {
    const dx = p[0] - b.cx
    const dy = p[1] - b.cy
    return dx * ux + dy * uy < 0.05 * b.size
  })

  const poolA = facingA.length ? facingA : a.contacts
  const poolB = facingB.length ? facingB : b.contacts
  if (!poolA.length || !poolB.length) return null

  const hits: ContactHit[] = []
  for (const pa of poolA) {
    for (const pb of poolB) {
      const gap = dist(pa[0], pa[1], pb[0], pb[1])
      const sx = pb[0] - pa[0]
      const sy = pb[1] - pa[1]
      const sl = Math.hypot(sx, sy) || 1
      const align = Math.abs((sx / sl) * ux + (sy / sl) * uy)
      // Prefer close + aligned; slight penalty for off-axis drift
      const midX = (pa[0] + pb[0]) / 2
      const midY = (pa[1] + pb[1]) / 2
      const axisMidX = a.cx + ux * axisLen * 0.5
      const axisMidY = a.cy + uy * axisLen * 0.5
      const drift = dist(midX, midY, axisMidX, axisMidY)
      const score = gap * (1.15 - align * 0.4) + drift * 0.35
      hits.push({ pa, pb, gap, score })
    }
  }
  if (!hits.length) return null
  hits.sort((x, y) => x.score - y.score)

  const best = hits[0]
  const band = Math.max(best.gap * 1.35, Math.min(a.size, b.size) * 0.22)
  const cluster = hits.filter((h) => h.gap <= band).slice(0, 12)
  if (!cluster.length) return null

  let sax = 0
  let say = 0
  let sbx = 0
  let sby = 0
  for (const h of cluster) {
    sax += h.pa[0]
    say += h.pa[1]
    sbx += h.pb[0]
    sby += h.pb[1]
  }
  const n = cluster.length
  const ca: [number, number] = [sax / n, say / n]
  const cb: [number, number] = [sbx / n, sby / n]

  // Lateral spread of contact cluster → wider neck for broad facing edges
  let spread = 0
  for (const h of cluster) {
    const mx = (h.pa[0] + h.pb[0]) / 2
    const my = (h.pa[1] + h.pb[1]) / 2
    const lat = (mx - ca[0]) * -uy + (my - ca[1]) * ux
    spread = Math.max(spread, Math.abs(lat))
  }

  return { best, ca, cb, spread }
}

function connectStamps(
  a: SoftStamp,
  b: SoftStamp,
  softness: number,
  diagonal: boolean,
): string | null {
  if (softness <= 0.02) return null

  const bothCircle = !!(a.circular && b.circular)
  const reachBoost = diagonal ? 1.38 : 1

  // Same-family circles: classic center metaball
  if (bothCircle) {
    const handleSize = (1.35 + softness * 1.85) * reachBoost
    const v = 0.32 + softness * 0.45
    const rr = a.r * (0.88 + softness * 0.14)
    return metaballBridge(a.cx, a.cy, rr, b.cx, b.cy, b.r * (0.88 + softness * 0.14), handleSize, v)
  }

  // Mixed / non-circle: bridge at outline contact cluster (not body centers)
  const zone = contactZone(a, b)
  if (!zone) return null

  const gap = dist(zone.ca[0], zone.ca[1], zone.cb[0], zone.cb[1])
  const maxGap = Math.min(a.size, b.size) * (0.35 + softness * 1.35) * reachBoost
  if (gap > maxGap) return null

  // Neck stays local to the contact band — silhouettes stay recognizable
  const base = Math.min(a.size, b.size)
  const neck =
    base * (0.12 + softness * 0.32) + Math.min(zone.spread * 0.7, base * 0.28)
  const sx = zone.cb[0] - zone.ca[0]
  const sy = zone.cb[1] - zone.ca[1]
  const sl = Math.hypot(sx, sy) || 1
  const nx = sx / sl
  const ny = sy / sl
  const inset = Math.min(neck * 0.95, gap * 0.45)
  const c1x = zone.ca[0] + nx * inset
  const c1y = zone.ca[1] + ny * inset
  const c2x = zone.cb[0] - nx * inset
  const c2y = zone.cb[1] - ny * inset

  const handleSize = (1.65 + softness * 1.55) * reachBoost
  const v = 0.36 + softness * 0.42
  return metaballBridge(c1x, c1y, neck, c2x, c2y, neck, handleSize, v)
}

export interface SoftnessFinishOptions {
  /** Overall Softness 0–1. */
  softness: number
  /** Optional per-cell melt mask. Empty / omitted = melt all neighbors. */
  softMask?: SoftMask
}

/**
 * Bridge-only finish paths (no covering discs).
 * Orthogonal + diagonal (corner-adjacent) neighbors.
 */
export function softnessFinishPathList(
  stamps: SoftStamp[],
  softnessOrOpts: number | SoftnessFinishOptions,
): string[] {
  const opts: SoftnessFinishOptions =
    typeof softnessOrOpts === 'number'
      ? { softness: softnessOrOpts }
      : softnessOrOpts
  const { softness, softMask } = opts
  if (softness <= 0.02 || stamps.length < 2) return []

  const byCell = new Map<string, SoftStamp>()
  for (const s of stamps) byCell.set(`${s.col}:${s.row}`, s)

  const bridges: string[] = []
  const seen = new Set<string>()
  const selective = !!(softMask && softMask.size > 0)

  const connect = (a: SoftStamp, b: SoftStamp, diagonal: boolean) => {
    const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`
    if (seen.has(key)) return
    seen.add(key)

    const wa = softMaskWeight(softMask, a.col, a.row)
    const wb = softMaskWeight(softMask, b.col, b.row)
    // Selective mode: both cells must be marked to melt
    if (selective && (wa < 0.04 || wb < 0.04)) return
    const local = selective ? softness * Math.sqrt(wa * wb) : softness
    const bridge = connectStamps(a, b, local, diagonal)
    if (bridge) bridges.push(bridge)
  }

  for (const s of byCell.values()) {
    const { col, row } = s
    const right = byCell.get(`${col + 1}:${row}`)
    const down = byCell.get(`${col}:${row + 1}`)
    if (right) connect(s, right, false)
    if (down) connect(s, down, false)

    // Diagonal (corner-adjacent) — always available when Softness is on
    const se = byCell.get(`${col + 1}:${row + 1}`)
    const ne = byCell.get(`${col + 1}:${row - 1}`)
    if (se) connect(s, se, true)
    if (ne) connect(s, ne, true)
  }

  return bridges
}

export function softnessHint(softness: number): string {
  if (softness < 0.08) return 'Crisp'
  if (softness < 0.35) return 'Light melt'
  if (softness < 0.65) return 'Metaball'
  if (softness < 0.85) return 'Heavy melt'
  return 'Full melt'
}
