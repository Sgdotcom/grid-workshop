/**
 * Isolated mixed-shape weld preview. Does NOT change workshop blending.
 *
 * Compares four join methods on unlike adjacent stamps:
 *   Current  — live workshop softnessFinishPathList
 *   Weld     — organic cubic outline weld + body union
 *   SDF      — distance-field melt
 *   Offset   — expand / union / shrink (same family as approved arc/flat)
 *
 * Usage: node scripts/render-mixed-weld-preview.mjs
 * Open:  http://127.0.0.1:43127/docs/mixed-weld-preview.html
 */
import { createJiti } from 'jiti'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const jiti = createJiti(import.meta.url, { alias: { '@': `${root}src` } })

const { makeSoftStamp, organicWeld, softnessFinishPathList } = await jiti.import(
  '../src/lib/softness.ts',
)
const { cellCenter, cellOrigin } = await jiti.import('../src/lib/gridGeometry.ts')
const {
  differencePolygons,
  multiPolygonToPathList,
  toPolygon,
  unionPolygons,
} = await jiti.import('../src/lib/polyBool.ts')
const { fieldBlend } = await jiti.import('../src/lib/fieldExperiments.ts')
const { PRESET_SHAPES } = await jiti.import('../src/lib/types.ts')

const SIZE = 37
const ROUNDEDNESS = 2
const SOFTNESS_LEVELS = [
  { id: 'melt', label: 'Softness 55% (Melt)', value: 0.55 },
  { id: 'full', label: 'Softness 100%', value: 1 },
]

const LAYOUTS = [
  { id: 'horizontal', label: 'Horizontal', cells: [[0, 0], [1, 0]] },
  { id: 'vertical', label: 'Vertical', cells: [[0, 0], [0, 1]] },
  { id: 'diagonal-right', label: 'Diagonal ↘', cells: [[0, 0], [1, 1]] },
  { id: 'elbow', label: 'L cluster', cells: [[0, 0], [1, 0], [0, 1]] },
]

/** Worst mixed pairs first — common workshop mixes + handover problem cases. */
const MIXED_PAIRS = [
  { a: 'triangle', b: 'square', group: 'sharp-flat', note: 'Tip / flat contact; current often leaves a bar or no melt.' },
  { a: 'diamond', b: 'square', group: 'sharp-flat', note: 'Vertex into flat; waist tends to flatten.' },
  { a: 'triangle', b: 'circle', group: 'sharp-round', note: 'Point meets curve; silhouette should stay triangular.' },
  { a: 'diamond', b: 'circle', group: 'sharp-round', note: 'Pointed blob into circle.' },
  { a: 'wedge', b: 'square', group: 'sharp-flat', note: 'Unequal body risk from earlier audits.' },
  { a: 'star5', b: 'square', group: 'forked', note: 'Thin tip welds; easy to grow struts.' },
  { a: 'cross', b: 'circle', group: 'forked', note: 'Arm-end to circle; avoid parallel slits.' },
  { a: 'x', b: 'square', group: 'forked', note: 'Diagonal arms into flat.' },
  { a: 'chevron', b: 'square', group: 'forked', note: 'Open mouth should stay readable.' },
  { a: 'capsule', b: 'square', group: 'round-flat', note: 'Stadium into flat; cluster necks matter.' },
  { a: 'rect', b: 'triangle', group: 'sharp-flat', note: 'Bar into tip.' },
  { a: 'hexagon', b: 'diamond', group: 'poly-poly', note: 'Faceted pair; watch corner jumps.' },
  { a: 'pentagon', b: 'circle', group: 'poly-round', note: 'Near-blob into circle.' },
  { a: 'notch', b: 'square', group: 'open-mouth', note: 'Preserve notch opening; no floating ink.' },
  { a: 'arc', b: 'triangle', group: 'open-mouth', note: 'Arc mouth + tip; arc/square already approved separately.' },
  { a: 'ring', b: 'square', group: 'open-mouth', note: 'Hole must survive the melt.' },
  { a: 'star4', b: 'capsule', group: 'forked', note: 'Thin tips into stadium.' },
  { a: 'wedge', b: 'notch', group: 'open-mouth', note: 'Handover: detached-ink risk.' },
]

const METHODS = [
  { id: 'current', label: 'Current', blurb: 'Live workshop path for mixed pairs.' },
  { id: 'weld', label: 'Organic weld', blurb: 'Cubic outline waist + body union.' },
  { id: 'sdf', label: 'SDF melt', blurb: 'Distance-field blend of real outlines.' },
  { id: 'offset', label: 'Offset melt', blurb: 'Expand → union → shrink (arc/flat family).' },
]

function shape(preset) {
  const found = PRESET_SHAPES.find((s) => s.kind === 'preset' && s.preset === preset)
  if (!found) throw new Error(`Unknown preset: ${preset}`)
  return found
}

function stampsForPair(presetA, presetB, cells, size, roundedness) {
  const grid = { cols: 2, rows: 2, cellSize: 40, gap: 2 }
  const shapes = cells.map((_, index) => {
    if (cells.length === 3 && index === 2) return shape(presetA) // L: third cell repeats A
    return index === 0 ? shape(presetA) : shape(presetB)
  })
  return cells.map(([col, row], index) => {
    const { cx, cy } = cellCenter(col, row, grid)
    const { x, y } = cellOrigin(col, row, grid)
    const offset = (40 - size) / 2
    return makeSoftStamp(
      `${col}:${row}`,
      col,
      row,
      cx,
      cy,
      size,
      shapes[index],
      x + offset,
      y + offset,
      roundedness,
    )
  })
}

function renderMethod(stamps, softness, method) {
  if (method === 'current') return softnessFinishPathList(stamps, softness)
  if (softness <= 0.02) {
    return multiPolygonToPathList(
      stamps.map((s) => toPolygon(s.rings)).filter(Boolean),
    )
  }
  if (method === 'sdf' || method === 'offset') {
    return fieldBlend(
      stamps.map((s) => s.rings),
      SIZE,
      softness,
      method,
    )
  }
  // organic weld bridges between every neighbour pair, then union with bodies
  const originals = stamps
    .map((s) => toPolygon(s.rings))
    .filter((p) => !!p)
  const bridges = []
  for (let i = 0; i < stamps.length; i++) {
    for (let j = i + 1; j < stamps.length; j++) {
      const left = stamps[i]
      const right = stamps[j]
      const ortho = left.col === right.col || left.row === right.row
      const diag =
        Math.abs(left.col - right.col) === 1 && Math.abs(left.row - right.row) === 1
      if (!ortho && !diag) continue
      bridges.push(...organicWeld(left, right, softness))
    }
  }
  const holes = stamps
    .flatMap((s) => s.rings.slice(1).map((ring) => toPolygon([ring])))
    .filter((p) => !!p)
  const merged = unionPolygons([...originals, ...bridges])
  return multiPolygonToPathList(holes.length ? differencePolygons(merged, holes) : merged)
}

function svgFor(paths, label) {
  const body = paths
    .map((d) => `<path d="${d}" fill="#171717" fill-rule="evenodd"/>`)
    .join('')
  return `<svg viewBox="-4 -4 92 92" role="img" aria-label="${label}">${body}</svg>`
}

const esc = (s) =>
  String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')

let frameCount = 0
const pairArticles = []
const methodsJson = JSON.stringify(METHODS.map((m) => ({ id: m.id, label: m.label })))
const pairsJson = JSON.stringify(
  MIXED_PAIRS.map((p) => ({
    id: `${p.a}-${p.b}`,
    a: p.a,
    b: p.b,
    label: `${shape(p.a).label} + ${shape(p.b).label}`,
    group: p.group,
  })),
)

for (const pair of MIXED_PAIRS) {
  const pairId = `${pair.a}-${pair.b}`
  const labelA = shape(pair.a).label
  const labelB = shape(pair.b).label
  const pickBar = `<div class="pick-bar" role="group" aria-label="Preferred method for ${esc(labelA)} + ${esc(labelB)}">
    <span class="pick-label">My pick:</span>
    ${METHODS.map(
      (m) =>
        `<button type="button" class="pick" data-pair="${pairId}" data-method="${m.id}">${esc(m.label)}</button>`,
    ).join('')}
    <button type="button" class="pick clear" data-pair="${pairId}" data-method="">Clear</button>
  </div>`
  const softnessBlocks = SOFTNESS_LEVELS.map((soft) => {
    const rows = METHODS.map((method) => {
      const cells = LAYOUTS.map((layout) => {
        const stamps = stampsForPair(pair.a, pair.b, layout.cells, SIZE, ROUNDEDNESS)
        const paths = renderMethod(stamps, soft.value, method.id)
        frameCount++
        return `<button type="button" class="frame" data-pair="${pairId}" data-method="${method.id}" title="Pick ${esc(method.label)}">
          ${svgFor(paths, `${labelA}+${labelB} ${layout.label} ${method.label} ${soft.label}`)}
        </button>`
      }).join('')
      return `<button type="button" class="method row-pick" data-pair="${pairId}" data-method="${method.id}">${esc(method.label)}</button>${cells}`
    }).join('')
    return `<div class="soft-block"><h3>${esc(soft.label)}</h3>
      <div class="grid">
        <span></span>${LAYOUTS.map((l) => `<span class="head">${esc(l.label)}</span>`).join('')}
        ${rows}
      </div></div>`
  }).join('')

  pairArticles.push(`<article id="${pairId}" data-pair="${pairId}" data-group="${pair.group}">
    <h2>${esc(labelA)} + ${esc(labelB)}</h2>
    <p class="note">${esc(pair.note)}</p>
    ${pickBar}
    ${softnessBlocks}
  </article>`)
}

const groups = [
  { id: 'all', label: 'All pairs' },
  { id: 'sharp-flat', label: 'Sharp ↔ flat' },
  { id: 'sharp-round', label: 'Sharp ↔ round' },
  { id: 'forked', label: 'Stars / cross / X' },
  { id: 'round-flat', label: 'Capsule / round ↔ flat' },
  { id: 'poly-poly', label: 'Polygon ↔ polygon' },
  { id: 'poly-round', label: 'Polygon ↔ round' },
  { id: 'open-mouth', label: 'Open mouths / holes' },
]

const html = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mixed-shape weld preview</title>
<style>
  *{box-sizing:border-box}
  body{font:14px/1.45 system-ui,sans-serif;margin:24px;padding-bottom:140px;color:#171717;background:#fff;max-width:1200px}
  h1{font-size:24px;margin:0 0 8px}
  h2{font-size:18px;margin:0 0 6px}
  h3{font-size:13px;margin:14px 0 8px;color:#444;font-weight:600}
  p{margin:8px 0}
  .note{color:#555;font-size:13px}
  .plan{background:#f7f7f5;border:1px solid #e2e2dc;padding:14px 16px;margin:16px 0 20px}
  .plan ol{margin:8px 0 0;padding-left:1.2em}
  .plan li{margin:4px 0}
  nav.filter{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0 18px}
  nav.filter button{font:inherit;background:#fff;border:1px solid #bbb;padding:8px 10px;cursor:pointer}
  nav.filter button[aria-pressed=true]{background:#171717;color:#fff}
  article{border-top:1px solid #ddd;padding:18px 0}
  article[hidden]{display:none}
  article[data-chosen]{background:#f6fbf6}
  .grid{display:grid;grid-template-columns:110px repeat(4,minmax(72px,1fr));gap:8px;align-items:center}
  .head{font-size:11px;color:#666;text-align:center}
  .method{font:inherit;font-size:12px;font-weight:600;text-align:left;background:transparent;border:1px solid transparent;padding:6px 4px;cursor:pointer;border-radius:4px}
  .method:hover,.frame:hover{outline:2px solid #bbb;outline-offset:1px}
  .frame{display:block;width:100%;padding:0;border:2px solid transparent;background:transparent;cursor:pointer;border-radius:4px}
  svg{width:100%;height:96px;display:block;background:#fafafa;pointer-events:none}
  .legend{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;margin:12px 0}
  .legend div{border:1px solid #e2e2dc;padding:10px}
  .legend strong{display:block;margin-bottom:4px}
  .verdict{margin-top:8px;font-size:13px;color:#333}
  code{font-size:12px;background:#f0f0ec;padding:1px 4px}
  .pick-bar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:10px 0 4px}
  .pick-label{font-size:12px;color:#555;margin-right:4px}
  .pick{font:inherit;font-size:12px;background:#fff;border:1px solid #bbb;padding:6px 10px;cursor:pointer;border-radius:4px}
  .pick.clear{color:#666;border-style:dashed}
  .pick[aria-pressed=true]{background:#171717;color:#fff;border-color:#171717}
  article[data-chosen] .method[data-method].is-chosen,
  article[data-chosen] .frame[data-method].is-chosen{border-color:#1a7f37;background:#eef8f0}
  article[data-chosen] .method[data-method].is-chosen{border-color:#1a7f37}
  #picks-dock{position:fixed;left:0;right:0;bottom:0;background:#171717;color:#fff;padding:12px 16px;z-index:20;box-shadow:0 -4px 20px rgba(0,0,0,.18)}
  #picks-dock .dock-inner{max-width:1200px;margin:0 auto;display:grid;gap:8px}
  #picks-dock .dock-top{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between}
  #picks-dock .count{font-weight:600}
  #picks-dock .actions{display:flex;flex-wrap:wrap;gap:6px}
  #picks-dock button{font:inherit;font-size:12px;padding:7px 10px;border:1px solid #555;background:#2a2a2a;color:#fff;cursor:pointer;border-radius:4px}
  #picks-dock button.primary{background:#fff;color:#171717;border-color:#fff}
  #picks-list{font-size:12px;line-height:1.4;max-height:72px;overflow:auto;opacity:.92;white-space:pre-wrap}
  #picks-list:empty::before{content:"No picks yet — click a method name, a glyph, or a My pick button.";opacity:.7}
</style>

<h1>Mixed-shape weld preview</h1>
<p>Isolated lab — <strong>workshop geometry is unchanged</strong>. Click the method you like for each pair (or click any glyph in that row). Picks are saved in this browser.</p>

<section class="plan">
  <strong>Plan</strong>
  <ol>
    <li><strong>Preview (this page)</strong> — compare Current vs Organic weld vs SDF vs Offset on unlike stamps.</li>
    <li><strong>You approve</strong> — use the pick buttons below each pair, then Copy picks.</li>
    <li><strong>Integrate only the winner(s)</strong> into <code>blendPairPolygons</code> for mixed pairs; same-preset joins stay as they are.</li>
    <li><strong>Protect</strong> ring holes, arc mouths, notch openings; reject skinny bars, loops, pinholes, lost body.</li>
    <li><strong>Smoke</strong> existing weld/arc/capsule scripts + a new mixed-pair smoke before calling it done.</li>
  </ol>
  <p class="verdict">Settings: size ${SIZE} · roundedness ${ROUNDEDNESS} · ${MIXED_PAIRS.length} pairs × ${LAYOUTS.length} layouts × ${METHODS.length} methods × ${SOFTNESS_LEVELS.length} Softness levels = ${frameCount} frames.</p>
</section>

<div class="legend">
  ${METHODS.map((m) => `<div><strong>${esc(m.label)}</strong>${esc(m.blurb)}</div>`).join('')}
</div>

<p class="note">Judge: continuous smooth neck, both shapes still readable, no floating ink, intentional holes stay open.</p>

<nav class="filter">
  ${groups.map((g, i) => `<button type="button" data-group="${g.id}" aria-pressed="${i === 0}">${esc(g.label)}</button>`).join('')}
</nav>

${pairArticles.join('\n')}

<div id="picks-dock">
  <div class="dock-inner">
    <div class="dock-top">
      <div class="count"><span id="pick-count">0</span> / ${MIXED_PAIRS.length} pairs picked</div>
      <div class="actions">
        <button type="button" id="copy-picks" class="primary">Copy picks</button>
        <button type="button" id="copy-summary">Copy summary</button>
        <button type="button" id="clear-all">Clear all</button>
      </div>
    </div>
    <div id="picks-list"></div>
  </div>
</div>

<script>
const STORAGE_KEY = 'gridz-mixed-weld-picks-v1'
const METHODS = ${methodsJson}
const PAIRS = ${pairsJson}
const methodLabel = Object.fromEntries(METHODS.map(m => [m.id, m.label]))
const pairMeta = Object.fromEntries(PAIRS.map(p => [p.id, p]))

const load = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') } catch { return {} }
}
let picks = load()

const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(picks))

const applyPair = (pairId) => {
  const method = picks[pairId] || ''
  const article = document.getElementById(pairId)
  if (!article) return
  if (method) article.dataset.chosen = method
  else delete article.dataset.chosen
  article.querySelectorAll('.pick[data-method]').forEach(btn => {
    btn.setAttribute('aria-pressed', String(btn.dataset.method === method && method !== ''))
  })
  article.querySelectorAll('[data-method]').forEach(el => {
    el.classList.toggle('is-chosen', method !== '' && el.dataset.method === method)
  })
}

const renderDock = () => {
  const entries = PAIRS.filter(p => picks[p.id]).map(p => ({
    pair: p.id,
    label: p.label,
    group: p.group,
    method: picks[p.id],
    methodLabel: methodLabel[picks[p.id]] || picks[p.id],
  }))
  document.getElementById('pick-count').textContent = String(entries.length)
  document.getElementById('picks-list').textContent = entries.length
    ? entries.map(e => e.label + ' → ' + e.methodLabel).join('\\n')
    : ''
}

const setPick = (pairId, method) => {
  if (!pairId) return
  if (!method) delete picks[pairId]
  else picks[pairId] = method
  save()
  applyPair(pairId)
  renderDock()
}

PAIRS.forEach(p => applyPair(p.id))
renderDock()

document.querySelectorAll('nav.filter button').forEach(button => {
  button.onclick = () => {
    const group = button.dataset.group
    document.querySelectorAll('nav.filter button').forEach(b =>
      b.setAttribute('aria-pressed', String(b === button)))
    document.querySelectorAll('article').forEach(article => {
      article.hidden = group !== 'all' && article.dataset.group !== group
    })
  }
})

document.querySelectorAll('[data-pair][data-method]').forEach(el => {
  if (el.tagName !== 'BUTTON') return
  el.addEventListener('click', () => setPick(el.dataset.pair, el.dataset.method || ''))
})

document.getElementById('clear-all').onclick = () => {
  picks = {}
  save()
  PAIRS.forEach(p => applyPair(p.id))
  renderDock()
}

document.getElementById('copy-picks').onclick = async () => {
  const payload = {
    generated: new Date().toISOString(),
    settings: { size: ${SIZE}, roundedness: ${ROUNDEDNESS} },
    picks: PAIRS.filter(p => picks[p.id]).map(p => ({
      pair: p.id,
      a: p.a,
      b: p.b,
      label: p.label,
      group: p.group,
      method: picks[p.id],
      methodLabel: methodLabel[picks[p.id]],
    })),
  }
  const text = JSON.stringify(payload, null, 2)
  await navigator.clipboard.writeText(text)
  const btn = document.getElementById('copy-picks')
  const old = btn.textContent
  btn.textContent = 'Copied JSON'
  setTimeout(() => { btn.textContent = old }, 1200)
}

document.getElementById('copy-summary').onclick = async () => {
  const lines = PAIRS.filter(p => picks[p.id]).map(p =>
    '- ' + p.label + ' → ' + (methodLabel[picks[p.id]] || picks[p.id]))
  const byMethod = {}
  for (const p of PAIRS) {
    const m = picks[p.id]
    if (!m) continue
    byMethod[m] = (byMethod[m] || 0) + 1
  }
  const tally = Object.entries(byMethod)
    .map(([id, n]) => methodLabel[id] + ': ' + n)
    .join(', ') || 'none'
  const text = 'Mixed weld picks (' + Object.keys(picks).length + '/' + PAIRS.length + ')\\n'
    + 'Tally: ' + tally + '\\n'
    + lines.join('\\n')
  await navigator.clipboard.writeText(text)
  const btn = document.getElementById('copy-summary')
  const old = btn.textContent
  btn.textContent = 'Copied'
  setTimeout(() => { btn.textContent = old }, 1200)
}
</script>
</html>`

mkdirSync(`${root}docs`, { recursive: true })
mkdirSync(`${root}public/docs`, { recursive: true })
writeFileSync(`${root}docs/mixed-weld-preview.html`, html)
writeFileSync(`${root}public/docs/mixed-weld-preview.html`, html)
console.log(`Rendered ${frameCount} mixed-weld frames → docs/mixed-weld-preview.html`)
