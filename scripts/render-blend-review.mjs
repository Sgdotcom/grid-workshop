// Fresh, side-by-side visual review. Does not change workshop blending.
import { createJiti } from 'jiti'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../', import.meta.url))
const jiti = createJiti(import.meta.url, { alias: { '@': `${root}src` } })
const { compareJoin, JOIN_CASES } = await jiti.import('../src/lib/joinExperiments.ts')
const { PRESET_SHAPES } = await jiti.import('../src/lib/types.ts')
const settings = { size: 37, softness: 1, roundedness: 2, radius: 1, neck: 1 }
const svg = (shape, layout, method) => {
  const { paths } = compareJoin(shape, layout.cells, settings, method)
  return `<svg viewBox="-5 -5 94 94" role="img" aria-label="${shape.label}, ${layout.label}, ${method}">${paths.map(d => `<path d="${d}" fill-rule="evenodd"/>`).join('')}</svg>`
}
const groups = Array.from({ length: Math.ceil(PRESET_SHAPES.length / 2) }, (_, index) => PRESET_SHAPES.slice(index * 2, index * 2 + 2))
const notes = {
  arc: 'The workshop has the approved arc fix. This row compares the raw experimental methods; it does not include the workshop’s protected body merge.',
  wedge: 'Needs further work: unequal-size welds can lose body area. No new wedge treatment has been approved.',
  notch: 'Needs further work: preserve the open mouth and check mixed-shape joins for detached ink.',
  circle: 'Prefer inner-circle melt: smoother waists. The tiny L-cluster opening still needs attention.',
  square: 'Keep outline weld as the square reference. Small edge notches remain; diagonal joins are the strongest result.',
  rect: 'Neither is ready across all layouts. Weld avoids the narrow stems of inner-circle melt, but its clusters have sliver openings.',
  capsule: 'Neither is ready across all layouts. Weld has fuller diagonal joins; both methods leave unwanted small cluster openings.',
  capsuleV: 'Neither is ready across all layouts. Weld avoids the pinched diagonal neck, but cluster openings remain.',
  octagon: 'Prefer inner-circle melt for the smoother horizontal and vertical waist. Cluster pinholes still need attention.',
  diamond: 'Neither is ready across all layouts. Weld makes diagonal pairs almost bar-shaped; inner-circle melt creates pinched necks and a cluster lattice.',
  triangle: 'Neither is ready. Weld distorts the silhouette; inner-circle melt leaves diagonal pairs apart and gives vertical pairs a thin stem.',
  hexagon: 'Weld is the less awkward candidate here, but thin L-cluster openings and sudden changes at corners still need work.',
  pentagon: 'Neither is ready across all layouts. Narrow vertical waists and small cluster openings persist.',
  star5: 'Neither is ready. Weld adds thin diagonal struts and a lattice; inner-circle melt leaves diagonal pairs apart.',
  star4: 'Neither is ready. Weld adds straight struts; inner-circle melt does not connect these pairs at this setting.',
  cross: 'Neither is ready. Weld introduces diagonal bars through clusters; inner-circle melt leaves diagonal pairs apart.',
  x: 'Neither is ready. Weld produces oval openings and diagonal struts; inner-circle melt leaves diagonal pairs apart.',
  chevron: 'Neither is ready. Weld creates extra loops and struts; inner-circle melt leaves the shapes apart.',
  ring: 'Prefer inner-circle melt: smooth joins and the original ring holes remain open. The extra L-cluster pinhole needs attention.',
}
const shortlist = [['circle', 'metaball'], ['square', 'weld'], ['octagon', 'metaball'], ['ring', 'metaball']]
const candidates = shortlist.map(([preset, method]) => {
  const shape = PRESET_SHAPES.find(s => s.preset === preset)
  return `<article><h2>${shape.label} · ${method === 'weld' ? 'Outline weld' : 'Inner-circle melt'}</h2><div class="grid"><span class="method">${shape.label}</span>${JOIN_CASES.map(layout => svg(shape, layout, method)).join('')}</div></article>`
}).join('')
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Blend visual review</title>
<style>*{box-sizing:border-box}body{font:14px system-ui;margin:24px;color:#171717;background:#fff}h1{font-size:24px;margin:0 0 8px}p{line-height:1.5;margin:8px 0}nav{display:flex;flex-wrap:wrap;gap:6px;margin:16px 0}button{font:inherit;background:white;border:1px solid #bbb;padding:8px 10px;cursor:pointer}button[aria-pressed=true]{background:#171717;color:white}section[hidden]{display:none}article{border-top:1px solid #ddd;padding:10px 0}h2{font-size:17px;margin:0 0 8px}.grid{display:grid;grid-template-columns:90px repeat(6,minmax(65px,1fr));gap:6px;align-items:center}.head{font-size:11px;color:#666;text-align:center}.method{font-size:12px}svg{width:100%;height:88px;display:block}a{color:inherit}.note{color:#555;font-size:12px}#verdict{max-width:1000px}</style>
<h1>Which blends actually look better?</h1><p>Outline weld and inner-circle melt, side by side for every shape. Size 37 · Softness 1 · Roundedness 2.</p><p class="note">Review candidates only. The workshop has not switched algorithms. Small openings, abrupt shoulders and missing joins count against a result.</p>
<nav><button data-page="picks" aria-pressed="true">Strongest candidates</button>${groups.map((shapes, index) => `<button data-page="${index}" aria-pressed="false">${shapes.map(s => s.label).join(' / ')}</button>`).join('')}</nav>
<section data-group="picks"><p>My visual shortlist at these settings—not a finished universal solution. Circle, octagon and ring favour inner-circle melt; square keeps outline weld. Other shapes still need work. Small cluster openings remain even in this shortlist.</p><div class="grid"><span></span>${JOIN_CASES.map(c => `<span class="head">${c.label}</span>`).join('')}</div>${candidates}</section>
${groups.map((shapes, index) => `<section data-group="${index}" hidden>${shapes.map(shape => `<article><h2>${shape.label}</h2><p class="note">${notes[shape.preset]}</p><div class="grid"><span></span>${JOIN_CASES.map(c => `<span class="head">${c.label}</span>`).join('')}${[['weld', 'Outline weld'], ['metaball', 'Inner-circle melt']].map(([method, label]) => `<span class="method">${label}</span>${JOIN_CASES.map(layout => svg(shape, layout, method)).join('')}`).join('')}</div></article>`).join('')}</section>`).join('')}
<script>document.querySelectorAll('button').forEach(button=>button.onclick=()=>{document.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));document.querySelectorAll('section').forEach(s=>s.hidden=s.dataset.group!==button.dataset.page);});</script></html>`
writeFileSync(`${root}docs/blend-visual-review.html`, html)
// Vite serves public/docs ahead of the workspace docs path. Keep its copy fresh.
mkdirSync(`${root}public/docs`, { recursive: true })
writeFileSync(`${root}public/docs/blend-visual-review.html`, html)
console.log(`Rendered ${PRESET_SHAPES.length * JOIN_CASES.length * 2} fresh blends: ${PRESET_SHAPES.length} shapes × ${JOIN_CASES.length} arrangements × 2 methods.`)
