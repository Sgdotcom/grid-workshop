/**
 * Automatic fuse matrix — shapes × size × softness × corners × H/V.
 * Also writes a visual gallery so you don't have to drag sliders.
 *
 *   npm run fuse:matrix
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { cellCenter, cellOrigin } from '@/lib/gridGeometry'
import {
  WELD_TUNING,
  fuseMaxGap,
  makeSoftStamp,
  pairCanFuse,
  stampBlobs,
  softnessFinishContains,
  softnessFinishPathList,
} from '@/lib/softness'
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

type Layout = 'H' | 'V' | 'SE' | 'NE'

function fuseTwo(
  defA: ShapeDef,
  defB: ShapeDef,
  sizeA: number,
  sizeB: number,
  softness: number,
  corner: number,
  layout: Layout,
) {
  const cells: Record<Layout, [[number, number], [number, number]]> = {
    H: [
      [0, 0],
      [1, 0],
    ],
    V: [
      [0, 0],
      [0, 1],
    ],
    SE: [
      [0, 0],
      [1, 1],
    ],
    NE: [
      [0, 1],
      [1, 0],
    ],
  }
  const [ca, cb] = cells[layout]
  const a = stamp(defA, ca[0], ca[1], sizeA, corner)
  const b = stamp(defB, cb[0], cb[1], sizeB, corner)
  return { paths: softnessFinishPathList([a, b], softness), a, b }
}

function pairGap(aContacts: [number, number][], bContacts: [number, number][]) {
  let best = Infinity
  for (const p of aContacts) {
    for (const q of bContacts) {
      const d = Math.hypot(p[0] - q[0], p[1] - q[1])
      if (d < best) best = d
    }
  }
  return best
}

function tileSvg(paths: string[], vertical: boolean, cluster = false, loop = false, diag = false) {
  const innerW = loop ? 124 : cluster || diag ? 82 : vertical ? 40 : 82
  const innerH = loop ? 124 : cluster || diag ? 82 : vertical ? 82 : 40
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
  svg: string
}

function pairCase(
  def: ShapeDef,
  size: number,
  softness: number,
  corner: number,
  vertical: boolean,
): Flag {
  const a = stamp(def, 0, 0, size, corner)
  const b = stamp(def, vertical ? 0 : 1, vertical ? 1 : 0, size, corner)
  const fused = softnessFinishPathList([a, b], softness)
  const flags: string[] = []
  const sub = subpaths(fused)
  const holey = def.kind === 'preset' && def.preset === 'ring'
  const expectJoin = pairCanFuse(a, b, softness, false)
  if (expectJoin && fused.length > 1) flags.push('multi-outline')
  if (expectJoin && fused.length === 0) flags.push('no-fuse')
  if (!expectJoin && fused.length === 1) flags.push('unexpected-fuse')
  if (holey && fused.length === 1 && sub < 2) flags.push('lost-hole')
  const dir = vertical ? 'V' : 'H'
  return {
    label: `${shapeLabel(def)} · ${size}px · r${corner} · ${Math.round(softness * 100)}% · ${dir}`,
    flags,
    paths: fused.length,
    sub,
    svg: tileSvg(fused, vertical),
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
  const expectJoin = stamps.every((s) => stampBlobs(s))
  if (expectJoin && fused.length > 1) flags.push('multi-outline')
  if (expectJoin && fused.length === 0) flags.push('no-fuse')
  return {
    label: `${shapeLabel(def)} · L-cluster · ${size}px · r${corner} · ${Math.round(softness * 100)}%`,
    flags,
    paths: fused.length,
    sub,
    svg: tileSvg(fused, false, true),
  }
}

function loopStamps(def: ShapeDef, size: number, corner: number) {
  const stamps = []
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      if (col === 1 && row === 1) continue
      stamps.push(stamp(def, col, row, size, corner))
    }
  }
  return stamps
}

function loopCase(def: ShapeDef, size: number, softness: number, corner: number): Flag {
  const stamps = loopStamps(def, size, corner)
  const fused = softnessFinishPathList(stamps, softness)
  const { cx, cy } = cellCenter(1, 1, GRID)
  const flags: string[] = []
  const sub = subpaths(fused)
  const expectMelt = stamps.every((s) => stampBlobs(s))
  if (expectMelt && fused.length > 1) flags.push('multi-outline')
  if (expectMelt && fused.length === 0) flags.push('no-fuse')
  if (expectMelt && softnessFinishContains(stamps, softness, cx, cy)) flags.push('filled-hole')
  return {
    label: `${shapeLabel(def)} · enclosure · ${size}px · r${corner} · ${Math.round(softness * 100)}%`,
    flags,
    paths: fused.length,
    sub,
    svg: tileSvg(fused, false, false, true),
  }
}

function comboCase(
  defA: ShapeDef,
  defB: ShapeDef,
  sizeA: number,
  sizeB: number,
  softness: number,
  corner: number,
  layout: Layout,
): Flag {
  const { paths, a, b } = fuseTwo(defA, defB, sizeA, sizeB, softness, corner, layout)
  const flags: string[] = []
  const sub = subpaths(paths)
  const holey =
    (defA.kind === 'preset' && defA.preset === 'ring') ||
    (defB.kind === 'preset' && defB.preset === 'ring')
  const diag = layout === 'SE' || layout === 'NE'
  const expectJoin = pairCanFuse(a, b, softness, diag)
  if (expectJoin && paths.length > 1) flags.push('multi-outline')
  if (expectJoin && paths.length === 0) flags.push('no-fuse')
  if (!expectJoin && paths.length === 1) flags.push('unexpected-fuse')
  if (
    defA.kind === 'preset' &&
    defA.preset === 'ring' &&
    defB.kind === 'preset' &&
    defB.preset === 'ring' &&
    paths.length === 1 &&
    sub < 2
  ) {
    flags.push('lost-hole')
  }
  const sizeLabel = sizeA === sizeB ? `${sizeA}px` : `${sizeA}+${sizeB}px`
  return {
    label: `${shapeLabel(defA)}+${shapeLabel(defB)} · ${sizeLabel} · r${corner} · ${Math.round(softness * 100)}% · ${layout}`,
    flags,
    paths: paths.length,
    sub,
    svg: tileSvg(paths, layout === 'V', false, false, diag || layout === 'NE'),
  }
}

type GalleryTile = { label: string; flags: string[]; svg: string }

function galleryTile(
  label: string,
  paths: string[],
  vertical: boolean,
  flags: string[],
  cluster = false,
  loop = false,
  diag = false,
): GalleryTile {
  return { label, flags, svg: tileSvg(paths, vertical, cluster, loop, diag) }
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

const loopDefs = PRESET_SHAPES.filter(
  (d) => d.kind === 'preset' && ['square', 'circle', 'octagon', 'capsule', 'star5'].includes(d.preset),
)
for (const def of loopDefs) {
  for (const size of [24, 42] as const) {
    cases.push(loopCase(def, size, 1, 0))
  }
}

for (const def of PRESET_SHAPES) {
  for (const size of SIZES) {
    for (const soft of SOFT) {
      for (const corner of CORNERS) {
        cases.push(comboCase(def, def, size, size, soft, corner, 'SE'))
      }
    }
  }
}

for (let i = 0; i < PRESET_SHAPES.length; i++) {
  for (let j = i + 1; j < PRESET_SHAPES.length; j++) {
    for (const soft of [0.35, 1] as const) {
      for (const layout of ['H', 'V', 'SE'] as const) {
        cases.push(comboCase(PRESET_SHAPES[i], PRESET_SHAPES[j], 42, 42, soft, 0, layout))
      }
    }
  }
}

const sizePairs = [
  [24, 42],
  [24, 56],
  [42, 56],
] as const
for (const def of PRESET_SHAPES) {
  for (const [sa, sb] of sizePairs) {
    for (const layout of ['H', 'SE'] as const) {
      cases.push(comboCase(def, def, sa, sb, 1, 0, layout))
    }
  }
}

const flagged = cases.filter((c) => c.flags.length)
const summary = {
  total: cases.length,
  flagged: flagged.length,
  noFuse: flagged.filter((c) => c.flags.includes('no-fuse')).length,
  multi: flagged.filter((c) => c.flags.includes('multi-outline')).length,
  islands: flagged.filter((c) => c.flags.some((f) => f.startsWith('islands'))).length,
  filledHole: flagged.filter((c) => c.flags.includes('filled-hole')).length,
  sample: flagged.slice(0, 80).map((c) => ({ label: c.label, flags: c.flags })),
}

const gallery: { title: string; tiles: GalleryTile[] }[] = []

gallery.push({
  title: flagged.length
    ? `Flagged this run (${flagged.length}) — these are the ones that still split`
    : 'Flagged this run — none',
  tiles: flagged.map((f) => ({ label: f.label, flags: f.flags, svg: f.svg })),
})

gallery.push({
  title: 'Rule · melt only if rounded · 24px @ 100% r0 vs r18 · 42px overlaps even when sharp',
  tiles: ['circle', 'capsule', 'square', 'star5', 'cross', 'x', 'triangle'].flatMap((preset) => {
    const def = PRESET_SHAPES.find((d) => d.kind === 'preset' && d.preset === preset)
    if (!def) return []
    return (
      [
        [24, 0, '24px sharp'],
        [24, 18, '24px r18'],
        [42, 0, '42px overlap'],
      ] as const
    ).map(([size, corner, tag]) => {
      const { paths, a, b } = fuseTwo(def, def, size, size, 1, corner, 'H')
      const flags: string[] = []
      if (pairCanFuse(a, b, 1, false) && paths.length > 1) flags.push('multi-outline')
      return galleryTile(`${shapeLabel(def)} · ${tag}`, paths, false, flags)
    })
  }),
})

{
  const xDef = PRESET_SHAPES.find((d) => d.kind === 'preset' && d.preset === 'x')
  if (xDef) {
    gallery.push({
      title: 'X · both facing arms · 24 / 42 / 56px · H / V · 35 / 100%',
      tiles: ([24, 42, 56] as const).flatMap((size) =>
        ([0.35, 1] as const).flatMap((soft) =>
          (['H', 'V'] as const).map((layout) => {
            const { paths, a, b } = fuseTwo(xDef, xDef, size, size, soft, 0, layout)
            const flags: string[] = []
            const expectJoin = pairCanFuse(a, b, soft, false)
            if (expectJoin && paths.length > 1) flags.push('multi-outline')
            return galleryTile(
              `X · ${size}px · ${Math.round(soft * 100)}% · ${layout}`,
              paths,
              layout === 'V',
              flags,
            )
          }),
        ),
      ),
    })
  }
}

gallery.push({
  title: 'Diagonal · same shape · 42px · r0 · 100%',
  tiles: PRESET_SHAPES.map((def) => {
    const { paths } = fuseTwo(def, def, 42, 42, 1, 0, 'SE')
    const flags: string[] = []
    if (paths.length > 1) flags.push('multi-outline')
    return galleryTile(shapeLabel(def), paths, false, flags, false, false, true)
  }),
})

gallery.push({
  title: 'Diagonal · same shape · 24px · r0 · 100% (wider gap — may stay apart)',
  tiles: PRESET_SHAPES.map((def) => {
    const { paths, a, b } = fuseTwo(def, def, 24, 24, 1, 0, 'SE')
    const flags: string[] = []
    const expectJoin = pairGap(a.contacts, b.contacts) <= fuseMaxGap(24, 1, true)
    if (expectJoin && paths.length > 1) flags.push('multi-outline')
    if (expectJoin && paths.length === 0) flags.push('no-fuse')
    return galleryTile(shapeLabel(def), paths, false, flags, false, false, true)
  }),
})

gallery.push({
  title: 'Mixed shapes · 42px · r0 · 100% · horizontal',
  tiles: PRESET_SHAPES.flatMap((defA, i) =>
    PRESET_SHAPES.slice(i + 1).map((defB) => {
      const { paths } = fuseTwo(defA, defB, 42, 42, 1, 0, 'H')
      const flags: string[] = []
      if (paths.length > 1) flags.push('multi-outline')
      return galleryTile(`${shapeLabel(defA)} + ${shapeLabel(defB)}`, paths, false, flags)
    }),
  ),
})

gallery.push({
  title: 'Mixed shapes · 42px · r0 · 100% · diagonal',
  tiles: PRESET_SHAPES.flatMap((defA, i) =>
    PRESET_SHAPES.slice(i + 1).map((defB) => {
      const { paths } = fuseTwo(defA, defB, 42, 42, 1, 0, 'SE')
      const flags: string[] = []
      if (paths.length > 1) flags.push('multi-outline')
      return galleryTile(`${shapeLabel(defA)} + ${shapeLabel(defB)}`, paths, false, flags, false, false, true)
    }),
  ),
})

gallery.push({
  title: 'Mixed sizes · same shape · 100% · H and diagonal',
  tiles: PRESET_SHAPES.flatMap((def) =>
    (
      [
        [24, 42, 'H'],
        [24, 42, 'SE'],
        [24, 56, 'H'],
        [42, 56, 'H'],
        [42, 56, 'SE'],
      ] as const
    ).map(([sa, sb, layout]) => {
      const { paths } = fuseTwo(def, def, sa, sb, 1, 0, layout)
      const flags: string[] = []
      if (paths.length > 1) flags.push('multi-outline')
      return galleryTile(
        `${shapeLabel(def)} · ${sa}+${sb} · ${layout}`,
        paths,
        layout === 'V',
        flags,
        false,
        false,
        layout === 'SE',
      )
    }),
  ),
})

gallery.push({
  title: 'Asymmetric diagonals · 42px · 100% · SE vs NE',
  tiles: PRESET_SHAPES.filter(
    (d) => d.kind === 'preset' && ['triangle', 'chevron', 'pentagon', 'star5', 'capsule', 'x'].includes(d.preset),
  ).flatMap((def) =>
    (['SE', 'NE'] as const).map((layout) => {
      const { paths } = fuseTwo(def, def, 42, 42, 1, 0, layout)
      const flags: string[] = []
      if (paths.length > 1) flags.push('multi-outline')
      return galleryTile(`${shapeLabel(def)} · ${layout}`, paths, false, flags, false, false, true)
    }),
  ),
})

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
  title: 'Small stamps · 24px · r0 · 100% (rounded melt across the gap; sharp glyphs stay separate)',
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

gallery.push({
  title: 'Enclosed empty cell · 8 stamps around 1 hole · 24px / 42px · 100%',
  tiles: loopDefs.flatMap((def) =>
    [24, 42].map((size) => {
      const stamps = loopStamps(def, size, 0)
      const fused = softnessFinishPathList(stamps, 1)
      const { cx, cy } = cellCenter(1, 1, GRID)
      const flags: string[] = []
      if (fused.length > 1) flags.push('multi-outline')
      if (softnessFinishContains(stamps, 1, cx, cy)) flags.push('filled-hole')
      return galleryTile(`${shapeLabel(def)} · ${size}px`, fused, false, flags, false, true)
    }),
  ),
})

const alreadyRound = new Set(['circle', 'ring', 'capsule', 'capsuleV'])
const roundable = PRESET_SHAPES.filter((d) => d.kind === 'preset' && !alreadyRound.has(d.preset))

function outlineGap(
  def: ShapeDef,
  size: number,
  corner: number,
  vertical: boolean,
): number {
  const a = stamp(def, 0, 0, size, corner)
  const b = stamp(def, vertical ? 0 : 1, vertical ? 1 : 0, size, corner)
  let best = Infinity
  for (const p of a.contacts) {
    for (const q of b.contacts) {
      const d = Math.hypot(p[0] - q[0], p[1] - q[1])
      if (d < best) best = d
    }
  }
  return best
}

const roundCmp = roundable.flatMap((def) =>
  [24, 42].map((size) => {
    const gaps = [0, 8, 18].map((corner) => ({
      corner,
      gap: +outlineGap(def, size, corner, false).toFixed(2),
    }))
    return {
      label: shapeLabel(def),
      size,
      gaps,
      gapDrop: +(gaps[0].gap - gaps[2].gap).toFixed(2),
    }
  }),
)

gallery.push({
  title: 'Hypothesis G · sharp vs rounded · 42px · 100% H · r0 / r8 / r18',
  tiles: roundable.flatMap((def) =>
    [0, 8, 18].map((corner) => {
      const fused = fusePair(def, 42, 1, corner, false)
      const flags: string[] = []
      if (fused.length > 1) flags.push('multi-outline')
      return galleryTile(`${shapeLabel(def)} · r${corner}`, fused, false, flags)
    }),
  ),
})

gallery.push({
  title: 'Hypothesis G · sharp vs rounded · 24px · 100% H · r0 / r8 / r18',
  tiles: roundable.flatMap((def) =>
    [0, 8, 18].map((corner) => {
      const fused = fusePair(def, 24, 1, corner, false)
      const flags: string[] = []
      if (fused.length > 1) flags.push('multi-outline')
      return galleryTile(`${shapeLabel(def)} · r${corner}`, fused, false, flags)
    }),
  ),
})

/** Run history, so an open tab shows each iteration and the knobs it used. */
const RUNS_PATH = '/tmp/gridz-fuse-runs.json'
type Run = {
  at: string
  flagged: number
  multi: number
  islands: number
  tuning: typeof WELD_TUNING
}
let runs: Run[] = []
try {
  runs = JSON.parse(readFileSync(RUNS_PATH, 'utf8')) as Run[]
} catch {
  runs = []
}
runs.unshift({
  at: new Date().toLocaleTimeString(),
  flagged: summary.flagged,
  multi: summary.multi,
  islands: summary.islands,
  tuning: { ...WELD_TUNING },
})
runs = runs.slice(0, 14)
writeFileSync(RUNS_PATH, JSON.stringify(runs, null, 2))

const runRows = runs
  .map(
    (r, i) =>
      `<tr class="${i === 0 ? 'now' : ''}"><td>${i === 0 ? 'latest' : `-${i}`}</td><td>${r.at}</td><td>${
        r.flagged === 0 ? 'green' : `${r.flagged} flagged`
      }</td><td>${r.multi}</td><td>${r.islands}</td><td>arc ${r.tuning.arcBase}+${r.tuning.arcSoft}s · handle ${r.tuning.handle} · pinch ${r.tuning.pinch} · thin ${r.tuning.waistThin}</td></tr>`,
  )
  .join('\n')

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
  figure { margin: 0; width: 150px; }
  figcaption { font-size: 11px; margin-top: 4px; }
  .bad figcaption { color: #0000ee; }
  .meta { color: #333; font-size: 13px; }
  table.runs { border-collapse: collapse; font-size: 12px; margin: 8px 0 4px; }
  table.runs th, table.runs td { border: 1px solid #ddd; padding: 3px 8px; text-align: left; }
  table.runs tr.now { background: #eef; font-weight: bold; }
</style>
</head>
<body>
<h1>Fuse matrix</h1>
<p class="meta">${summary.total} numeric cases · ${summary.flagged} flagged · ${summary.multi} multi-outline · ${summary.islands} islands · auto-reloads · <a href="http://127.0.0.1:43127/">Paint app</a> · <a href="/gridz-weld-zoom.html">weld zoom</a></p>
<table class="runs">
<tr><th>run</th><th>at</th><th>result</th><th>multi</th><th>islands</th><th>weld knobs</th></tr>
${runRows}
</table>
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
<script>
// Keep an open tab in sync with re-runs, at the same scroll position.
const KEY = 'gridz-fuse-scroll'
const back = sessionStorage.getItem(KEY)
if (back) window.scrollTo(0, +back)
addEventListener('scroll', () => sessionStorage.setItem(KEY, String(scrollY)), { passive: true })
let epoch = null
setInterval(async () => {
  try {
    const seen = await fetch('/gridz-fuse-epoch.txt?t=' + Date.now()).then((r) => r.text())
    if (epoch && seen && seen !== epoch) location.reload()
    epoch = seen ?? epoch
  } catch {}
}, 1200)
</script>
</body>
</html>`

writeFileSync('/tmp/gridz-fuse-matrix.json', JSON.stringify({ summary, flagged, roundCmp }, null, 2))
writeFileSync('/tmp/gridz-fuse-matrix.html', html)
writeFileSync('/tmp/gridz-fuse-epoch.txt', String(Date.now()))
console.log(JSON.stringify({ ...summary, gallery: '/tmp/gridz-fuse-matrix.html' }, null, 2))
