/**
 * Side-by-side: your mixed-pair pick vs no weld.
 * Open: http://127.0.0.1:43127/docs/no-weld-candidates.html
 *
 * Usage: node scripts/render-no-weld-preview.mjs
 */
import { createJiti } from 'jiti'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const jiti = createJiti(import.meta.url, { alias: { '@': `${root}src` } })

const { makeSoftStamp, softnessFinishPathList } = await jiti.import('../src/lib/softness.ts')
const { cellCenter, cellOrigin } = await jiti.import('../src/lib/gridGeometry.ts')
const { multiPolygonToPathList, toPolygon } = await jiti.import('../src/lib/polyBool.ts')
const { PRESET_SHAPES } = await jiti.import('../src/lib/types.ts')
const { MIXED_PAIR_METHODS, mixedPairKey } = await jiti.import('../src/lib/shapeJoinRegistry.ts')

const SIZE = 37
const ROUNDEDNESS = 2
const SOFTNESS = 0.55

const LAYOUTS = [
  { id: 'horizontal', label: 'H', cells: [[0, 0], [1, 0]] },
  { id: 'vertical', label: 'V', cells: [[0, 0], [0, 1]] },
  { id: 'diagonal', label: 'Diag', cells: [[0, 0], [1, 1]] },
  { id: 'elbow', label: 'L', cells: [[0, 0], [1, 0], [0, 1]] },
]

/**
 * Recommend dropping Softness melt for these.
 * Keep tip/blob organic welds; kill forked arms, open mouths, and unequal mouths.
 */
const CANDIDATES = [
  {
    a: 'star5',
    b: 'square',
    why: 'Thin star tips grow struts / ink blobs into the square.',
    severity: 'high',
  },
  {
    a: 'star4',
    b: 'capsule',
    why: 'Same tip problem into a stadium — melt reads as glue, not letter.',
    severity: 'high',
  },
  {
    a: 'cross',
    b: 'circle',
    why: 'Arm ends melt into slits or fat collars; cross stops reading as a cross.',
    severity: 'high',
  },
  {
    a: 'x',
    b: 'square',
    why: 'Diagonal arms mush against the flat; silhouette loses the X.',
    severity: 'high',
  },
  {
    a: 'chevron',
    b: 'square',
    why: 'Open chevron mouth fills or warps when Softness grows a neck.',
    severity: 'high',
  },
  {
    a: 'wedge',
    b: 'square',
    why: 'Unequal bodies — melt often fattens one side and looks accidental.',
    severity: 'medium',
  },
  {
    a: 'wedge',
    b: 'notch',
    why: 'Two open mouths; melt risks detached ink / sealed openings.',
    severity: 'medium',
  },
  {
    a: 'arc',
    b: 'triangle',
    why: 'Arc mouth + tip; safer to only union when they already touch.',
    severity: 'medium',
  },
  {
    a: 'notch',
    b: 'square',
    why: 'Missing 18th lab pair — notch opening is easy to seal; default to no melt.',
    severity: 'medium',
  },
]

function shape(preset) {
  const found = PRESET_SHAPES.find((s) => s.kind === 'preset' && s.preset === preset)
  if (!found) throw new Error(`Unknown preset: ${preset}`)
  return found
}

function methodLabel(id) {
  if (id === 'weld') return 'Organic weld'
  if (id === 'sdf') return 'SDF melt'
  if (id === 'offset') return 'Offset melt'
  if (id === 'current') return 'Current'
  if (id === 'none') return 'No weld'
  if (!id) return 'Legacy (unlisted)'
  return String(id)
}

function stampsForPair(presetA, presetB, cells) {
  const grid = { cols: 2, rows: 2, cellSize: 40, gap: 2 }
  const shapes = cells.map((_, index) => {
    if (cells.length === 3 && index === 2) return shape(presetA)
    return index === 0 ? shape(presetA) : shape(presetB)
  })
  return cells.map(([col, row], index) => {
    const { cx, cy } = cellCenter(col, row, grid)
    const { x, y } = cellOrigin(col, row, grid)
    const offset = (40 - SIZE) / 2
    return makeSoftStamp(
      `${col}:${row}`,
      col,
      row,
      cx,
      cy,
      SIZE,
      shapes[index],
      x + offset,
      y + offset,
      ROUNDEDNESS,
    )
  })
}

function renderPicked(stamps) {
  return softnessFinishPathList(stamps, SOFTNESS)
}

function renderNone(stamps) {
  return multiPolygonToPathList(
    stamps.map((s) => toPolygon(s.rings)).filter(Boolean),
  )
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

const articles = CANDIDATES.map((c) => {
  const key = mixedPairKey(c.a, c.b)
  const picked = MIXED_PAIR_METHODS[key] ?? null
  const labelA = shape(c.a).label
  const labelB = shape(c.b).label
  const pairId = `${c.a}-${c.b}`
  const cells = LAYOUTS.map((layout) => {
    const stamps = stampsForPair(c.a, c.b, layout.cells)
    const withWeld = svgFor(
      renderPicked(stamps),
      `${labelA}+${labelB} ${layout.label} with weld`,
    )
    const noWeld = svgFor(
      renderNone(stamps),
      `${labelA}+${labelB} ${layout.label} no weld`,
    )
    return `<div class="layout">
      <span class="lay">${esc(layout.label)}</span>
      <div class="col">${withWeld}<span class="cap">With melt</span></div>
      <div class="col">${noWeld}<span class="cap">No weld</span></div>
    </div>`
  }).join('')

  return `<article data-pair="${pairId}" data-key="${key}" data-severity="${c.severity}" data-vote="">
    <header>
      <h2>${esc(labelA)} + ${esc(labelB)}</h2>
      <span class="badge ${c.severity}">${c.severity} priority</span>
      <span class="picked">Lab pick: <strong>${esc(methodLabel(picked))}</strong></span>
    </header>
    <p class="why">${esc(c.why)}</p>
    <div class="compare">${cells}</div>
    <div class="vote" role="group" aria-label="Decision for ${esc(labelA)} + ${esc(labelB)}">
      <button type="button" class="kill" data-pair="${pairId}" data-key="${key}">Remove weld</button>
      <button type="button" class="keep" data-pair="${pairId}" data-key="${key}">Keep melt</button>
    </div>
  </article>`
}).join('\n')

const html = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>No-weld candidates</title>
<style>
  *{box-sizing:border-box}
  body{font:14px/1.45 system-ui,sans-serif;margin:24px;padding-bottom:120px;color:#171717;background:#fff;max-width:980px}
  h1{font-size:22px;margin:0 0 8px}
  h2{font-size:17px;margin:0}
  p{margin:8px 0}
  .intro{background:#f7f7f5;border:1px solid #e2e2dc;padding:14px 16px;margin:12px 0 20px}
  .intro ul{margin:8px 0 0;padding-left:1.2em}
  article{border-top:1px solid #ddd;padding:18px 0}
  article[data-vote=kill]{background:#fff6f4}
  article[data-vote=keep]{background:#f5faf5}
  header{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:baseline}
  .badge{font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:2px 6px;border:1px solid #bbb}
  .badge.high{border-color:#b00020;color:#b00020}
  .badge.medium{border-color:#8a6d00;color:#8a6d00}
  .picked{font-size:12px;color:#555}
  .why{color:#444;font-size:13px}
  .compare{display:grid;gap:10px;margin:12px 0}
  .layout{display:grid;grid-template-columns:36px 1fr 1fr;gap:8px;align-items:center}
  .lay{font-size:11px;color:#666;font-weight:600}
  .col{display:grid;gap:2px}
  .cap{font-size:10px;color:#777;text-align:center}
  svg{width:100%;height:88px;display:block;background:#fafafa;border:1px solid #eee}
  .vote{display:flex;gap:8px;margin-top:8px}
  .vote button{font:inherit;font-size:13px;padding:8px 12px;cursor:pointer;border:1px solid #bbb;background:#fff}
  .vote .kill{border-color:#b00020;color:#b00020}
  .vote .keep{border-color:#1a7f37;color:#1a7f37}
  article[data-vote=kill] .kill{background:#b00020;color:#fff}
  article[data-vote=keep] .keep{background:#1a7f37;color:#fff}
  #dock{position:fixed;left:0;right:0;bottom:0;background:#171717;color:#fff;padding:12px 16px}
  #dock .inner{max-width:980px;margin:0 auto;display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between}
  #dock button{font:inherit;font-size:12px;padding:8px 12px;border:0;cursor:pointer;background:#fff;color:#171717}
  #summary{font-size:12px;opacity:.9;white-space:pre-wrap;max-width:100%;flex:1 1 240px}
</style>

<h1>No-weld candidates</h1>
<p>Recommended pairs to <strong>turn Softness melt off</strong>. Left = current workshop melt · Right = shapes only (no neck).</p>

<section class="intro">
  <strong>Suggested removals (9)</strong>
  <ul>
    <li><strong>High:</strong> Star+Square, 4-star+Capsule, Cross+Circle, X+Square, Chevron+Square — forked / open arms lose identity when melted.</li>
    <li><strong>Medium:</strong> Wedge+Square, Wedge+Notch, Arc+Triangle, Notch+Square — mouths / unequal bodies; safer as touch-only union.</li>
    <li><strong>Keep melting:</strong> Triangle/Diamond/Rect/Capsule/Pentagon/Hexagon/Ring mixes you already liked as Organic weld.</li>
  </ul>
  <p>Click <em>Remove weld</em> or <em>Keep melt</em> on each row, then copy the decision list.</p>
</section>

${articles}

<div id="dock">
  <div class="inner">
    <div id="summary">No decisions yet.</div>
    <button type="button" id="copy">Copy decisions</button>
  </div>
</div>

<script>
const votes = {}
const summary = document.getElementById('summary')
function refresh() {
  const kill = Object.entries(votes).filter(([,v]) => v === 'kill').map(([k]) => k)
  const keep = Object.entries(votes).filter(([,v]) => v === 'keep').map(([k]) => k)
  summary.textContent =
    'Remove (' + kill.length + '): ' + (kill.join(', ') || '—') +
    '\\nKeep (' + keep.length + '): ' + (keep.join(', ') || '—')
}
document.querySelectorAll('.vote button').forEach((btn) => {
  btn.addEventListener('click', () => {
    const art = btn.closest('article')
    const key = btn.dataset.key
    const vote = btn.classList.contains('kill') ? 'kill' : 'keep'
    votes[key] = vote
    art.dataset.vote = vote
    refresh()
  })
})
document.getElementById('copy').addEventListener('click', async () => {
  const kill = Object.entries(votes).filter(([,v]) => v === 'kill').map(([k]) => k)
  const keep = Object.entries(votes).filter(([,v]) => v === 'keep').map(([k]) => k)
  const text = [
    'No-weld decisions',
    'Remove weld → set to none:',
    ...kill.map((k) => '- ' + k),
    'Keep melt:',
    ...keep.map((k) => '- ' + k),
  ].join('\\n')
  try {
    await navigator.clipboard.writeText(text)
    summary.textContent = 'Copied.\\n' + text
  } catch {
    summary.textContent = text
  }
})
</script>
`

mkdirSync(`${root}public/docs`, { recursive: true })
const out = `${root}public/docs/no-weld-candidates.html`
writeFileSync(out, html)
console.log(`Wrote ${out}`)
console.log(`Candidates: ${CANDIDATES.length}`)
console.log('Open: http://127.0.0.1:43127/docs/no-weld-candidates.html')
