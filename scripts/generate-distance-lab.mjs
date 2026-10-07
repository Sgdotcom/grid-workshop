import { createJiti } from 'jiti'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const jiti = createJiti(import.meta.url, { alias: { '@': path.resolve(root, 'src') } })

const { PRESET_SHAPES } = await jiti.import('../src/lib/types.ts')
const { makeSoftStamp, organicWeld, contactSites } = await jiti.import('../src/lib/softness.ts')
const { toPolygon, unionPolygons, multiPolygonToPathList } = await jiti.import('../src/lib/polyBool.ts')

const targetShapes = ['square', 'pentagon', 'cross', 'star4', 'x', 'circle']
const sizes = [37, 44, 50, 56]
const layouts = [
  { id: 'diagonal-right', label: 'Diagonal ↘', colB: 1, rowB: 1 },
  { id: 'horizontal', label: 'Horizontal', colB: 1, rowB: 0 },
]

const matrix = []

for (const sid of targetShapes) {
  const shape = PRESET_SHAPES.find(s => s.preset === sid)
  if (!shape) continue

  for (const layout of layouts) {
    const sizeCases = sizes.map(size => {
      const a = makeSoftStamp('0:0', 0, 0, 20, 20, size, shape, 20 - size / 2, 20 - size / 2)
      const b = makeSoftStamp(`${layout.colB}:${layout.rowB}`, layout.colB, layout.rowB, 20 + 42 * layout.colB, 20 + 42 * layout.rowB, size, shape, 20 + 42 * layout.colB - size / 2, 20 + 42 * layout.rowB - size / 2)

      const site = contactSites(a, b)[0]
      const gap = site ? +site.gap.toFixed(1) : 0

      const polyA = toPolygon(a.rings)
      const polyB = toPolygon(b.rings)
      const outlines = [...multiPolygonToPathList([polyA]), ...multiPolygonToPathList([polyB])]

      // Unconstrained Method B weld
      const welds = organicWeld(a, b, 1.0)
      const currentUnion = unionPolygons([polyA, polyB, ...welds])
      const currentPaths = multiPolygonToPathList(currentUnion)

      // Solid unified (no trapped hole)
      const solidUnion = currentUnion.length && currentUnion[0].length > 1 ? [currentUnion[0].slice(0, 1)] : currentUnion
      const solidPaths = multiPolygonToPathList(solidUnion)

      // Distance-gated: only weld if gap <= 15px; if gap > 15px, keep separate
      const gatedPaths = gap <= 16 ? solidPaths : outlines

      return {
        size,
        gap,
        currentPaths,
        solidPaths,
        gatedPaths,
        outlines,
      }
    })

    matrix.push({
      shapeId: sid,
      label: shape.label,
      layoutId: layout.id,
      layoutLabel: layout.label,
      sizeCases,
    })
  }
}

console.log(`Computed ${matrix.length} scenarios across 4 sizes.`)

function renderHtml(isStandalone) {
  const bgBody = isStandalone ? "bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 p-6" : "bg-transparent text-[var(--foreground)] p-4"
  const cardBg = isStandalone ? "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800" : "bg-[var(--card)] text-[var(--foreground)] border border-[var(--border)]"
  const subCardBg = isStandalone ? "bg-slate-50 dark:bg-slate-950/60" : "bg-[var(--sidebar)]"
  const borderSub = isStandalone ? "border-slate-100 dark:border-slate-800" : "border-[var(--border)]"
  const textMuted = isStandalone ? "text-slate-500 dark:text-slate-400" : "text-[var(--muted-foreground)]"
  const textTitle = isStandalone ? "text-slate-900 dark:text-slate-100" : "text-[var(--foreground)]"

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Distance & Proximity Lab: How Gap Size Affects Natural Blends</title>
  <script src="https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js"></script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  </style>
</head>
<body class="${bgBody}">
  <div class="max-w-4xl mx-auto space-y-4">
    <!-- Header -->
    <div class="flex flex-wrap items-center justify-between gap-3 border-b ${borderSub} pb-3">
      <div>
        <h1 class="text-base font-bold ${textTitle}">Distance & Proximity Lab</h1>
        <p class="text-xs ${textMuted} mt-0.5">
          Observing how shape distance / gap determines whether a blend looks natural vs stretched.
        </p>
      </div>
      <a href="http://127.0.0.1:43127/docs/distance-and-proximity-lab.html" target="_blank" class="text-xs text-blue-600 dark:text-blue-400 hover:underline">
        Open in browser ↗
      </a>
    </div>

    <!-- Interactive Controls -->
    <div class="flex flex-wrap items-center justify-between gap-3 text-xs">
      <!-- Shape Pills -->
      <div class="flex flex-wrap gap-1.5" id="shape-pills">
        ${targetShapes.map((s, idx) => `
          <button onclick="setShape('${s}')" id="btn-shape-${s}" class="px-3 py-1.5 rounded-lg font-semibold transition ${idx === 2 ? 'bg-blue-600 text-white shadow-sm' : `${subCardBg} hover:bg-slate-200 dark:hover:bg-slate-800 ${textTitle}`}">
            ${PRESET_SHAPES.find(x => x.preset === s)?.label || s}
          </button>
        `).join('')}
      </div>

      <!-- Layout Switcher -->
      <div class="flex items-center gap-1.5 font-medium">
        <span class="${textMuted}">Layout:</span>
        <button onclick="setLayout('diagonal-right')" id="btn-layout-diagonal-right" class="px-2.5 py-1 rounded bg-blue-600 text-white font-semibold">
          Diagonal ↘
        </button>
        <button onclick="setLayout('horizontal')" id="btn-layout-horizontal" class="px-2.5 py-1 rounded ${subCardBg} ${textTitle}">
          Horizontal
        </button>
      </div>
    </div>

    <!-- Insight Banner -->
    <div class="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-xs space-y-1">
      <div class="font-semibold text-blue-600 dark:text-blue-400 flex items-center justify-between">
        <span id="insight-title">Gap Analysis</span>
        <span id="insight-gap" class="font-mono text-[11px] bg-blue-500/20 px-2 py-0.5 rounded">Gap: --</span>
      </div>
      <p class="${textMuted}" id="insight-desc">
        Why it looks weird: When shapes are far apart (large gap), the algorithm stretches flying struts across empty air. As shapes get closer, the weld contracts into a natural, tight fillet.
      </p>
    </div>

    <!-- 4 Sizes Progression Grid -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 pt-1" id="sizes-grid">
      <!-- Populated dynamically -->
    </div>

    <!-- Comparison Toggle Mode -->
    <div class="flex items-center justify-between pt-2 border-t ${borderSub} text-xs">
      <div class="flex items-center gap-2">
        <span class="${textMuted}">Render Mode:</span>
        <label class="flex items-center gap-1.5 cursor-pointer">
          <input type="radio" name="mode" value="current" onchange="setMode('current')">
          <span>Current (Forced Weld)</span>
        </label>
        <label class="flex items-center gap-1.5 cursor-pointer font-semibold text-emerald-600 dark:text-emerald-400">
          <input type="radio" name="mode" value="solid" checked onchange="setMode('solid')">
          <span>Solid Neck (Closer is Natural)</span>
        </label>
        <label class="flex items-center gap-1.5 cursor-pointer text-indigo-600 dark:text-indigo-400">
          <input type="radio" name="mode" value="gated" onchange="setMode('gated')">
          <span>Distance Gated (No Weld if Gap &gt; 16px)</span>
        </label>
      </div>
    </div>

  </div>

  <script>
    const data = ${JSON.stringify(matrix)};
    let activeShape = 'cross';
    let activeLayout = 'diagonal-right';
    let activeMode = 'solid';

    function setShape(s) {
      activeShape = s;
      document.querySelectorAll('#shape-pills button').forEach(b => {
        b.className = b.id === 'btn-shape-' + s
          ? 'px-3 py-1.5 rounded-lg font-semibold transition bg-blue-600 text-white shadow-sm'
          : 'px-3 py-1.5 rounded-lg font-semibold transition ${subCardBg} hover:bg-slate-200 dark:hover:bg-slate-800 ${textTitle}';
      });
      render();
    }

    function setLayout(l) {
      activeLayout = l;
      ['diagonal-right', 'horizontal'].forEach(id => {
        const b = document.getElementById('btn-layout-' + id);
        b.className = id === l
          ? 'px-2.5 py-1 rounded bg-blue-600 text-white font-semibold'
          : 'px-2.5 py-1 rounded ${subCardBg} ${textTitle}';
      });
      render();
    }

    function setMode(m) {
      activeMode = m;
      render();
    }

    function render() {
      const textTitle = "${textTitle}";
      const textMuted = "${textMuted}";
      const scenario = data.find(x => x.shapeId === activeShape && x.layoutId === activeLayout);
      if (!scenario) return;

      const sz37 = scenario.sizeCases[0];
      const sz56 = scenario.sizeCases[3];
      document.getElementById('insight-gap').textContent = 'Gap: ' + sz37.gap + 'px (size 37) → ' + sz56.gap + 'px (size 56)';

      if (sz37.gap > 20) {
        document.getElementById('insight-desc').textContent = 
          'At standard size 37, this diagonal gap is huge (' + sz37.gap + 'px across a 42px cell!). Forcing a weld across that chasm creates thin, awkward struts. Look at size 50 and 56 below: as the shapes get closer (' + sz56.gap + 'px gap), the weld naturally contracts into a tight, organic joint!';
      } else {
        document.getElementById('insight-desc').textContent = 
          'At size 37, the gap is only ' + sz37.gap + 'px, so the weld is relatively compact. Notice how clean it becomes as size increases and shapes touch.';
      }

      const grid = document.getElementById('sizes-grid');
      const sizeLabels = ['Size 37 (Standard / Far)', 'Size 44 (Medium)', 'Size 50 (Close)', 'Size 56 (Touching / Overlap)'];
      grid.innerHTML = scenario.sizeCases.map((c, i) => {
        let paths = c.solidPaths;
        let color = 'text-emerald-600 dark:text-emerald-400';
        if (activeMode === 'current') {
          paths = c.currentPaths;
          color = 'text-slate-700 dark:text-slate-300';
        } else if (activeMode === 'gated') {
          paths = c.gatedPaths;
          color = c.gap <= 16 ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400';
        }

        const isGatedOut = activeMode === 'gated' && c.gap > 16;

        return \`
          <div class="${cardBg} rounded-2xl p-3 flex flex-col items-center space-y-2">
            <div class="text-center">
              <div class="text-[11px] font-bold \${textTitle}">\${sizeLabels[i]}</div>
              <div class="text-[10px] font-mono \${c.gap <= 8 ? 'text-emerald-500 font-bold' : textMuted}">
                Gap: \${c.gap}px \${c.gap <= 8 ? '✓ Close' : '⚠ Far'}
              </div>
            </div>

            <div class="w-full aspect-square max-w-[125px]">
              <svg viewBox="-5 -5 94 94" class="w-full h-full">
                \${paths.map(d => \`<path d="\${d}" fill="\${isGatedOut ? 'none' : 'currentColor'}" stroke="\${isGatedOut ? '#6366f1' : 'none'}" stroke-width="\${isGatedOut ? 0.75 : 0}" fill-rule="evenodd" class="\${color}"/>\`).join('')}
                \${c.outlines.map(d => \`<path d="\${d}" fill="none" stroke="#2563eb" stroke-width="0.5" stroke-dasharray="1 1" class="opacity-50"/>\`).join('')}
              </svg>
            </div>
            
            <div class="text-[10px] text-center \${textMuted}">
              \${i === 0 ? 'Stretched / Awkward' : i === 3 ? 'Tight & Organic' : 'Tapering inward'}
            </div>
          </div>
        \`;
      }).join('');
    }

    render();
  </script>
</body>
</html>`
}

writeFileSync(`${root}docs/distance-and-proximity-lab.html`, renderHtml(true))
console.log('Saved docs/distance-and-proximity-lab.html')

writeFileSync(`/Users/simongrey/.gemini/antigravity/brain/b61d01eb-bbab-498d-a338-d0c6fa092a6f/distance_proximity_lab.html`, renderHtml(false), {
  ArtifactMetadata: {
    Summary: "Interactive lab showing how distance / gap between shapes controls blend naturalness.",
    UserFacing: true,
    RequestFeedback: false
  }
})
console.log('Saved brain distance_proximity_lab.html')
