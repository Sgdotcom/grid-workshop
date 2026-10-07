import { createJiti } from 'jiti'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const jiti = createJiti(import.meta.url, { alias: { '@': path.resolve(root, 'src') } })

const { PRESET_SHAPES } = await jiti.import('../src/lib/types.ts')
const { compareJoin, JOIN_CASES, JOIN_METHODS } = await jiti.import('../src/lib/joinExperiments.ts')

const shapesToTest = ['cross', 'x', 'chevron']
const settings = { size: 38, softness: 0.55, roundedness: 4, radius: 1, neck: 1 }

const testData = shapesToTest.map(pid => {
  const shape = PRESET_SHAPES.find(s => s.preset === pid)
  const rows = JOIN_CASES.map(jc => {
    const methods = JOIN_METHODS.map(m => {
      try {
        const res = compareJoin(shape, jc.cells, settings, m.id)
        return { methodId: m.id, label: m.label, paths: res.paths, outlines: res.outlines, error: '' }
      } catch (err) {
        return { methodId: m.id, label: m.label, paths: [], outlines: [], error: err.message }
      }
    })
    return { caseId: jc.id, label: jc.label, methods }
  })
  return { id: pid, label: shape.label, rows }
})

function renderHtml() {
  const sectionsHtml = testData.map(st => {
    const rowsHtml = st.rows.map(r => {
      const colsHtml = r.methods.map(m => {
        const pathsSvg = m.paths.map(p => `<path d="${p}" fill="currentColor" fill-rule="evenodd" class="text-slate-800 dark:text-slate-200" />`).join('')
        const outlinesSvg = m.outlines.map(p => `<path d="${p}" fill="none" stroke="#0000ee" stroke-width="0.45" stroke-dasharray="1 1" opacity="0.6" />`).join('')

        return `
          <div class="bg-slate-900/60 rounded-xl p-3 flex flex-col items-center border border-slate-700/60">
            <span class="text-[11px] font-semibold text-slate-300 mb-1">${m.label}</span>
            <div class="w-full aspect-square max-w-[130px]">
              <svg viewBox="-40 -40 162 162" class="w-full h-full">
                ${pathsSvg}
                ${outlinesSvg}
              </svg>
            </div>
            <span class="text-[10px] font-mono text-slate-400 mt-1">${m.paths.length} path${m.paths.length === 1 ? '' : 's'}</span>
          </div>
        `
      }).join('')

      return `
        <div class="space-y-2 mb-6 border-b border-slate-800 pb-5">
          <h4 class="text-xs font-bold text-slate-300 uppercase tracking-wider">${r.label}</h4>
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            ${colsHtml}
          </div>
        </div>
      `
    }).join('')

    return `
      <div class="bg-slate-800/80 border border-slate-700 rounded-2xl p-6 shadow-xl mb-8">
        <div class="flex items-center justify-between border-b border-slate-700 pb-3 mb-5">
          <h2 class="text-lg font-bold text-white">${st.label} (${st.id})</h2>
          <span class="text-xs font-mono bg-slate-700 text-slate-300 px-2.5 py-1 rounded">Problem Shape</span>
        </div>
        ${rowsHtml}
      </div>
    `
  }).join('')

  return `<!doctype html>
<html lang="en" class="dark">
<head>
  <meta charset="utf-8">
  <title>Crosses, Xs, and Chevrons Audit</title>
  <script src="https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js"></script>
</head>
<body class="bg-slate-950 text-slate-100 p-6 min-h-screen">
  <div class="max-w-6xl mx-auto space-y-6">
    <div class="border-b border-slate-800 pb-4">
      <h1 class="text-2xl font-bold text-white">Crosses, Xs, and Chevrons · Method Inspection</h1>
      <p class="text-sm text-slate-400 mt-1">
        Direct visual audit of all 5 join methods across Horizontal, Vertical, Diagonal, and Clusters for the three problem shapes.
      </p>
    </div>
    ${sectionsHtml}
  </div>
</body>
</html>`
}

const html = renderHtml()
writeFileSync(`${root}docs/problem-triad-review.html`, html)
writeFileSync(`${root}public/docs/problem-triad-review.html`, html)
console.log('Saved problem-triad-review.html!')
