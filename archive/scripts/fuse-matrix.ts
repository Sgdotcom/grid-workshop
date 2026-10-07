/**
 * Automatic fuse matrix — shapes × size × softness × corners × H/V.
 * Also writes a visual gallery so you don't have to drag sliders.
 *
 *   npm run fuse:matrix
 */
import { writeFileSync } from 'node:fs'
import { cellCenter, cellOrigin } from '@/lib/gridGeometry'
import { makeSoftStamp, softnessFinishPathList } from '@/lib/softness'
import { PRESET_SHAPES, shapeLabel, type ShapeDef } from '@/lib/types'

const GRID = { cols: 3, rows: 3, cellSize: 40, gap: 2 }
const SOFT = [0.35, 0.55, 1]
const SIZES = [24, 42, 56]
const CORNERS = [0, 8, 18]
const INK = '#000000'
const PAPER = '#ffffff'
const PAD = 10

function stamp(def: ShapeDef, col: number, row: number, size: number, corner: number) {
  const { cx, cy } = cellCenter(col, row, GRID)
  const { x, y } = cellOrigin(col, row, GRID)
  const ox = x + (GRID.cellSize - size) / 2
  const oy = y + (GRID.cellSize - size) / 2
  return makeSoftStamp(`${def.id}:${col}:${row}:${size}:${corner}`, col, row, cx, cy, size, def, ox, oy, corner)
}

function subpaths(paths: string[]) {
  return paths.reduce((n, d) => n + (d.match(/M /g)?.length ?? 0), 0)
}

function fusePair(def: ShapeDef, size: number, softness: number, corner: number, vertical: boolean) {
  const a = stamp(def, 0, 0, size, corner)
  const b = stamp(def, vertical ? 0 : 1, vertical ? 1 : 0, size, corner)
  return softnessFinishPathList([a, b], softness)
}

function tileSvg(paths: string[], vertical: boolean, cluster = false) {
  const innerW = cluster ? 82 : vertical ? 40 : 82
  const innerH = cluster ? 82 : vertical ? 82 : 40
  const w = innerW + PAD * 2
  const h = innerH + PAD * 2
  const body = paths
    .map((d) => `<path d="${d}" fill="${INK}" fill-rule="evenodd" transform="translate(${PAD} ${PAD})"/>`)
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w * 1.7}" height="${h * 1.7}">
    <rect width="${w}" height="${h}" fill="${PAPER}"/>
    ${body}
  </svg>`
}

type Flag = {
  label: string
  flags: string[]
  paths: number
  sub: number
}

function pairCase(
  def: ShapeDef,
  size: number,
  softness: number,
  corner: number,
  vertical: boolean,
): Flag {
  const fused = fusePair(def, size, softness, corner, vertical)
  const flags: string[] = []
  const sub = subpaths(fused)
  const holey = def.kind === 'preset' && def.preset === 'ring'
  const expectSeparate = size <= 28 && softness < 0.95
  if (!expectSeparate && fused.length > 1) flags.push('multi-outline')
  if (!expectSeparate && fused.length === 0) flags.push('no-fuse')
  if (fused.length === 1 && sub > (holey ? 3 : 1)) flags.push(`islands:${sub}`)
  const dir = vertical ? 'V' : 'H'
  return {
    label: `${shapeLabel(def)} · ${size}px · r${corner} · ${Math.round(softness * 100)}% · ${dir}`,
    flags,
    paths: fused.length,
    sub,
  }
}

function clusterCase(def: ShapeDef, size: number, softness: number, corner: number): Flag {
  const stamps = [
    stamp(def, 0, 0, size, corner),
    stamp(def, 1, 0, size, corner),
    stamp(def, 0, 1, size, corner),
  ]
  const fused = softnessFinishPathList(stamps, softness)
  const flags: string[] = []
  const sub = subpaths(fused)
  if (fused.length > 1) flags.push('multi-outline')
  if (sub > 2) flags.push(`islands:${sub}`)
  if (fused.length === 0) flags.push('no-fuse')
  return {
    label: `${shapeLabel(def)} · L-cluster · ${size}px · r${corner} · ${Math.round(softness * 100)}%`,
    flags,
    paths: fused.length,
    sub,
  }
}

type GalleryTile = { label: string; flags: string[]; svg: string }

function galleryTile(
  label: string,
  paths: string[],
  vertical: boolean,
  flags: string[],
  cluster = false,
): GalleryTile {
  return { label, flags, svg: tileSvg(paths, vertical, cluster) }
}

const cases: Flag[] = []
for (const def of PRESET_SHAPES) {
  for (const size of SIZES) {
    for (const soft of SOFT) {
      for (const corner of CORNERS) {
        cases.push(pairCase(def, size, soft, corner, false))
        cases.push(pairCase(def, size, soft, corner, true))
      }
    }
  }
}

const clusterDefs = PRESET_SHAPES.filter(
  (d) => d.kind === 'preset' && ['square', 'octagon', 'star5', 'cross', 'capsule', 'circle'].includes(d.preset),
)
for (const def of clusterDefs) {
  for (const soft of SOFT) {
    cases.push(clusterCase(def, 42, soft, 0))
    cases.push(clusterCase(def, 42, soft, 8))
  }
}

const flagged = cases.filter((c) => c.flags.length)
const summary = {
  total: cases.length,
  flagged: flagged.length,
  noFuse: flagged.filter((c) => c.flags.includes('no-fuse')).length,
  multi: flagged.filter((c) => c.flags.includes('multi-outline')).length,
  islands: flagged.filter((c) => c.flags.some((f) => f.startsWith('islands'))).length,
  sample: flagged.slice(0, 80).map((c) => ({ label: c.label, flags: c.flags })),
}

const gallery: { title: string; tiles: GalleryTile[] }[] = []

gallery.push({
  title: 'Every shape · 42px · r0 · horizontal · 35 / 55 / 100%',
  tiles: SOFT.flatMap((soft) =>
    PRESET_SHAPES.map((def) => {
      const fused = fusePair(def, 42, soft, 0, false)
      const flags: string[] = []
      if (fused.length > 1) flags.push('multi-outline')
      return galleryTile(`${shapeLabel(def)} · ${Math.round(soft * 100)}%`, fused, false, flags)
    }),
  ),
})

gallery.push({
  title: 'Every shape · 42px · r0 · vertical · 100%',
  tiles: PRESET_SHAPES.map((def) => {
    const fused = fusePair(def, 42, 1, 0, true)
    const flags: string[] = []
    if (fused.length > 1) flags.push('multi-outline')
    return galleryTile(`${shapeLabel(def)} · V`, fused, true, flags)
  }),
})

gallery.push({
  title: 'Small stamps · 24px · r0 · 100% (should blob across the 18px gap)',
  tiles: PRESET_SHAPES.map((def) => {
    const fused = fusePair(def, 24, 1, 0, false)
    const flags: string[] = []
    if (fused.length > 1) flags.push('multi-outline')
    return galleryTile(shapeLabel(def), fused, false, flags)
  }),
})

const hCap = PRESET_SHAPES.find((d) => d.kind === 'preset' && d.preset === 'capsule')
const vCap = PRESET_SHAPES.find((d) => d.kind === 'preset' && d.preset === 'capsuleV')
if (hCap && vCap) {
  gallery.push({
    title: 'H capsule next to V capsule · 42px',
    tiles: SOFT.flatMap((soft) =>
      [false, true].map((vertical) => {
        const a = stamp(hCap, 0, 0, 42, 0)
        const b = stamp(vCap, vertical ? 0 : 1, vertical ? 1 : 0, 42, 0)
        const fused = softnessFinishPathList([a, b], soft)
        const flags: string[] = []
        if (fused.length > 1) flags.push('multi-outline')
        return galleryTile(`H+V · ${Math.round(soft * 100)}% · ${vertical ? 'V' : 'H'}`, fused, vertical, flags)
      }),
    ),
  })
}

gallery.push({
  title: 'L-clusters · 42px · r0 · 100%',
  tiles: clusterDefs.map((def) => {
    const stamps = [stamp(def, 0, 0, 42, 0), stamp(def, 1, 0, 42, 0), stamp(def, 0, 1, 42, 0)]
    const fused = softnessFinishPathList(stamps, 1)
    const flags: string[] = []
    if (fused.length > 1) flags.push('multi-outline')
    return galleryTile(shapeLabel(def), fused, false, flags, true)
  }),
})

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Gridz fuse matrix</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; background: #fff; color: #000; margin: 24px; }
  h1 { font-size: 20px; }
  h2 { font-size: 15px; margin: 28px 0 10px; }
  .row { display: flex; flex-wrap: wrap; gap: 10px; }
  figure { margin: 0; width: 140px; }
  figcaption { font-size: 11px; margin-top: 4px; }
  .bad figcaption { color: #0000ee; }
  .meta { color: #333; font-size: 13px; }
</style>
</head>
<body>
<h1>Fuse matrix</h1>
<p class="meta">${summary.total} numeric cases · ${summary.flagged} flagged · ${summary.multi} multi-outline · ${summary.islands} islands</p>
${gallery
  .map(
    (section) => `<h2>${section.title}</h2>
<div class="row">
${section.tiles
  .map(
    (t) => `<figure class="${t.flags.length ? 'bad' : ''}">${t.svg}<figcaption>${t.label}${t.flags.length ? ' · ' + t.flags.join(', ') : ''}</figcaption></figure>`,
  )
  .join('\n')}
</div>`,
  )
  .join('\n')}
</body>
</html>`

writeFileSync('/tmp/gridz-fuse-matrix.json', JSON.stringify({ summary, flagged }, null, 2))
writeFileSync('/tmp/gridz-fuse-matrix.html', html)
console.log(JSON.stringify({ ...summary, gallery: '/tmp/gridz-fuse-matrix.html' }, null, 2))
