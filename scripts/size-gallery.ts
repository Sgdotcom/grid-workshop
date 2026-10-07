/**
 * Optical-size comparison at a shared fill size. Run:
 * npx vite-node scripts/size-gallery.ts
 */
import { writeFileSync } from 'node:fs'
import { moduleShapeFillRule, moduleShapePath, shapeOutlineRings } from '@/lib/shapes'
import { PRESET_SHAPES, shapeLabel } from '@/lib/types'

const SIZES = [40, 42]
const CELL = 40
const PAD = 8
const INK = '#14202b'
const PAPER = '#f7faf8'
const BOX = 'rgba(20,32,43,0.28)'

function shoelace(pts: [number, number][]) {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[(i + 1) % pts.length]
    a += x1 * y2 - x2 * y1
  }
  return Math.abs(a) / 2
}

function measure(size: number) {
  return PRESET_SHAPES.map((def) => {
    const rings = shapeOutlineRings(def, 0, 0, size, 0)
    const outer = rings[0] ?? []
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const [x, y] of outer) {
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
    const w = maxX - minX
    const h = maxY - minY
    const area = shoelace(outer) - rings.slice(1).reduce((n, r) => n + shoelace(r), 0)
    return {
      label: shapeLabel(def),
      w: +w.toFixed(1),
      h: +h.toFixed(1),
      area: Math.round(area),
      vsSquare: +(area / (size * size)).toFixed(2),
    }
  })
}

function tile(def: (typeof PRESET_SHAPES)[number], size: number) {
  const ox = (CELL - size) / 2
  const oy = (CELL - size) / 2
  const w = CELL + PAD * 2
  const d = moduleShapePath(def, ox, oy, size, 0)
  const rule = moduleShapeFillRule(def)
  return `<figure>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${w}" width="96" height="96" role="img" aria-label="${shapeLabel(def)}">
      <rect width="${w}" height="${w}" fill="${PAPER}"/>
      <g transform="translate(${PAD} ${PAD})">
        <rect x="0.4" y="0.4" width="${CELL - 0.8}" height="${CELL - 0.8}" fill="none" stroke="${BOX}" stroke-dasharray="2 2"/>
        <path d="${d}" fill="${INK}" fill-rule="${rule ?? 'nonzero'}"/>
      </g>
    </svg>
    <figcaption>${shapeLabel(def)}</figcaption>
  </figure>`
}

const reports = SIZES.map((size) => ({ size, rows: measure(size) }))
const html = `<!doctype html>
<html lang="en">
<meta charset="utf-8"/>
<title>Gridz fill-size comparison</title>
<style>
  body { font: 13px/1.4 ui-sans-serif, system-ui; background: #eef1ef; color: #14202b; margin: 0; padding: 24px; }
  h1 { font-size: 20px; margin: 0 0 8px; }
  h2 { font-size: 15px; margin: 28px 0 6px; }
  .note { color: #5b6b73; margin: 0 0 12px; max-width: 80ch; }
  section { display: flex; flex-wrap: wrap; gap: 10px; }
  figure { margin: 0; background: #fff; border: 1px solid #d5ddd8; border-radius: 10px; padding: 8px; width: 112px; }
  figcaption { font-size: 11px; color: #5b6b73; margin-top: 6px; text-align: center; }
  table { border-collapse: collapse; background: #fff; }
  th, td { border: 1px solid #d5ddd8; padding: 4px 8px; font-variant-numeric: tabular-nums; }
  th { text-align: left; background: #f7faf8; }
</style>
<body>
<h1>Fill-size comparison</h1>
<p class="note">Every preset at the same fill size, centered in a 40px cell (dashed). Capsules/rects span the box on the long axis; polygons are fitted to the box.</p>
${SIZES.map(
  (size) =>
    `<h2>Fill size ${size}px</h2><section>${PRESET_SHAPES.map((d) => tile(d, size)).join('')}</section>`,
).join('')}
${reports
  .map(
    (rep) => `<h2>Bounds at ${rep.size}px</h2>
<table>
  <tr><th>Shape</th><th>W</th><th>H</th><th>Area</th><th>vs square</th></tr>
  ${rep.rows.map((r) => `<tr><td>${r.label}</td><td>${r.w}</td><td>${r.h}</td><td>${r.area}</td><td>${r.vsSquare}</td></tr>`).join('')}
</table>`,
  )
  .join('')}
</body></html>
`

writeFileSync('/tmp/gridz-size-gallery.html', html)
writeFileSync('/tmp/gridz-size-report.json', JSON.stringify(reports, null, 2))
console.log('wrote /tmp/gridz-size-gallery.html')
for (const rep of reports) {
  console.log(`\nsize ${rep.size}`)
  console.table(rep.rows)
}
