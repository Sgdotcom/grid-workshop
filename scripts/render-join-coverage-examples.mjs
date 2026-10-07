// Render a few independently reproducible cases from the extended audit.
import { createJiti } from 'jiti'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../', import.meta.url))
const jiti = createJiti(import.meta.url, { alias: { '@': `${root}src` } })
const { PRESET_SHAPES } = await jiti.import('../src/lib/types.ts')
const { makeSoftStamp, organicWeld, softnessFinishPathList } = await jiti.import('../src/lib/softness.ts')
const { toPolygon, unionPolygons, differencePolygons, multiPolygonToPathList } = await jiti.import('../src/lib/polyBool.ts')
const make = (shape, col, row, size, corners) => makeSoftStamp(`${col}:${row}`, col, row,
  20 + col * 42, 20 + row * 42, size, shape, 20 + col * 42 - size / 2, 20 + row * 42 - size / 2, corners)
function weld(stamps) {
  const originals = stamps.map(stamp => toPolygon(stamp.rings))
  const holes = stamps.flatMap(stamp => stamp.rings.slice(1).map(ring => toPolygon([ring])))
  const result = unionPolygons([...originals, ...organicWeld(stamps[0], stamps[1], 1)])
  return multiPolygonToPathList(holes.length ? differencePolygons(result, holes) : result)
}
const shape = id => PRESET_SHAPES.find(candidate => candidate.id === id)
const mixed = [make(shape('preset-circle'), 0, 1, 37, 2), make(shape('preset-star4'), 1, 0, 37, 2)]
const rings = [make(shape('preset-square'), 0, 0, 56, 2), make(shape('preset-ring'), 1, 0, 24, 2)]
const custom = { id: 'custom-star-3-0.15', kind: 'star', label: '3-star', points: 3, innerRatio: 0.15, cornerRadius: 0 }
const stars = [make(custom, 0, 0, 37, 0), make(custom, 0, 1, 37, 0)]
const cases = [
  { title: 'Same positions, different processing order', detail: 'B · Circle + 4-star · diagonal ↙ · sizes 37/37 · Softness 1 · corners 2. No stamps move between the two images.', panels: [['Circle processed first', weld(mixed)], ['4-star processed first', weld([...mixed].reverse())]] },
  { title: 'Small ring loses a slice of its hole', detail: 'Workshop output · square 56 + ring 24 · horizontal · Softness 1 · corners 2. Blue marks the original inner ring boundary.', panels: [['Workshop', softnessFinishPathList(rings, 1)], ['B with the full hole protected', weld(rings)]], holes: multiPolygonToPathList([toPolygon([rings[1].rings[1]])]) },
  { title: 'Custom shape: same order issue', detail: 'B · 3-point star, inner ratio 0.15 · vertical · sizes 37/37 · Softness 1 · corners 0.', panels: [['Top stamp processed first', weld(stars)], ['Bottom stamp processed first', weld([...stars].reverse())]] },
]
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Additional blend checks</title><style>body{font:15px Arial;margin:24px;background:white;color:#111;max-width:1100px}h1{font-size:24px}h2{font-size:18px}p{line-height:1.5;max-width:820px}.examples{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:26px}article{border-top:1px solid #ccc;margin-top:20px}figure{margin:16px 0}svg{display:block;width:100%;height:190px}figcaption{font-size:13px;color:#555}</style><h1>Two new issues from broader testing</h1><p>These examples reproduce order-dependent experimental welds and partial ring-hole filling in the workshop. The geometry engine was not changed during this test pass.</p><div class="examples">${cases.map(c=>`<article><h2>${c.title}</h2><p>${c.detail}</p>${c.panels.map(([label,paths])=>`<figure><figcaption>${label}</figcaption><svg viewBox="-15 -15 110 110">${paths.map(d=>`<path d="${d}" fill="black" fill-rule="evenodd"/>`).join('')}${(c.holes||[]).map(d=>`<path d="${d}" fill="none" stroke="#2469b4" stroke-width="0.35"/>`).join('')}</svg></figure>`).join('')}</article>`).join('')}</div></html>`
writeFileSync(`${root}docs/join-extended-examples.html`, html)
console.log('Wrote docs/join-extended-examples.html')
