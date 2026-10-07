import type { ShapeDef } from '@/lib/types'

/**
 * Fill size is the stamp's bounding box.
 * Squares / circles fill that box. Capsules and rects span it on the long
 * axis; thickness stays a bar (not a half-size pill).
 */
export const BAR_THICKNESS = 0.72

/** Uniform-scale a polygon so its AABB matches the fill-size box. */
export function fitVerticesToBox(
  pts: [number, number][],
  ox: number,
  oy: number,
  s: number,
): [number, number][] {
  if (pts.length < 2 || s <= 0) return pts
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of pts) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  const w = maxX - minX
  const h = maxY - minY
  if (w < 1e-6 || h < 1e-6) return pts
  const scale = Math.min(s / w, s / h) * 0.998
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const ncx = ox + s / 2
  const ncy = oy + s / 2
  return pts.map(([x, y]) => [(x - cx) * scale + ncx, (y - cy) * scale + ncy])
}

function polyVertices(
  cx: number,
  cy: number,
  r: number,
  sides: number,
  startAngle = -Math.PI / 2,
): [number, number][] {
  const pts: [number, number][] = []
  for (let i = 0; i < sides; i++) {
    const a = startAngle + (i * 2 * Math.PI) / sides
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
  }
  return pts
}

function starVertices(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  points: number,
): [number, number][] {
  const pts: [number, number][] = []
  const start = -Math.PI / 2
  for (let i = 0; i < points * 2; i++) {
    const a = start + (i * Math.PI) / points
    const rad = i % 2 === 0 ? outerR : innerR
    pts.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)])
  }
  return pts
}

function rotateAbout(
  pts: [number, number][],
  cx: number,
  cy: number,
  radians: number,
): [number, number][] {
  const c = Math.cos(radians)
  const sn = Math.sin(radians)
  return pts.map(([x, y]) => {
    const dx = x - cx
    const dy = y - cy
    return [cx + dx * c - dy * sn, cy + dx * sn + dy * c]
  })
}

function plusVertices(ox: number, oy: number, s: number): [number, number][] {
  const t = s * 0.32
  const m = (s - t) / 2
  return [
    [ox + m, oy],
    [ox + m + t, oy],
    [ox + m + t, oy + m],
    [ox + s, oy + m],
    [ox + s, oy + m + t],
    [ox + m + t, oy + m + t],
    [ox + m + t, oy + s],
    [ox + m, oy + s],
    [ox + m, oy + m + t],
    [ox, oy + m + t],
    [ox, oy + m],
    [ox + m, oy + m],
  ]
}

function arcVertices(ox: number, oy: number, s: number): [number, number][] {
  const N = 12
  const pts: [number, number][] = []
  const R_out = s
  const R_in = s * (1 - BAR_THICKNESS)
  const cx = ox
  const cy = oy + s
  for (let i = 0; i <= N; i++) {
    const a = -Math.PI / 2 + (i / N) * (Math.PI / 2)
    pts.push([cx + R_out * Math.cos(a), cy + R_out * Math.sin(a)])
  }
  for (let i = N; i >= 0; i--) {
    const a = -Math.PI / 2 + (i / N) * (Math.PI / 2)
    pts.push([cx + R_in * Math.cos(a), cy + R_in * Math.sin(a)])
  }
  return pts
}

function wedgeVertices(ox: number, oy: number, s: number): [number, number][] {
  const N = 12
  const pts: [number, number][] = [[ox, oy + s]]
  const cx = ox
  const cy = oy + s
  for (let i = 0; i <= N; i++) {
    const a = -Math.PI / 2 + (i / N) * (Math.PI / 2)
    pts.push([cx + s * Math.cos(a), cy + s * Math.sin(a)])
  }
  return pts
}

function notchVertices(ox: number, oy: number, s: number): [number, number][] {
  const N = 12
  const pts: [number, number][] = [[ox, oy], [ox + s, oy]]
  const cx = ox + s
  const cy = oy + s
  for (let i = 0; i <= N; i++) {
    const t = i / N
    const a = -Math.PI / 2 - t * (Math.PI / 2)
    pts.push([cx + s * Math.cos(a), cy + s * Math.sin(a)])
  }
  return pts
}

function pathFromPts(pts: [number, number][]): string {
  if (!pts.length) return ''
  return `M ${pts.map(([x, y]) => `${x} ${y}`).join(' L ')} Z`
}

/** Quadratic corner rounding — works for any polygon. */
export function roundPath(
  pts: [number, number][],
  cornerRadius: number,
  boxSize: number,
): string {
  if (cornerRadius <= 0 || pts.length < 3) return pathFromPts(pts)
  const r = Math.min(cornerRadius, boxSize * 0.35)
  const n = pts.length
  const parts: string[] = []
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n]
    const cur = pts[i]
    const next = pts[(i + 1) % n]
    const v1x = prev[0] - cur[0]
    const v1y = prev[1] - cur[1]
    const v2x = next[0] - cur[0]
    const v2y = next[1] - cur[1]
    const len1 = Math.hypot(v1x, v1y) || 1
    const len2 = Math.hypot(v2x, v2y) || 1
    const cut = Math.min(r, len1 * 0.45, len2 * 0.45)
    const p1: [number, number] = [cur[0] + (v1x / len1) * cut, cur[1] + (v1y / len1) * cut]
    const p2: [number, number] = [cur[0] + (v2x / len2) * cut, cur[1] + (v2y / len2) * cut]
    if (i === 0) parts.push(`M ${p1[0]} ${p1[1]}`)
    else parts.push(`L ${p1[0]} ${p1[1]}`)
    parts.push(`Q ${cur[0]} ${cur[1]} ${p2[0]} ${p2[1]}`)
  }
  parts.push('Z')
  return parts.join(' ')
}

function presetVertices(
  preset: Extract<ShapeDef, { kind: 'preset' }>['preset'],
  ox: number,
  oy: number,
  s: number,
): [number, number][] | 'circle' | 'special' {
  const cx = ox + s / 2
  const cy = oy + s / 2
  const r = s / 2

  switch (preset) {
    case 'circle':
    case 'ring':
    case 'capsule':
    case 'capsuleV':
      return preset === 'circle' ? 'circle' : 'special'
    case 'square':
      return [
        [ox, oy],
        [ox + s, oy],
        [ox + s, oy + s],
        [ox, oy + s],
      ]
    case 'rect': {
      const h = s * BAR_THICKNESS
      const y0 = cy - h / 2
      return [
        [ox, y0],
        [ox + s, y0],
        [ox + s, y0 + h],
        [ox, y0 + h],
      ]
    }
    case 'octagon': {
      const c = s * 0.25
      return [
        [ox + c, oy],
        [ox + s - c, oy],
        [ox + s, oy + c],
        [ox + s, oy + s - c],
        [ox + s - c, oy + s],
        [ox + c, oy + s],
        [ox, oy + s - c],
        [ox, oy + c],
      ]
    }
    case 'diamond':
      return [
        [cx, oy],
        [ox + s, cy],
        [cx, oy + s],
        [ox, cy],
      ]
    case 'triangle':
      return fitVerticesToBox(polyVertices(cx, cy, r, 3), ox, oy, s)
    case 'hexagon':
      return fitVerticesToBox(polyVertices(cx, cy, r, 6), ox, oy, s)
    case 'pentagon':
      return fitVerticesToBox(polyVertices(cx, cy, r, 5), ox, oy, s)
    case 'star5':
      return fitVerticesToBox(starVertices(cx, cy, r, r * 0.42, 5), ox, oy, s)
    case 'star4':
      return fitVerticesToBox(starVertices(cx, cy, r, r * 0.36, 4), ox, oy, s)
    case 'cross':
      return plusVertices(ox, oy, s)
    case 'x':
      return fitVerticesToBox(rotateAbout(plusVertices(ox, oy, s), cx, cy, Math.PI / 4), ox, oy, s)
    case 'chevron': {
      // Upward chevron / caret
      const t = s * 0.22
      return fitVerticesToBox(
        [
          [cx, oy + s * 0.08],
          [ox + s * 0.92, oy + s * 0.55],
          [ox + s * 0.92 - t * 0.7, oy + s * 0.55 + t * 0.55],
          [cx, oy + s * 0.08 + t * 1.15],
          [ox + s * 0.08 + t * 0.7, oy + s * 0.55 + t * 0.55],
          [ox + s * 0.08, oy + s * 0.55],
        ],
        ox,
        oy,
        s,
      )
    }
    case 'arc':
      return arcVertices(ox, oy, s)
    case 'wedge':
      return wedgeVertices(ox, oy, s)
    case 'notch':
      return notchVertices(ox, oy, s)
  }
}

/** Medial segment + cap radius matching the painted stadium. */
export function capsuleMedial(
  ox: number,
  oy: number,
  s: number,
  vertical = false,
): { ax: number; ay: number; bx: number; by: number; r: number } {
  const r = (s * BAR_THICKNESS) / 2
  const cx = ox + s / 2
  const cy = oy + s / 2
  if (vertical) {
    return { ax: cx, ay: oy + r, bx: cx, by: oy + s - r, r }
  }
  return { ax: ox + r, ay: cy, bx: ox + s - r, by: cy, r }
}

function capsulePath(ox: number, oy: number, s: number, vertical = false): string {
  const pts = capsuleSamples(ox, oy, s, vertical)
  if (!pts.length) return ''
  return `M ${pts.map(([x, y]) => `${x} ${y}`).join(' L ')} Z`
}

function capsuleSamples(ox: number, oy: number, s: number, vertical = false): [number, number][] {
  const { ax, ay, bx, by, r } = capsuleMedial(ox, oy, s, vertical)
  const pts: [number, number][] = []
  // Bound cap chord error below 0.01px, including large export sizes.
  const cap = Math.max(32, 2 * Math.ceil(Math.PI / Math.acos(Math.max(-1, 1 - 0.01 / r)) / 4))

  if (vertical) {
    for (let i = 0; i <= cap; i++) {
      const a = Math.PI + (i * Math.PI) / cap
      pts.push([ax + r * Math.cos(a), ay + r * Math.sin(a)])
    }
    for (let i = 0; i <= cap; i++) {
      const a = (i * Math.PI) / cap
      pts.push([bx + r * Math.cos(a), by + r * Math.sin(a)])
    }
    return pts
  }

  for (let i = 0; i <= cap; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / cap
    pts.push([bx + r * Math.cos(a), by + r * Math.sin(a)])
  }
  for (let i = 0; i <= cap; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / cap
    pts.push([ax + r * Math.cos(a), ay + r * Math.sin(a)])
  }
  return pts
}

function ringPath(cx: number, cy: number, outerR: number, innerR: number): string {
  return [
    `M ${cx + outerR} ${cy}`,
    `A ${outerR} ${outerR} 0 1 1 ${cx - outerR} ${cy}`,
    `A ${outerR} ${outerR} 0 1 1 ${cx + outerR} ${cy}`,
    'Z',
    `M ${cx + innerR} ${cy}`,
    `A ${innerR} ${innerR} 0 1 0 ${cx - innerR} ${cy}`,
    `A ${innerR} ${innerR} 0 1 0 ${cx + innerR} ${cy}`,
    'Z',
  ].join(' ')
}

/** Evenodd for rings; undefined otherwise. */
export function moduleShapeFillRule(def: ShapeDef): 'evenodd' | undefined {
  if (def.kind === 'preset' && def.preset === 'ring') return 'evenodd'
  return undefined
}

/**
 * @param cornerRadius — live override (Options / builder). Circles/rings/capsules ignore it
 *   (capsule is already round). For polygon/star defs, max(def.cornerRadius, override) is used.
 */
function rawModuleShapePath(
  def: ShapeDef,
  ox: number,
  oy: number,
  s: number,
  cornerRadius = 0,
  rotation = 0,
): string {
  const cx = ox + s / 2
  const cy = oy + s / 2
  const r = s / 2
  const rotRad = (rotation * Math.PI) / 180

  if (def.kind === 'preset') {
    if (def.preset === 'circle') {
      return `M ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} Z`
    }
    if (def.preset === 'ring') {
      return ringPath(cx, cy, r, r * 0.5)
    }
    if (def.preset === 'capsule' || def.preset === 'capsuleV') {
      const isVert = def.preset === 'capsuleV'
      if (!rotRad) return capsulePath(ox, oy, s, isVert)
      const pts = rotateAbout(capsuleSamples(ox, oy, s, isVert), cx, cy, rotRad)
      return pathFromPts(pts)
    }
    const verts = presetVertices(def.preset, ox, oy, s)
    if (verts === 'circle') {
      return `M ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} Z`
    }
    if (verts === 'special') {
      if (!rotRad) return capsulePath(ox, oy, s, false)
      const pts = rotateAbout(capsuleSamples(ox, oy, s, false), cx, cy, rotRad)
      return pathFromPts(pts)
    }
    const rotatedVerts = rotRad ? rotateAbout(verts, cx, cy, rotRad) : verts
    if (def.preset === 'arc') {
      return pathFromPts(rotatedVerts)
    }
    return roundPath(rotatedVerts, cornerRadius, s)
  }

  if (def.kind === 'polygon') {
    const sides = Math.max(3, Math.min(12, Math.round(def.sides)))
    const radius = Math.max(def.cornerRadius, cornerRadius)
    const verts = fitVerticesToBox(polyVertices(cx, cy, r, sides), ox, oy, s)
    const rotatedVerts = rotRad ? rotateAbout(verts, cx, cy, rotRad) : verts
    return roundPath(rotatedVerts, radius, s)
  }

  const points = Math.max(3, Math.min(12, Math.round(def.points)))
  const inner = r * Math.max(0.15, Math.min(0.85, def.innerRatio))
  const radius = Math.max(def.cornerRadius, cornerRadius)
  const verts = fitVerticesToBox(starVertices(cx, cy, r, inner, points), ox, oy, s)
  const rotatedVerts = rotRad ? rotateAbout(verts, cx, cy, rotRad) : verts
  return roundPath(rotatedVerts, radius, s)
}

export function shapeSupportsRounding(def: ShapeDef): boolean {
  if (def.kind !== 'preset') return true
  return !['circle', 'ring', 'capsule', 'capsuleV', 'arc'].includes(def.preset)
}

export function shapeIsCircular(def: ShapeDef): boolean {
  return def.kind === 'preset' && (def.preset === 'circle' || def.preset === 'ring')
}

export function shapeIsCapsule(def: ShapeDef): boolean {
  return def.kind === 'preset' && (def.preset === 'capsule' || def.preset === 'capsuleV')
}

/** Convex modules whose rounding can go toward a circular blob. */
export function shapeIsBlobConvex(def: ShapeDef): boolean {
  if (def.kind === 'polygon') return true
  if (def.kind !== 'preset') return false
  return (
    def.preset === 'circle' ||
    def.preset === 'ring' ||
    def.preset === 'square' ||
    def.preset === 'rect' ||
    def.preset === 'octagon' ||
    def.preset === 'diamond' ||
    def.preset === 'triangle' ||
    def.preset === 'hexagon' ||
    def.preset === 'pentagon' ||
    def.preset === 'capsule' ||
    def.preset === 'capsuleV' ||
    def.preset === 'arc' ||
    def.preset === 'wedge' ||
    def.preset === 'notch'
  )
}

/** Live + baked corner radius, capped the same way `roundPath` caps it. */
export function effectiveCornerRadius(def: ShapeDef, live = 0, boxSize = 42): number {
  if (!shapeSupportsRounding(def)) return 0
  const baked = def.kind === 'polygon' || def.kind === 'star' ? def.cornerRadius : 0
  return Math.min(Math.max(baked, live), boxSize * 0.35)
}

/** 0 = sharp corners, 1 = circle / capsule / max rounding. */
export function shapeRoundness(def: ShapeDef, live = 0, boxSize = 42): number {
  if (shapeIsCircular(def) || shapeIsCapsule(def)) return 1
  const cap = boxSize * 0.35
  if (cap < 0.5) return 0
  return Math.min(1, effectiveCornerRadius(def, live, boxSize) / cap)
}

/** Rounded convex stamps blob like circles; stars/crosses keep their silhouette melt. */
export function shapeIsBlobLike(def: ShapeDef, live = 0, boxSize = 42): boolean {
  if (shapeIsCircular(def) || shapeIsCapsule(def)) return true
  if (!shapeIsBlobConvex(def)) return false
  return shapeRoundness(def, live, boxSize) >= 0.4
}

function densifyClosed(verts: [number, number][], stepsPerEdge = 3): [number, number][] {
  if (verts.length < 2) return verts
  const out: [number, number][] = []
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i]
    const b = verts[(i + 1) % verts.length]
    out.push(a)
    for (let s = 1; s < stepsPerEdge; s++) {
      const t = s / stepsPerEdge
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
    }
  }
  return out
}

/**
 * Outline sample points for Softness contact bridges (mixed-shape joins).
 * Circles → rim samples; polygons/stars/cross → densified vertices.
 */
function rawShapeContactSamples(
  def: ShapeDef,
  ox: number,
  oy: number,
  s: number,
  cornerRadius = 0,
  rotation = 0,
): [number, number][] {
  const cx = ox + s / 2
  const cy = oy + s / 2
  const r = s / 2
  const rotRad = (rotation * Math.PI) / 180

  let rawPts: [number, number][]

  if (def.kind === 'preset' && def.preset === 'circle') {
    const pts: [number, number][] = []
    for (let i = 0; i < 24; i++) {
      const a = (i * 2 * Math.PI) / 24
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
    }
    rawPts = pts
  } else if (def.kind === 'preset' && def.preset === 'ring') {
    const pts: [number, number][] = []
    const or_ = r
    for (let i = 0; i < 24; i++) {
      const a = (i * 2 * Math.PI) / 24
      pts.push([cx + or_ * Math.cos(a), cy + or_ * Math.sin(a)])
    }
    rawPts = pts
  } else if (def.kind === 'preset' && def.preset === 'capsule') {
    rawPts = densifyClosed(capsuleSamples(ox, oy, s, false), 2)
  } else if (def.kind === 'preset' && def.preset === 'capsuleV') {
    rawPts = densifyClosed(capsuleSamples(ox, oy, s, true), 2)
  } else if (
    def.kind === 'star' ||
    (def.kind === 'preset' && (def.preset === 'star5' || def.preset === 'star4'))
  ) {
    const pointsN =
      def.kind === 'star' ? Math.max(3, Math.round(def.points)) : def.preset === 'star4' ? 4 : 5
    const innerRatio = def.kind === 'star' ? def.innerRatio : def.preset === 'star4' ? 0.36 : 0.42
    const verts = fitVerticesToBox(starVertices(cx, cy, r, r * innerRatio, pointsN), ox, oy, s)
    const radius = def.kind === 'star' ? Math.max(def.cornerRadius, cornerRadius) : cornerRadius
    rawPts = densifyClosed(roundedOutlineRing(verts, radius, s), radius > 0.5 ? 2 : 4)
  } else if (def.kind === 'polygon') {
    const sides = Math.max(3, Math.min(12, Math.round(def.sides)))
    const radius = Math.max(def.cornerRadius, cornerRadius)
    rawPts = densifyClosed(
      roundedOutlineRing(fitVerticesToBox(polyVertices(cx, cy, r, sides), ox, oy, s), radius, s),
      radius > 0.5 ? 2 : 4,
    )
  } else {
    const verts = presetVertices(
      def.kind === 'preset' ? def.preset : 'square',
      ox,
      oy,
      s,
    )
    if (verts === 'circle' || verts === 'special') {
      return rawShapeContactSamples(
        { id: 'tmp', kind: 'preset', preset: 'circle', label: 'Circle' },
        ox,
        oy,
        s,
        cornerRadius,
        rotation,
      )
    }
    rawPts = densifyClosed(roundedOutlineRing(verts, cornerRadius, s), cornerRadius > 0.5 ? 2 : 4)
  }

  return rotRad ? rotateAbout(rawPts, cx, cy, rotRad) : rawPts
}

function circleRing(cx: number, cy: number, r: number, n = 32): [number, number][] {
  const pts: [number, number][] = []
  for (let i = 0; i < n; i++) {
    const a = (i * 2 * Math.PI) / n
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
  }
  return pts
}

/** Outline matching `roundPath`, sampled so Softness can union the real silhouette. */
export function roundedOutlineRing(
  pts: [number, number][],
  cornerRadius: number,
  boxSize: number,
): [number, number][] {
  if (cornerRadius <= 0 || pts.length < 3) return pts
  const r = Math.min(cornerRadius, boxSize * 0.35)
  const n = pts.length
  const steps = Math.max(8, Math.min(18, Math.round(6 + r * 0.65)))
  const out: [number, number][] = []
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n]
    const cur = pts[i]
    const next = pts[(i + 1) % n]
    const v1x = prev[0] - cur[0]
    const v1y = prev[1] - cur[1]
    const v2x = next[0] - cur[0]
    const v2y = next[1] - cur[1]
    const len1 = Math.hypot(v1x, v1y) || 1
    const len2 = Math.hypot(v2x, v2y) || 1
    const cut = Math.min(r, len1 * 0.45, len2 * 0.45)
    const p1: [number, number] = [cur[0] + (v1x / len1) * cut, cur[1] + (v1y / len1) * cut]
    const p2: [number, number] = [cur[0] + (v2x / len2) * cut, cur[1] + (v2y / len2) * cut]
    for (let s = 0; s <= steps; s++) {
      const t = s / steps
      const mt = 1 - t
      out.push([
        mt * mt * p1[0] + 2 * mt * t * cur[0] + t * t * p2[0],
        mt * mt * p1[1] + 2 * mt * t * cur[1] + t * t * p2[1],
      ])
    }
  }
  return out
}

/**
 * Closed outline rings for boolean Softness (outer first, then holes).
 * These are the real module silhouettes — not covering discs.
 */
function rawShapeOutlineRings(
  def: ShapeDef,
  ox: number,
  oy: number,
  s: number,
  cornerRadius = 0,
  rotation = 0,
): [number, number][][] {
  const cx = ox + s / 2
  const cy = oy + s / 2
  const r = s / 2
  const rotRad = (rotation * Math.PI) / 180

  let rings: [number, number][][]

  if (def.kind === 'preset' && def.preset === 'circle') {
    rings = [circleRing(cx, cy, r, 32)]
  } else if (def.kind === 'preset' && def.preset === 'ring') {
    rings = [circleRing(cx, cy, r, 32), circleRing(cx, cy, r * 0.5, 48).reverse()]
  } else if (def.kind === 'preset' && (def.preset === 'capsule' || def.preset === 'capsuleV')) {
    rings = [rawShapeContactSamples(def, ox, oy, s, 0, rotation)]
    return rings
  } else if (def.kind === 'polygon') {
    const sides = Math.max(3, Math.min(12, Math.round(def.sides)))
    const radius = Math.max(def.cornerRadius, cornerRadius)
    rings = [roundedOutlineRing(fitVerticesToBox(polyVertices(cx, cy, r, sides), ox, oy, s), radius, s)]
  } else if (def.kind === 'star') {
    const points = Math.max(3, Math.min(12, Math.round(def.points)))
    const inner = r * Math.max(0.15, Math.min(0.85, def.innerRatio))
    const radius = Math.max(def.cornerRadius, cornerRadius)
    rings = [
      roundedOutlineRing(
        fitVerticesToBox(starVertices(cx, cy, r, inner, points), ox, oy, s),
        radius,
        s,
      ),
    ]
  } else {
    const verts = presetVertices(def.kind === 'preset' ? def.preset : 'square', ox, oy, s)
    if (verts === 'circle') rings = [circleRing(cx, cy, r, 32)]
    else if (verts === 'special') rings = [rawShapeContactSamples(def, ox, oy, s, 0, rotation)]
    else rings = [roundedOutlineRing(verts, cornerRadius, s)]
  }

  if (rotRad) {
    return rings.map(ring => rotateAbout(ring, cx, cy, rotRad))
  }
  return rings
}

/** Pixel size is the longest unrotated ink extent, after rounding. */
function sizeTransform(rings: [number, number][][], ox: number, oy: number, size: number) {
  const points = rings.flat()
  const xs = points.map(p => p[0]), ys = points.map(p => p[1])
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  return { scale: size / (Math.max(maxX - minX, maxY - minY) || 1),
    x: (minX + maxX) / 2, y: (minY + maxY) / 2, cx: ox + size / 2, cy: oy + size / 2 }
}
function sizedPoints(points: [number, number][], t: ReturnType<typeof sizeTransform>, rotation: number) {
  const scaled: [number, number][] = points.map(([x,y]) => [(x-t.x)*t.scale+t.cx,(y-t.y)*t.scale+t.cy])
  return rotation ? rotateAbout(scaled,t.cx,t.cy,rotation*Math.PI/180) : scaled
}
export function shapeOutlineRings(def: ShapeDef, ox: number, oy: number, size: number, corners = 0, rotation = 0): [number, number][][] {
  const rings = rawShapeOutlineRings(def,ox,oy,size,corners,0)
  const t = sizeTransform(rings,ox,oy,size)
  return rings.map(r => sizedPoints(r,t,rotation))
}
export function shapeContactSamples(def: ShapeDef, ox: number, oy: number, size: number, corners = 0, rotation = 0): [number, number][] {
  const t = sizeTransform(rawShapeOutlineRings(def,ox,oy,size,corners,0),ox,oy,size)
  return sizedPoints(rawShapeContactSamples(def,ox,oy,size,corners,0),t,rotation)
}
export function moduleShapePath(def: ShapeDef, ox: number, oy: number, size: number, corners = 0, rotation = 0): string {
  if (def.kind === 'preset' && (def.preset === 'circle' || def.preset === 'ring')) {
    return rawModuleShapePath(def,ox,oy,size,corners,rotation)
  }
  return shapeOutlineRings(def,ox,oy,size,corners,rotation).map(pathFromPts).join(' ')
}
