import { createJiti } from 'jiti'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const jiti = createJiti(import.meta.url, { alias: { '@': path.resolve(root, 'src') } })

const { PRESET_SHAPES } = await jiti.import('../src/lib/types.ts')
const { compareJoin, JOIN_CASES } = await jiti.import('../src/lib/joinExperiments.ts')
const { makeSoftStamp, organicWeld } = await jiti.import('../src/lib/softness.ts')
const { toPolygon, unionPolygons, multiPolygonToPathList } = await jiti.import('../src/lib/polyBool.ts')

// The user's preferred weld cases from their JSON:
const userWeldCases = [
  { shapeId: 'preset-square', layout: 'diagonal-right', size: 34, roundedness: 7, label: 'Square · Diagonal ↘' },
  { shapeId: 'preset-square', layout: 'elbow', size: 34, roundedness: 7, label: 'Square · L-Cluster' },
  { shapeId: 'preset-rect', layout: 'horizontal', size: 34, roundedness: 7, label: 'Rectangle · Horizontal' },
  { shapeId: 'preset-rect', layout: 'vertical', size: 34, roundedness: 7, label: 'Rectangle · Vertical' },
  { shapeId: 'preset-rect', layout: 'diagonal-right', size: 42, roundedness: 2, label: 'Rectangle · Diagonal ↘' },
  { shapeId: 'preset-rect', layout: 'elbow', size: 34, roundedness: 7, label: 'Rectangle · L-Cluster' },
  { shapeId: 'preset-capsule', layout: 'horizontal', size: 34, roundedness: 7, label: 'Capsule · Horizontal' },
  { shapeId: 'preset-capsule', layout: 'vertical', size: 34, roundedness: 7, label: 'Capsule · Vertical' },
  { shapeId: 'preset-capsule', layout: 'diagonal-right', size: 34, roundedness: 7, label: 'Capsule · Diagonal ↘' },
  { shapeId: 'preset-capsule', layout: 'elbow', size: 34, roundedness: 7, label: 'Capsule · L-Cluster' },
  { shapeId: 'preset-diamond', layout: 'diagonal-right', size: 34, roundedness: 7, label: 'Diamond · Diagonal ↘' },
  { shapeId: 'preset-star5', layout: 'horizontal', size: 41, roundedness: 0, label: 'Star 5 · Horizontal' },
]

const softnessSteps = [0.15, 0.35, 0.55, 0.75, 0.95]

console.log('Auditing user weld cases across softness levels:', softnessSteps)

const auditResults = userWeldCases.map(test => {
  const shape = PRESET_SHAPES.find(s => s.id === test.shapeId)
  if (!shape) throw new Error(`Shape ${test.shapeId} not found`)
  const joinCase = JOIN_CASES.find(jc => jc.id === test.layout)
  if (!joinCase) throw new Error(`Join case ${test.layout} not found`)

  const stepsData = softnessSteps.map(softness => {
    const settings = {
      size: test.size,
      softness,
      roundedness: test.roundedness,
      radius: 1,
      neck: 1,
    }
    const res = compareJoin(shape, joinCase.cells, settings, 'weld')
    return {
      softness,
      pathsCount: res.paths.length,
      paths: res.paths,
      outlines: res.outlines,
      status: res.paths.length === 1 ? 'OK' : 'MULTI_COMPONENT',
    }
  })

  return {
    ...test,
    shapeLabel: shape.label,
    steps: stepsData,
  }
})

// Print summary
console.log('------------------------------------------------------------')
console.log('SHAPE & LAYOUT                     0.15   0.35   0.55   0.75   0.95')
console.log('------------------------------------------------------------')
for (const r of auditResults) {
  const flags = r.steps.map(s => (s.pathsCount === 1 ? '✓ 1' : `✗ ${s.pathsCount}`)).join('    ')
  console.log(`${r.label.padEnd(35)} ${flags}`)
}
console.log('------------------------------------------------------------')

// Generate HTML visual report
function renderHtml() {
  const cardsHtml = auditResults.map(r => {
    const columnsHtml = r.steps.map(s => {
      const pathsSvg = s.paths.map(p => `<path d="${p}" fill="currentColor" fill-rule="evenodd" class="text-slate-800 dark:text-slate-200" />`).join('')
      const outlinesSvg = s.outlines.map(p => `<path d="${p}" fill="none" stroke="#0000ee" stroke-width="0.45" stroke-dasharray="1 1" opacity="0.6" />`).join('')

      return `
        <div class="bg-slate-900/70 border border-slate-800 rounded-xl p-3 flex flex-col items-center">
          <div class="flex items-center justify-between w-full mb-1">
            <span class="text-[11px] font-bold text-slate-300">Softness ${s.softness.toFixed(2)}</span>
            <span class="text-[10px] font-mono px-1.5 py-0.5 rounded ${s.pathsCount === 1 ? 'bg-emerald-950/70 text-emerald-400 border border-emerald-500/30' : 'bg-rose-950/70 text-rose-400 border border-rose-500/30'}">
              ${s.pathsCount === 1 ? '1 path ✓' : `${s.pathsCount} paths`}
            </span>
          </div>
          <div class="w-full aspect-square max-w-[130px]">
            <svg viewBox="-40 -40 162 162" class="w-full h-full">
              ${pathsSvg}
              ${outlinesSvg}
            </svg>
          </div>
        </div>
      `
    }).join('')

    return `
      <div class="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-5 shadow-lg space-y-3 mb-6">
        <div class="flex items-center justify-between border-b border-slate-700/70 pb-2">
          <div>
            <h3 class="text-sm font-bold text-white">${r.label}</h3>
            <p class="text-xs text-slate-400">Size: ${r.size}px · Corner Rounding: ${r.roundedness}px · Method: Weld (B)</p>
          </div>
          <span class="text-xs font-mono bg-slate-700 text-slate-300 px-2 py-0.5 rounded">${r.shapeId}</span>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 pt-1">
          ${columnsHtml}
        </div>
      </div>
    `
  }).join('')

  return `<!doctype html>
<html lang="en" class="dark">
<head>
  <meta charset="utf-8">
  <title>User Preferred Welds Across Softness Range</title>
  <script src="https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js"></script>
</head>
<body class="bg-slate-950 text-slate-100 p-6 min-h-screen">
  <div class="max-w-6xl mx-auto space-y-6">
    <div class="border-b border-slate-800 pb-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-white">Weld Softness Range Audit</h1>
          <p class="text-xs text-slate-400 mt-1 max-w-2xl">
            Inspecting the weld behavior of the shapes you chose across 5 softness steps: <strong>0.15</strong> (subtle), <strong>0.35</strong> (light), <strong>0.55</strong> (medium), <strong>0.75</strong> (strong), and <strong>0.95</strong> (max).
          </p>
        </div>
        <span class="text-xs text-emerald-400 font-mono bg-emerald-950/60 border border-emerald-500/30 px-3 py-1.5 rounded-lg">
          Liked Welds Suite
        </span>
      </div>
    </div>

    <div>
      ${cardsHtml}
    </div>
  </div>
</body>
</html>`
}

const html = renderHtml()
writeFileSync(`${root}docs/weld-softness-audit.html`, html)
writeFileSync(`${root}public/docs/weld-softness-audit.html`, html)
console.log('Saved weld-softness-audit.html to docs and public/docs!')
