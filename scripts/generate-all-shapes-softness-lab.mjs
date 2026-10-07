import { createJiti } from 'jiti'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const jiti = createJiti(import.meta.url, { alias: { '@': path.resolve(root, 'src') } })

const { PRESET_SHAPES } = await jiti.import('../src/lib/types.ts')
const { compareJoin, JOIN_CASES } = await jiti.import('../src/lib/joinExperiments.ts')

// User's liked methods from their uploaded JSON:
const userPreferences = {
  'preset-square': {
    horizontal: 'current',
    vertical: 'current',
    'diagonal-right': 'weld',
    'diagonal-left': 'weld',
    elbow: 'weld',
    block: 'current',
    size: 34,
    roundedness: 7,
  },
  'preset-rect': {
    horizontal: 'weld',
    vertical: 'weld',
    'diagonal-right': 'weld',
    'diagonal-left': 'weld',
    elbow: 'weld',
    block: 'weld',
    size: 38,
    roundedness: 4,
  },
  'preset-capsule': {
    horizontal: 'weld',
    vertical: 'weld',
    'diagonal-right': 'weld',
    'diagonal-left': 'weld',
    elbow: 'weld',
    block: 'weld',
    size: 34,
    roundedness: 7,
  },
  'preset-capsule-v': {
    horizontal: 'weld',
    vertical: 'weld',
    'diagonal-right': 'weld',
    'diagonal-left': 'weld',
    elbow: 'weld',
    block: 'weld',
    size: 34,
    roundedness: 7,
  },
  'preset-octagon': {
    horizontal: 'metaball',
    vertical: 'metaball',
    'diagonal-right': 'metaball',
    'diagonal-left': 'metaball',
    elbow: 'metaball',
    block: 'offset',
    size: 34,
    roundedness: 7,
  },
  'preset-diamond': {
    horizontal: 'metaball',
    vertical: 'metaball',
    'diagonal-right': 'weld',
    'diagonal-left': 'weld',
    elbow: 'metaball',
    block: 'metaball',
    size: 34,
    roundedness: 7,
  },
  'preset-triangle': {
    horizontal: 'offset',
    vertical: 'offset',
    'diagonal-right': 'offset',
    'diagonal-left': 'offset',
    elbow: 'offset',
    block: 'offset',
    size: 43,
    roundedness: 7,
  },
  'preset-hexagon': {
    horizontal: 'metaball',
    vertical: 'metaball',
    'diagonal-right': 'metaball',
    'diagonal-left': 'metaball',
    elbow: 'metaball',
    block: 'offset',
    size: 39,
    roundedness: 3,
  },
  'preset-pentagon': {
    horizontal: 'metaball',
    vertical: 'metaball',
    'diagonal-right': 'metaball',
    'diagonal-left': 'metaball',
    elbow: 'metaball',
    block: 'offset',
    size: 39,
    roundedness: 3,
  },
  'preset-star5': {
    horizontal: 'weld',
    vertical: 'weld',
    'diagonal-right': 'weld',
    'diagonal-left': 'weld',
    elbow: 'weld',
    block: 'weld',
    size: 41,
    roundedness: 0,
  },
  'preset-star4': {
    horizontal: 'current',
    vertical: 'current',
    'diagonal-right': 'current',
    'diagonal-left': 'current',
    elbow: 'metaball',
    block: 'sdf',
    size: 41,
    roundedness: 6,
  },
  'preset-circle': {
    horizontal: 'metaball',
    vertical: 'metaball',
    'diagonal-right': 'metaball',
    'diagonal-left': 'metaball',
    elbow: 'metaball',
    block: 'metaball',
    size: 38,
    roundedness: 0,
  },
  'preset-ring': {
    horizontal: 'metaball',
    vertical: 'metaball',
    'diagonal-right': 'metaball',
    'diagonal-left': 'metaball',
    elbow: 'metaball',
    block: 'metaball',
    size: 38,
    roundedness: 0,
  },
  'preset-cross': {
    horizontal: 'weld',
    vertical: 'weld',
    'diagonal-right': 'weld',
    'diagonal-left': 'weld',
    elbow: 'weld',
    block: 'weld',
    size: 38,
    roundedness: 4,
  },
  'preset-x': {
    horizontal: 'weld',
    vertical: 'weld',
    'diagonal-right': 'weld',
    'diagonal-left': 'weld',
    elbow: 'weld',
    block: 'weld',
    size: 38,
    roundedness: 4,
  },
  'preset-chevron': {
    horizontal: 'weld',
    vertical: 'weld',
    'diagonal-right': 'weld',
    'diagonal-left': 'weld',
    elbow: 'weld',
    block: 'weld',
    size: 38,
    roundedness: 4,
  },
}

const softnessSteps = [0.15, 0.35, 0.55, 0.75, 0.95]
const layoutsToInclude = ['horizontal', 'diagonal-right', 'elbow', 'block']

console.log('Generating All-Shapes Softness Lab for 16 shapes across 5 softness steps...')

const dataset = PRESET_SHAPES.map(shape => {
  const pref = userPreferences[shape.id] ?? { size: 38, roundedness: 4 }
  const size = pref.size ?? 38
  const roundedness = pref.roundedness ?? 4

  const layoutResults = layoutsToInclude.map(layoutId => {
    const jc = JOIN_CASES.find(c => c.id === layoutId)
    const userMethod = pref[layoutId] ?? 'weld'

    // We compute both:
    // 1. Under Pure Weld
    const weldSteps = softnessSteps.map(softness => {
      const settings = { size, softness, roundedness, radius: 1, neck: 1 }
      const res = compareJoin(shape, jc.cells, settings, 'weld')
      return { softness, paths: res.paths, outlines: res.outlines, pathsCount: res.paths.length }
    })

    // 2. Under User's Preferred Method
    const prefSteps = softnessSteps.map(softness => {
      const settings = { size, softness, roundedness, radius: 1, neck: 1 }
      const res = compareJoin(shape, jc.cells, settings, userMethod)
      return { softness, paths: res.paths, outlines: res.outlines, pathsCount: res.paths.length, method: userMethod }
    })

    return {
      layoutId,
      layoutLabel: jc.label,
      userMethod,
      weldSteps,
      prefSteps,
    }
  })

  return {
    id: shape.id,
    preset: shape.preset,
    label: shape.label,
    size,
    roundedness,
    layouts: layoutResults,
  }
})

console.log(`Computed dataset for ${dataset.length} shapes. Generating HTML...`)

function renderHtml() {
  const shapesDataJson = JSON.stringify(dataset)

  return `<!doctype html>
<html lang="en" class="dark">
<head>
  <meta charset="utf-8">
  <title>All 16 Shapes · Softness Evolution Studio</title>
  <script src="https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js"></script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .shape-card:hover { border-color: rgba(99, 102, 241, 0.4); }
  </style>
</head>
<body class="bg-slate-950 text-slate-100 p-6 min-h-screen">
  <div class="max-w-7xl mx-auto space-y-6">
    <!-- Header -->
    <div class="border-b border-slate-800 pb-5">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold text-white tracking-tight">All 16 Shapes · Softness Evolution Studio</h1>
          <p class="text-xs text-slate-400 mt-1 max-w-2xl">
            Inspect how all 16 shapes blend across 5 softness levels (0.15, 0.35, 0.55, 0.75, 0.95). Switch between your <strong>Saved Preferences</strong> and <strong>Pure Weld</strong>, and filter by layout.
          </p>
        </div>
        <div class="flex items-center gap-2">
          <a href="http://127.0.0.1:43127/?view=join-lab" class="text-xs text-blue-400 hover:underline px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900">
            Open Join Lab ↗
          </a>
        </div>
      </div>

      <!-- Controls Toolbar -->
      <div class="flex flex-wrap items-center justify-between gap-4 mt-5 pt-4 border-t border-slate-800/80">
        <!-- View Mode: Preferred vs Pure Weld -->
        <div class="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800">
          <button id="btnModePref" class="mode-btn px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 text-white shadow-sm" onclick="setMode('pref')">
            🎯 Your Liked Preferences
          </button>
          <button id="btnModeWeld" class="mode-btn px-3 py-1.5 text-xs font-semibold rounded-lg text-slate-400 hover:text-white" onclick="setMode('weld')">
            🧪 Pure Weld (Method B)
          </button>
        </div>

        <!-- Layout Selector -->
        <div class="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800" id="layoutPills">
          <button class="layout-btn px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-800 text-white" onclick="setLayout('all')">All Layouts</button>
          <button class="layout-btn px-2.5 py-1 text-xs font-medium rounded-lg text-slate-400 hover:text-white" onclick="setLayout('horizontal')">Horizontal ➔</button>
          <button class="layout-btn px-2.5 py-1 text-xs font-medium rounded-lg text-slate-400 hover:text-white" onclick="setLayout('diagonal-right')">Diagonal ↘</button>
          <button class="layout-btn px-2.5 py-1 text-xs font-medium rounded-lg text-slate-400 hover:text-white" onclick="setLayout('elbow')">L-Cluster</button>
          <button class="layout-btn px-2.5 py-1 text-xs font-medium rounded-lg text-slate-400 hover:text-white" onclick="setLayout('block')">2×2 Block</button>
        </div>

        <!-- Shape Search / Jump -->
        <div class="flex items-center gap-2">
          <select id="shapeFilter" class="bg-slate-900 border border-slate-800 text-xs rounded-lg px-3 py-1.5 text-slate-300 outline-none" onchange="filterShape(this.value)">
            <option value="all">Show All 16 Shapes</option>
          </select>
        </div>
      </div>
    </div>

    <!-- Softness Legend Header -->
    <div class="bg-slate-900/60 border border-slate-800/80 rounded-xl px-5 py-3 flex items-center justify-between text-xs">
      <div class="flex items-center gap-2">
        <span class="font-bold text-slate-300">Softness Progression:</span>
        <span class="text-slate-400">Low (0.15) to Maximum Fusion (0.95)</span>
      </div>
      <div class="grid grid-cols-5 gap-8 text-center font-mono text-[11px] text-slate-400 w-full max-w-xl">
        <span class="text-sky-400 font-semibold">0.15 (Subtle)</span>
        <span class="text-teal-400 font-semibold">0.35 (Light)</span>
        <span class="text-emerald-400 font-semibold">0.55 (Medium)</span>
        <span class="text-amber-400 font-semibold">0.75 (Strong)</span>
        <span class="text-rose-400 font-semibold">0.95 (Molten)</span>
      </div>
    </div>

    <!-- Gallery Container -->
    <div id="galleryContainer" class="space-y-6">
      <!-- Injected by JavaScript -->
    </div>
  </div>

  <script>
    const dataset = ${shapesDataJson}
    let currentMode = 'pref' // 'pref' or 'weld'
    let currentLayout = 'all' // 'all', 'horizontal', 'diagonal-right', 'elbow', 'block'
    let currentShape = 'all'

    // Populate shape select
    const sel = document.getElementById('shapeFilter')
    dataset.forEach(s => {
      const opt = document.createElement('option')
      opt.value = s.id
      opt.textContent = s.label
      sel.appendChild(opt)
    })

    function setMode(mode) {
      currentMode = mode
      document.getElementById('btnModePref').className = mode === 'pref'
        ? 'mode-btn px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 text-white shadow-sm'
        : 'mode-btn px-3 py-1.5 text-xs font-semibold rounded-lg text-slate-400 hover:text-white'
      document.getElementById('btnModeWeld').className = mode === 'weld'
        ? 'mode-btn px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 text-white shadow-sm'
        : 'mode-btn px-3 py-1.5 text-xs font-semibold rounded-lg text-slate-400 hover:text-white'
      render()
    }

    function setLayout(layout) {
      currentLayout = layout
      document.querySelectorAll('.layout-btn').forEach(btn => {
        const active = (layout === 'all' && btn.textContent.includes('All')) ||
                       (layout !== 'all' && btn.getAttribute('onclick').includes("'" + layout + "'"))
        btn.className = active
          ? 'layout-btn px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-800 text-white'
          : 'layout-btn px-2.5 py-1 text-xs font-medium rounded-lg text-slate-400 hover:text-white'
      })
      render()
    }

    function filterShape(shapeId) {
      currentShape = shapeId
      render()
    }

    function render() {
      const container = document.getElementById('galleryContainer')
      container.innerHTML = ''

      const filteredShapes = dataset.filter(s => currentShape === 'all' || s.id === currentShape)

      filteredShapes.forEach(shape => {
        const filteredLayouts = shape.layouts.filter(l => currentLayout === 'all' || l.layoutId === currentLayout)
        if (!filteredLayouts.length) return

        const card = document.createElement('div')
        card.className = 'shape-card bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4'

        const rowsHtml = filteredLayouts.map(layout => {
          const steps = currentMode === 'pref' ? layout.prefSteps : layout.weldSteps
          const methodLabel = currentMode === 'pref' ? layout.userMethod.toUpperCase() : 'WELD'

          const stepCols = steps.map(s => {
            const pathSvg = s.paths.map(p => '<path d=\"' + p + '\" fill=\"currentColor\" fill-rule=\"evenodd\" class=\"text-slate-800 dark:text-slate-200\" />').join('')
            const outSvg = s.outlines.map(p => '<path d=\"' + p + '\" fill=\"none\" stroke=\"#0000ee\" stroke-width=\"0.45\" stroke-dasharray=\"1 1\" opacity=\"0.55\" />').join('')

            return \`
              <div class="bg-slate-950/70 border border-slate-800/80 rounded-xl p-2.5 flex flex-col items-center">
                <div class="flex items-center justify-between w-full mb-1 text-[10px]">
                  <span class="font-bold text-slate-400">\${s.softness.toFixed(2)}</span>
                  <span class="font-mono \${s.pathsCount === 1 ? 'text-emerald-400' : 'text-rose-400'}">
                    \${s.pathsCount === 1 ? '1 path ✓' : s.pathsCount + ' paths'}
                  </span>
                </div>
                <div class="w-full aspect-square max-w-[125px]">
                  <svg viewBox="-40 -40 162 162" class="w-full h-full">
                    \${pathSvg}
                    \${outSvg}
                  </svg>
                </div>
              </div>
            \`
          }).join('')

          return \`
            <div class="space-y-2 border-b border-slate-800/60 pb-4 last:border-b-0 last:pb-0">
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold text-slate-300">\${layout.layoutLabel}</span>
                <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-indigo-300 border border-slate-700">
                  Method: \${methodLabel}
                </span>
              </div>
              <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
                \${stepCols}
              </div>
            </div>
          \`
        }).join('')

        card.innerHTML = \`
          <div class="flex items-center justify-between border-b border-slate-800 pb-2.5">
            <div>
              <h2 class="text-base font-bold text-white">\${shape.label}</h2>
              <p class="text-xs text-slate-400">Size: \${shape.size}px · Corner Rounding: \${shape.roundedness}px</p>
            </div>
            <span class="text-xs font-mono bg-slate-800 text-slate-300 px-2.5 py-1 rounded-lg border border-slate-700">
              \${shape.id}
            </span>
          </div>
          <div class="space-y-4">
            \${rowsHtml}
          </div>
        \`
        container.appendChild(card)
      })
    }

    render()
  </script>
</body>
</html>`
}

const html = renderHtml()
writeFileSync(`${root}docs/all-shapes-softness-lab.html`, html)
writeFileSync(`${root}public/docs/all-shapes-softness-lab.html`, html)
console.log('Saved docs/all-shapes-softness-lab.html and public/docs/all-shapes-softness-lab.html!')
