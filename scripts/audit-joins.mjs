// Repeatable geometry review; does not alter the workshop or saved preferences.
// node scripts/audit-joins.mjs [--sweep]
// --report-only rebuilds the review from the last cached baseline.
import { createJiti } from 'jiti'
import { measure } from './join-geometry.mjs'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const jiti = createJiti(import.meta.url, { alias: { '@': `${root}src` } })
const { compareJoin, JOIN_CASES, JOIN_METHODS } = await jiti.import('../src/lib/joinExperiments.ts')
const { PRESET_SHAPES } = await jiti.import('../src/lib/types.ts')
const settings = { size: 37, softness: 1, roundedness: 2, radius: 1, neck: 1 }
const rows = []
const reportOnly = process.argv.includes('--report-only')
const cached = process.argv.includes('--remeasure') || reportOnly ? JSON.parse(readFileSync('/tmp/gridz-join-audit.json')).rows : []
for (const shape of PRESET_SHAPES) {
  for (const layout of JOIN_CASES) {
    for (const method of JOIN_METHODS) {
      try {
        const previous = cached.find(row => row.shape === shape.id && row.layout === layout.id && row.method === method.id && !row.error)
        if (reportOnly && previous) { rows.push(previous); continue }
        const result = previous || compareJoin(shape, layout.cells, settings, method.id)
        const row = { shape: shape.id, label: shape.label, layout: layout.id, method: method.id, paths: result.paths, outlines: result.outlines }
        try { Object.assign(row, measure(result, layout.id)) }
        catch (error) { row.metricsError = error.message }
        rows.push(row)
      } catch (error) {
        rows.push({ shape: shape.id, label: shape.label, layout: layout.id, method: method.id, paths: [], outlines: [], error: error.message })
      }
    }
  }
  console.log(`Reviewed ${shape.label}`)
}
writeFileSync('/tmp/gridz-join-audit.json', JSON.stringify({ settings, rows }))
const svg = row => `<svg viewBox="-12 -12 106 106" aria-label="${row.label}, ${row.layout}, ${row.method}">${row.paths.map(d => `<path d="${d}" fill="black" fill-rule="evenodd"/>`).join('')}</svg>`
const beforeRows = JSON.parse(readFileSync(new URL('./fixtures/weld-before.json', import.meta.url)))
const remainingBaseline = rows.filter(row => row.method === 'weld' && row.asymmetryPercent > 0.5).length
const examples = [
  ['preset-square', 'horizontal', 'Centred square joins', 'The weld now uses the middle of the facing edges.'],
  ['preset-square', 'diagonal-right', 'Keep the diagonal melt', 'The curved diagonal connection remains.'],
  ['preset-x', 'horizontal', 'Both facing arms', 'Where two real attachment sites mirror each other, both participate in the join.'],
].map(([shape, layout, title, description]) => `<article><h2>${title}</h2><p>${description}</p><div class="comparison">${[beforeRows, rows].map((source, index) => `<figure><figcaption>${index ? 'Updated outline weld' : 'Before'}</figcaption>${svg(source.find(row => row.shape === shape && row.layout === layout && (!row.method || row.method === 'weld')))}</figure>`).join('')}</div></article>`).join('')
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Shape blend audit</title>
<style>body{font:14px Arial;margin:24px;color:#111;background:white}h1{font-size:24px}h2{font-size:18px;margin:24px 0 8px}nav{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0}button{font:inherit;padding:8px;background:white;border:1px solid #bbb;cursor:pointer}button[aria-pressed=true]{background:#111;color:white}section{display:none}section.active{display:block}.grid{display:grid;grid-template-columns:95px repeat(6,minmax(90px,1fr));align-items:center;gap:5px;max-width:1200px}.label{font-weight:bold}figure{margin:0;border-bottom:1px solid #ddd}svg{display:block;width:100%;height:110px}small{display:block;font-size:10px;color:#555;padding-bottom:8px}.head{font-size:11px;color:#555}.error{color:#a00}p{max-width:850px;line-height:1.5}</style>
<style>.examples{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:24px;max-width:1150px}.examples p{min-height:64px}.comparison{display:grid;grid-template-columns:1fr 1fr;gap:12px}.comparison svg{height:160px}.comparison figcaption{font-size:12px;color:#555}.verdict{border-left:3px solid #111;padding-left:18px;margin:24px 0}details{margin-top:32px}summary{cursor:pointer;font-weight:bold;padding:14px 0}li{line-height:1.5;margin:6px 0}</style>
<h1>Centred welds: before and after.</h1>
<p>The shared outline-weld calculation has been updated. All 16 presets are compared in six arrangements below; ${remainingBaseline} symmetric-pair alignment flags remain at the review settings. The workshop uses this correction wherever it already uses outline welds. Its existing rules for which shapes may blend remain in place.</p>
<div class="verdict"><p><strong>Flat faces now have central attachment points.</strong> Rounded outlines also sample the middle of straight edges. The weld walks an exact distance along each outline rather than stopping at different samples on each side.</p><p><strong>Concave shapes can use both facing contacts.</strong> Mirrored contacts are used only when both lie on the real outlines. A numerical retry also prevents valid joins from being silently dropped during merging.</p><p><strong>Broader edge cases remain under investigation.</strong> Some overlapping or low-softness configurations still need work. The baseline below is a visual comparison, not a claim that every possible setting is finished. See GEMINI-HANDOFF.md for the latest verification and remaining cases.</p></div>
<div class="examples">${examples}</div>
<details><summary>Supporting gallery: all 16 shapes and five methods</summary>
<p>Horizontal, vertical, both diagonals, L and block clusters.<br>Stamp 37 · Softness 1 · Roundedness 2 · Circle size and neck strength 1. These match the settings being reviewed on 23 September 2026.</p>
<p>Black is the actual filled result. “Parts” counts connected filled components, not SVG path elements. Centring is measured only when the original pair is symmetric across its join axis. This is a review snapshot; it does not change workshop behaviour.</p>
<nav>${JOIN_METHODS.map((m, i) => `<button aria-pressed="${i === 1}" data-method="${m.id}">${m.label}</button>`).join('')}</nav>
${JOIN_METHODS.map((method, i) => `<section id="${method.id}" class="${i === 1 ? 'active' : ''}"><h2>${method.label}</h2><div class="grid"><div></div>${JOIN_CASES.map(c => `<div class="head">${c.label}</div>`).join('')}${PRESET_SHAPES.map(shape => `<div class="label">${shape.label}</div>${JOIN_CASES.map(layout => { const row = rows.find(r => r.shape === shape.id && r.layout === layout.id && r.method === method.id); return `<figure>${svg(row)}<small>${row.error || row.metricsError ? `<span class="error">${row.error || 'Measurement unavailable'}</span>` : `${row.components} parts · ${row.holes} holes${row.asymmetryPercent > 0.1 ? ` · asymmetry ${row.asymmetryPercent.toFixed(1)}%` : ''}`}</small></figure>` }).join('')}`).join('')}</div></section>`).join('')}</details>
<script>document.querySelectorAll('button').forEach(button=>button.onclick=()=>{document.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));document.querySelectorAll('section').forEach(s=>s.classList.toggle('active',s.id===button.dataset.method));});</script></html>`
writeFileSync(`${root}docs/join-audit.html`, html)
console.log(`Baseline: ${rows.length} cases, ${rows.filter(r => r.error).length} errors. Gallery: docs/join-audit.html`)

if (process.argv.includes('--sweep')) {
  const sweep = []
  for (const shape of PRESET_SHAPES) {
    for (const size of [24, 37, 56]) for (const softness of [0.2, 0.55, 1]) for (const roundedness of [0, 2, 12]) {
      for (const layout of JOIN_CASES) for (const method of ['weld', 'metaball']) {
        const config = { ...settings, size, softness, roundedness }
        try {
          const result = compareJoin(shape, layout.cells, config, method)
          sweep.push({ shape: shape.id, layout: layout.id, method, ...config, ...measure(result, layout.id) })
        } catch (error) {
          sweep.push({ shape: shape.id, layout: layout.id, method, ...config, error: error.message })
        }
      }
    }
    console.log(`Swept ${shape.label}`)
  }
  writeFileSync('/tmp/gridz-join-sweep.json', JSON.stringify(sweep))
  console.log(`Sweep: ${sweep.length} cases, ${sweep.filter(r => r.error).length} errors.`)
}
