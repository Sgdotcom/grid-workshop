/**
 * Self-pair blend matrix + diagnostics. Run:
 * npx vite-node scripts/blend-gallery.ts
 */
import { writeFileSync } from 'node:fs'
import { cellCenter, cellOrigin } from '@/lib/gridGeometry'
import { moduleShapeFillRule, moduleShapePath } from '@/lib/shapes'
import { makeSoftStamp, softnessFinishPathList } from '@/lib/softness'
import { PRESET_SHAPES, shapeLabel, type ShapeDef } from '@/lib/types'

const GRID = { cols: 3, rows: 3, cellSize: 40, gap: 2 }
const INK = '#14202b'
const PAPER = '#f7faf8'
const PAD = 10
const SOFT = [0, 0.35, 0.55, 1]
const SIZES = [24, 42, 56]

function stampAt(def: ShapeDef, col: number, row: number, size: number, corner: number) {
  const { cx, cy } = cellCenter(col, row, GRID)
  const { x, y } = cellOrigin(col, row, GRID)
  const ox = x + (GRID.cellSize - size) / 2
  const oy = y + (GRID.cellSize - size) / 2
  return {
    soft: makeSoftStamp(`${def.id}:${col}:${row}`, col, row, cx, cy, size, def, ox, oy, corner),
    crisp: moduleShapePath(def, ox, oy, size, corner),
    rule: moduleShapeFillRule(def),
  }
}

function countSubpaths(d: string) {
  return (d.match(/M /g) ?? []).length
}

function tile(
  label: string,
  a: ShapeDef,
  b: ShapeDef,
  size: number,
  softness: number,
  corner: number,
  vertical = false,
) {
  const sa = stampAt(a, 0, 0, size, corner)
  const sb = stampAt(b, vertical ? 0 : 1, vertical ? 1 : 0, size, corner)
  const fused = softnessFinishPathList([sa.soft, sb.soft], softness)
  const usedFuse = softness > 0.02 && fused.length > 0
  const paths = usedFuse ? fused : [sa.crisp, sb.crisp]
  const subpaths = paths.reduce((n, d) => n + countSubpaths(d), 0)
  const innerW = vertical ? 40 : 82
  const innerH = vertical ? 82 : 40
  const w = innerW + PAD * 2
  const h = innerH + PAD * 2
  const body = paths
    .map((d) => `<path d="${d}" fill="${INK}" fill-rule="evenodd" transform="translate(${PAD} ${PAD})"/>`)
    .join('')
  const flags: string[] = []
  const holey =
    (a.kind === 'preset' && a.preset === 'ring') || (b.kind === 'preset' && b.preset === 'ring')
  const expectSeparate = size <= 28 && softness < 0.95
  if (usedFuse && !expectSeparate && fused.length > 1) flags.push('multi-outline')
  if (usedFuse && !expectSeparate && subpaths > (holey ? 3 : 2)) flags.push(`islands:${subpaths}`)
  if (!usedFuse && softness > 0.02) flags.push('no-fuse')
  return {
    label,
    flags,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w * 1.8}" height="${h * 1.8}" role="img" aria-label="${label}">
      <rect width="${w}" height="${h}" fill="${PAPER}"/>
      ${body}
    </svg>`,
  }
}

type Tile = ReturnType<typeof tile>
type Section = { title: string; note: string; tiles: Tile[] }

const selfHorizontal: Section = {
  title: 'Every shape next to itself · horizontal · size 42 · r0',
  note: 'Neighbor cells on a 40px / 2px-gap lattice. Softness 0 / 35 / 55 / 100%.',
  tiles: SOFT.flatMap((soft) =>
    PRESET_SHAPES.map((def) =>
      tile(`${shapeLabel(def)} · ${Math.round(soft * 100)}% · H`, def, def, 42, soft, 0, false),
    ),
  ),
}

const selfVertical: Section = {
  title: 'Every shape next to itself · vertical · size 42 · r0',
  note: 'Same stamps stacked. V capsules and chevrons are the everyday vertical case.',
  tiles: SOFT.flatMap((soft) =>
    PRESET_SHAPES.map((def) =>
      tile(`${shapeLabel(def)} · ${Math.round(soft * 100)}% · V`, def, def, 42, soft, 0, true),
    ),
  ),
}

const selfSize: Section = {
  title: 'Fill size · self pair · softness 55% · H',
  note: '24 / 42 / 56px. Small stamps should stay separate; large should melt.',
  tiles: SIZES.flatMap((size) =>
    PRESET_SHAPES.map((def) =>
      tile(`${shapeLabel(def)} · ${size}px`, def, def, size, 0.55, 0, false),
    ),
  ),
}

const Hcap = PRESET_SHAPES.find((d) => d.kind === 'preset' && d.preset === 'capsule')!
const Vcap = PRESET_SHAPES.find((d) => d.kind === 'preset' && d.preset === 'capsuleV')!

const capsuleMix: Section = {
  title: 'H capsule × V capsule',
  note: 'Mixed orientations next to and stacked. Plus same-orientation side-to-side (H stacked, V side-by-side).',
  tiles: [
    ...SOFT.flatMap((soft) => [
      tile(`H then V · ${Math.round(soft * 100)}% · H`, Hcap, Vcap, 42, soft, 0, false),
      tile(`V then H · ${Math.round(soft * 100)}% · H`, Vcap, Hcap, 42, soft, 0, false),
      tile(`H then V · ${Math.round(soft * 100)}% · V`, Hcap, Vcap, 42, soft, 0, true),
      tile(`V then H · ${Math.round(soft * 100)}% · V`, Vcap, Hcap, 42, soft, 0, true),
    ]),
    tile('H · H stacked · 55%', Hcap, Hcap, 42, 0.55, 0, true),
    tile('H · H stacked · 100%', Hcap, Hcap, 42, 1, 0, true),
    tile('V · V side · 55%', Vcap, Vcap, 42, 0.55, 0, false),
    tile('V · V side · 100%', Vcap, Vcap, 42, 1, 0, false),
    tile('H · H side · 55%', Hcap, Hcap, 42, 0.55, 0, false),
    tile('V · V stacked · 55%', Vcap, Vcap, 42, 0.55, 0, true),
  ],
}

const circle = PRESET_SHAPES.find((d) => d.kind === 'preset' && d.preset === 'circle')!
const square = PRESET_SHAPES.find((d) => d.kind === 'preset' && d.preset === 'square')!
const octagon = PRESET_SHAPES.find((d) => d.kind === 'preset' && d.preset === 'octagon')!
const triangle = PRESET_SHAPES.find((d) => d.kind === 'preset' && d.preset === 'triangle')!
const star = PRESET_SHAPES.find((d) => d.kind === 'preset' && d.preset === 'star5')!

const mixed: Section = {
  title: 'Mixed pairs · size 42 · r0',
  note: 'Square+circle, octagon+triangle, stadium+star, H/V T-junctions.',
  tiles: SOFT.flatMap((soft) => {
    const p = `${Math.round(soft * 100)}%`
    return [
      tile(`Square + Circle · ${p} · H`, square, circle, 42, soft, 0, false),
      tile(`Octagon + Triangle · ${p} · H`, octagon, triangle, 42, soft, 0, false),
      tile(`H capsule + Star · ${p} · H`, Hcap, star, 42, soft, 0, false),
      tile(`H then V · ${p} · H`, Hcap, Vcap, 42, soft, 0, false),
      tile(`H then V · ${p} · V`, Hcap, Vcap, 42, soft, 0, true),
    ]
  }),
}

const sections = [mixed, capsuleMix, selfHorizontal, selfVertical, selfSize]
const flagged = sections.flatMap((s) => s.tiles.filter((t) => t.flags.length))

const html = `<!doctype html>
<html lang="en">
<meta charset="utf-8"/>
<title>Gridz self-pair blend matrix</title>
<style>
  body { font: 13px/1.4 ui-sans-serif, system-ui; background: #eef1ef; color: #14202b; margin: 0; padding: 24px; }
  h1 { font-size: 20px; margin: 0 0 8px; }
  h2 { font-size: 15px; margin: 28px 0 6px; }
  .note { color: #5b6b73; margin: 0 0 12px; max-width: 80ch; }
  section { display: flex; flex-wrap: wrap; gap: 10px; }
  figure { margin: 0; background: #fff; border: 1px solid #d5ddd8; border-radius: 10px; padding: 8px; width: 148px; }
  figure.warn { border-color: #c45c26; }
  figcaption { font-size: 11px; color: #5b6b73; margin-top: 6px; }
  svg { display: block; width: 100%; height: auto; }
</style>
<body>
<h1>Self-pair blend matrix</h1>
<p class="note">Live fuse engine. ${sections.reduce((n, s) => n + s.tiles.length, 0)} tiles.
Diagnostic flags: ${flagged.length} (${flagged.map((t) => t.label + ' [' + t.flags.join(',') + ']').join('; ') || 'none'}).</p>
${sections
  .map(
    (s) => `<h2>${s.title}</h2><p class="note">${s.note}</p><section>${s.tiles
      .map(
        (t) =>
          `<figure${t.flags.length ? ' class="warn"' : ''}>${t.svg}<figcaption>${t.label}${
            t.flags.length ? ` · ${t.flags.join(', ')}` : ''
          }</figcaption></figure>`,
      )
      .join('')}</section>`,
  )
  .join('')}
</body></html>
`

writeFileSync('/tmp/gridz-blend-gallery.html', html)
writeFileSync(
  '/tmp/gridz-blend-flags.json',
  JSON.stringify(
    flagged.map((t) => ({ label: t.label, flags: t.flags })),
    null,
    2,
  ),
)
console.log(
  'wrote /tmp/gridz-blend-gallery.html',
  sections.reduce((n, s) => n + s.tiles.length, 0),
  'tiles',
  flagged.length,
  'flagged',
)
