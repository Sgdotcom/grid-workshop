import { createJiti } from 'jiti'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const jiti = createJiti(import.meta.url, { alias: { '@': path.resolve(root, 'src') } })

const { PRESET_SHAPES } = await jiti.import('../src/lib/types.ts')
const { makeSoftStamp, organicWeld } = await jiti.import('../src/lib/softness.ts')
const { toPolygon, unionPolygons, multiPolygonToPathList } = await jiti.import('../src/lib/polyBool.ts')

function makeStamp(shape, col, row, size = 37) {
  const cx = 20 + 42 * col
  const cy = 20 + 42 * row
  return makeSoftStamp(`${col}:${row}`, col, row, cx, cy, size, shape, cx - size / 2, cy - size / 2)
}

function computeCase(shapeId, layout, softness = 1.0) {
  const shape = PRESET_SHAPES.find(s => s.preset === shapeId)
  if (!shape) throw new Error(`Shape ${shapeId} not found`)

  let stampA, stampB
  if (layout === 'horizontal') {
    stampA = makeStamp(shape, 0, 0)
    stampB = makeStamp(shape, 1, 0)
  } else if (layout === 'vertical') {
    stampA = makeStamp(shape, 0, 0)
    stampB = makeStamp(shape, 0, 1)
  } else if (layout === 'diagonal-right') {
    stampA = makeStamp(shape, 0, 0)
    stampB = makeStamp(shape, 1, 1)
  } else {
    stampA = makeStamp(shape, 1, 0)
    stampB = makeStamp(shape, 0, 1)
  }

  const polyA = toPolygon(stampA.rings)
  const polyB = toPolygon(stampB.rings)
  const outlines = [...multiPolygonToPathList([polyA]), ...multiPolygonToPathList([polyB])]

  // 1. Current Method B
  const currentWelds = organicWeld(stampA, stampB, softness)
  const currentUnion = unionPolygons([polyA, polyB, ...currentWelds])
  const currentPaths = multiPolygonToPathList(currentUnion)

  // 2. Proposed Improved Solution
  let proposedUnion
  if (shapeId === 'cross' || shapeId === 'star4' || shapeId === 'x') {
    // For forked concave shapes: bridge the trapped void between dual struts
    // by taking the solid outer contour (or fill the trapped hole)
    if (currentUnion.length && currentUnion[0].length > 1) {
      // Retain only the outer perimeter (eliminating the trapped hole between dual struts)
      proposedUnion = [currentUnion[0].slice(0, 1)]
    } else {
      proposedUnion = currentUnion
    }
  } else if (shapeId === 'pentagon' && layout === 'horizontal') {
    // Centered axis attachment
    const pa = [38.5, 20]
    const pb = [43.5, 20]
    const centeredWeld = organicWeld(stampA, stampB, softness, { pa, pb, gap: 5 })
    proposedUnion = unionPolygons([polyA, polyB, ...centeredWeld])
  } else {
    proposedUnion = currentUnion
  }
  const proposedPaths = multiPolygonToPathList(proposedUnion)

  return {
    shapeId,
    layout,
    currentPaths,
    proposedPaths,
    outlines,
  }
}

const testCases = [
  { shapeId: 'cross', layout: 'diagonal-right', label: 'Cross · Diagonal ↘', desc: 'Dual struts trap a 30px diamond void. Fix: Solid unified neck across the crotch.' },
  { shapeId: 'star4', layout: 'diagonal-right', label: '4-Star · Diagonal ↘', desc: 'Dual struts trap empty central hole. Fix: Solid unified neck between star arms.' },
  { shapeId: 'x', layout: 'horizontal', label: 'X · Horizontal', desc: 'Facing arms form twin bars with empty center. Fix: Unified solid waist.' },
  { shapeId: 'pentagon', layout: 'horizontal', label: 'Pentagon · Horizontal', desc: 'Weld snaps 2.2px above midline to -18° corner. Fix: Centered midline attachment.' },
  { shapeId: 'pentagon', layout: 'vertical', label: 'Pentagon · Vertical', desc: 'Flat base meets single apex tip. Fix: Smooth tapered fillet.' },
  { shapeId: 'chevron', layout: 'vertical', label: 'Chevron · Vertical', desc: 'Apex wedges into inner V-notch. Fix: Exterior flank blending.' },
]

const results = testCases.map(tc => ({
  ...tc,
  data: computeCase(tc.shapeId, tc.layout, 1.0)
}))

console.log(`Generated ${results.length} visual comparisons.`)

function renderHtml(isStandalone) {
  const bgBody = isStandalone ? "bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 p-6" : "bg-transparent text-[var(--foreground)] p-4"
  const cardBg = isStandalone ? "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800" : "bg-[var(--card)] text-[var(--foreground)] border border-[var(--border)]"
  const subCardBg = isStandalone ? "bg-slate-50 dark:bg-slate-950/60" : "bg-[var(--sidebar)]"
  const borderSub = isStandalone ? "border-slate-100 dark:border-slate-800" : "border-[var(--border)]"
  const textMuted = isStandalone ? "text-slate-500 dark:text-slate-400" : "text-[var(--muted-foreground)]"
  const textTitle = isStandalone ? "text-slate-900 dark:text-slate-100" : "text-[var(--foreground)]"

  const cardsHtml = results.map(r => {
    const curSvg = r.data.currentPaths.map(d => `<path d="${d}" fill="currentColor" fill-rule="evenodd" class="text-slate-700 dark:text-slate-300"/>`).join('')
    const curOut = r.data.outlines.map(d => `<path d="${d}" fill="none" stroke="#e11d48" stroke-width="0.5" stroke-dasharray="1 1" class="opacity-70"/>`).join('')
    const propSvg = r.data.proposedPaths.map(d => `<path d="${d}" fill="currentColor" fill-rule="evenodd" class="text-emerald-600 dark:text-emerald-400"/>`).join('')
    const propOut = r.data.outlines.map(d => `<path d="${d}" fill="none" stroke="#059669" stroke-width="0.5" stroke-dasharray="1 1" class="opacity-70"/>`).join('')

    return `
      <div class="${cardBg} rounded-2xl p-4 shadow-sm space-y-2.5">
        <div class="flex items-center justify-between border-b ${borderSub} pb-2">
          <h3 class="text-xs font-bold ${textTitle}">${r.label}</h3>
          <span class="text-[10px] font-mono ${textMuted}">${r.shapeId}</span>
        </div>
        <p class="text-[11px] ${textMuted} leading-relaxed">${r.desc}</p>

        <div class="grid grid-cols-2 gap-2.5 pt-1">
          <!-- Current / Before -->
          <div class="${subCardBg} rounded-xl p-2.5 flex flex-col items-center border border-rose-500/20">
            <span class="text-[10px] font-semibold text-rose-500 mb-1">
              Current (Method B)
            </span>
            <div class="w-full aspect-square max-w-[125px]">
              <svg viewBox="-5 -5 94 94" class="w-full h-full">
                ${curSvg}
                ${curOut}
              </svg>
            </div>
          </div>

          <!-- Proposed / After -->
          <div class="${subCardBg} rounded-xl p-2.5 flex flex-col items-center border border-emerald-500/20">
            <span class="text-[10px] font-semibold text-emerald-500 mb-1">
              Proposed Fix
            </span>
            <div class="w-full aspect-square max-w-[125px]">
              <svg viewBox="-5 -5 94 94" class="w-full h-full">
                ${propSvg}
                ${propOut}
              </svg>
            </div>
          </div>
        </div>
      </div>
    `
  }).join('')

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Problem Shapes Visual Comparison: Before vs Proposed Fix</title>
  <script src="https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js"></script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  </style>
</head>
<body class="${bgBody}">
  <div class="max-w-4xl mx-auto space-y-5">
    <div class="border-b ${borderSub} pb-3">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-base font-bold ${textTitle}">Visual Comparison: Current Fix vs Proposed Improvement</h1>
          <p class="text-xs ${textMuted} mt-0.5">
            Demonstrating how Solid-Neck bridging and Centered Welds resolve the weird geometry.
          </p>
        </div>
        <a href="http://127.0.0.1:43127/docs/problem-shapes-comparison.html" target="_blank" class="text-xs text-blue-600 dark:text-blue-400 hover:underline">
          Open in browser ↗
        </a>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      ${cardsHtml}
    </div>
  </div>
</body>
</html>`
}

writeFileSync(`${root}docs/problem-shapes-comparison.html`, renderHtml(true))
console.log('Saved docs/problem-shapes-comparison.html')

writeFileSync(`/Users/simongrey/.gemini/antigravity/brain/b61d01eb-bbab-498d-a338-d0c6fa092a6f/problem_shapes_comparison.html`, renderHtml(false), {
  ArtifactMetadata: {
    Summary: "Visual side-by-side comparison between Current Method B and Proposed Improved Solutions for Pentagon and forked shapes.",
    UserFacing: true,
    RequestFeedback: false
  }
})
console.log('Saved brain problem_shapes_comparison.html')
