/** Archived — not imported. Local OTF font path builder (y-up). See archive/README.md */
export function appendShapeToFontPath(
  path: {
    moveTo: (x: number, y: number) => void
    lineTo: (x: number, y: number) => void
    curveTo: (x1: number, y1: number, x2: number, y2: number, x: number, y: number) => void
    close: () => void
  },
  def: ShapeDef,
  x: number,
  y: number,
  size: number,
  cornerRadius = 0,
) {
  // Approximate rounded shapes as their unrounded polygons for OTF prototype;
  // SVG export (primary path) uses full rounded paths.
  void cornerRadius
  const s = size
  const left = x
  const bottom = y
  const right = x + s
  const top = y + s
  const cx = x + s / 2
  const cy = y + s / 2
  const r = s / 2

  const poly = (pts: [number, number][]) => {
    if (!pts.length) return
    path.moveTo(pts[0][0], pts[0][1])
    for (let i = 1; i < pts.length; i++) path.lineTo(pts[i][0], pts[i][1])
    path.close()
  }

  if (def.kind === 'preset' && def.preset === 'circle') {
    const k = 0.5522847498 * r
    path.moveTo(cx + r, cy)
    path.curveTo(cx + r, cy + k, cx + k, cy + r, cx, cy + r)
    path.curveTo(cx - k, cy + r, cx - r, cy + k, cx - r, cy)
    path.curveTo(cx - r, cy - k, cx - k, cy - r, cx, cy - r)
    path.curveTo(cx + k, cy - r, cx + r, cy - k, cx + r, cy)
    path.close()
    return
  }

  // Build y-up vertices from SVG y-down outline via module path sampling is hard;
  // use geometric constructors in y-up.
  if (def.kind === 'preset' && def.preset === 'square') {
    poly([
      [left, bottom],
      [right, bottom],
      [right, top],
      [left, top],
    ])
    return
  }
  if (def.kind === 'preset' && def.preset === 'diamond') {
    poly([
      [cx, top],
      [right, cy],
      [cx, bottom],
      [left, cy],
    ])
    return
  }
  if (def.kind === 'preset' && def.preset === 'octagon') {
    const c = s * 0.25
    poly([
      [left + c, top],
      [right - c, top],
      [right, top - c],
      [right, bottom + c],
      [right - c, bottom],
      [left + c, bottom],
      [left, bottom + c],
      [left, top - c],
    ])
    return
  }

  const starPts = (points: number, innerRatio: number) => {
    const pts: [number, number][] = []
    const start = Math.PI / 2
    const outer = r * 0.92
    const inner = outer * innerRatio
    for (let i = 0; i < points * 2; i++) {
      const a = start + (i * Math.PI) / points
      const rad = i % 2 === 0 ? outer : inner
      pts.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)])
    }
    return pts
  }

  const gonPts = (sides: number) => {
    const pts: [number, number][] = []
    const start = Math.PI / 2
    for (let i = 0; i < sides; i++) {
      const a = start + (i * 2 * Math.PI) / sides
      pts.push([cx + r * 0.92 * Math.cos(a), cy + r * 0.92 * Math.sin(a)])
    }
    return pts
  }

  if (def.kind === 'preset' && def.preset === 'star5') {
    poly(starPts(5, 0.42))
    return
  }
  if (def.kind === 'preset' && def.preset === 'triangle') {
    poly(gonPts(3))
    return
  }
  if (def.kind === 'preset' && def.preset === 'pentagon') {
    poly(gonPts(5))
    return
  }
  if (def.kind === 'preset' && def.preset === 'hexagon') {
    poly(gonPts(6))
    return
  }
  if (def.kind === 'preset' && def.preset === 'rect') {
    const h = s * 0.58
    const y0 = cy - h / 2
    poly([
      [left + s * 0.04, y0],
      [right - s * 0.04, y0],
      [right - s * 0.04, y0 + h],
      [left + s * 0.04, y0 + h],
    ])
    return
  }
  if (def.kind === 'preset' && def.preset === 'cross') {
    const t = s * 0.32
    const m = (s - t) / 2
    poly([
      [left + m, top],
      [left + m + t, top],
      [left + m + t, top - m],
      [right, top - m],
      [right, top - m - t],
      [left + m + t, top - m - t],
      [left + m + t, bottom],
      [left + m, bottom],
      [left + m, top - m - t],
      [left, top - m - t],
      [left, top - m],
      [left + m, top - m],
    ])
    return
  }
  if (def.kind === 'preset' && def.preset === 'x') {
    const p = (px: number, py: number): [number, number] => [
      left + px * s,
      bottom + py * s,
    ]
    poly([
      p(0.08, 0.0),
      p(0.22, 0.0),
      p(0.5, 0.28),
      p(0.78, 0.0),
      p(0.92, 0.0),
      p(0.62, 0.5),
      p(0.92, 1.0),
      p(0.78, 1.0),
      p(0.5, 0.72),
      p(0.22, 1.0),
      p(0.08, 1.0),
      p(0.38, 0.5),
    ])
    return
  }
  if (def.kind === 'preset' && def.preset === 'chevron') {
    const t = s * 0.22
    poly([
      [cx, top - s * 0.08],
      [right - s * 0.08, top - s * 0.55],
      [right - s * 0.08 - t * 0.7, top - s * 0.55 - t * 0.55],
      [cx, top - s * 0.08 - t * 1.15],
      [left + s * 0.08 + t * 0.7, top - s * 0.55 - t * 0.55],
      [left + s * 0.08, top - s * 0.55],
    ])
    return
  }
  if (def.kind === 'preset' && def.preset === 'capsule') {
    const h = s * 0.42
    const y0 = cy - h / 2
    const rr = h / 2
    const x0 = left + s * 0.08
    const x1 = right - s * 0.08
    path.moveTo(x0 + rr, y0)
    path.lineTo(x1 - rr, y0)
    path.curveTo(x1, y0, x1, y0 + h, x1 - rr, y0 + h)
    path.lineTo(x0 + rr, y0 + h)
    path.curveTo(x0, y0 + h, x0, y0, x0 + rr, y0)
    path.close()
    return
  }
  if (def.kind === 'preset' && def.preset === 'ring') {
    // Outer only for OTF prototype (hole omitted)
    const k = 0.5522847498 * r * 0.92
    const or_ = r * 0.92
    path.moveTo(cx + or_, cy)
    path.curveTo(cx + or_, cy + k, cx + k, cy + or_, cx, cy + or_)
    path.curveTo(cx - k, cy + or_, cx - or_, cy + k, cx - or_, cy)
    path.curveTo(cx - or_, cy - k, cx - k, cy - or_, cx, cy - or_)
    path.curveTo(cx + k, cy - or_, cx + or_, cy - k, cx + or_, cy)
    path.close()
    return
  }
  if (def.kind === 'star') {
    poly(starPts(def.points, def.innerRatio))
    return
  }
  if (def.kind === 'polygon') {
    poly(gonPts(def.sides))
  }
}
