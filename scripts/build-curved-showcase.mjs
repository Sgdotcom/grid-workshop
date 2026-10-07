import { createJiti } from 'jiti'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const jiti = createJiti(import.meta.url, { alias: { '@': path.resolve(root, 'src') } })

const { PRESET_SHAPES } = await jiti.import('../src/lib/types.ts')
const { makeSoftStamp, organicWeld } = await jiti.import('../src/lib/softness.ts')
const { toPolygon, unionPolygons, multiPolygonToPathList } = await jiti.import('../src/lib/polyBool.ts')

function sampleCubic(p0, p1, p2, p3, steps = 18) {
  const pts = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const mt = 1 - t
    pts.push([
      mt * mt * mt * p0[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + t * t * t * p3[0],
      mt * mt * mt * p0[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + t * t * t * p3[1],
    ])
  }
  return pts
}

function formatPath(pts) {
  return 'M ' + pts.map(p => p[0].toFixed(2) + ' ' + p[1].toFixed(2)).join(' L ') + ' Z'
}

function makeStamp(shape, col, row, size = 37) {
  const cx = 20 + 42 * col
  const cy = 20 + 42 * row
  return makeSoftStamp(`${col}:${row}`, col, row, cx, cy, size, shape, cx - size / 2, cy - size / 2)
}

// 1. Cross Diagonal
// Size 37:
// Arm width 11.9px. Cross A center (20, 20), Cross B center (62, 62).
// Arm 1 horizontal tip: (38.5, 20), right edge x=38.5, y from 14.05 to 25.95
// Arm 2 vertical tip: (62, 43.5), top edge y=43.5, x from 56.05 to 67.95
function buildCrossShowcase() {
  const shape = PRESET_SHAPES.find(s => s.preset === 'cross')
  const sA = makeStamp(shape, 0, 0, 37)
  const sB = makeStamp(shape, 1, 1, 37)
  const pA = toPolygon(sA.rings)
  const pB = toPolygon(sB.rings)

  // Current Method B (straight chamfer with dual struts / trapped void)
  const welds = organicWeld(sA, sB, 1.0)
  const curUnion = unionPolygons([pA, pB, ...welds])
  const curPaths = multiPolygonToPathList(curUnion)

  // Straight Chamfer (What was proposed: filling void, but leaving flat straight diagonal lines)
  const filledHole = [curUnion[0].slice(0, 1)]
  const straightPaths = multiPolygonToPathList(filledHole)

  // True Soft Rolling Fillet (90-degree circular corner fillet bridging horizontal arm to vertical arm)
  // Cross A right arm top corner: (38.5, 14.05) -> sweeps in circular arc down and right to Cross B top arm left corner: (56.05, 43.5)
  // Fillet radius r ≈ 22px
  const rTop = 22
  const filletTop = sampleCubic(
    [38.5, 14.05],
    [38.5, 14.05 + rTop * 0.55],
    [56.05 - rTop * 0.55, 43.5],
    [56.05, 43.5],
    18
  )
  const rBot = 22
  // Cross B top arm bottom-left corner: (67.95, 43.5) or other side:
  // Cross B left-vertical arm bottom corner: (43.5, 67.95)
  // Cross A bottom-arm right corner: (25.95, 38.5)
  const filletBot = sampleCubic(
    [43.5, 56.05],
    [43.5 - rBot * 0.55, 56.05],
    [14.05, 38.5 - rBot * 0.55],
    [14.05, 38.5],
    18
  )

  // Outline of Cross A + Cross B with fillet
  // Let's build solid fillet polygon:
  const softFilletPoly = [
    [
      ...sA.rings[0].slice(0, 3), // around cross A
      ...filletTop,
      ...sB.rings[0].slice(0, 6), // around cross B
      ...filletBot,
    ]
  ]

  // Also close proximity: size 48 (gap = 5px)
  const sA_close = makeStamp(shape, 0, 0, 48)
  const sB_close = makeStamp(shape, 1, 1, 48)
  const pA_close = toPolygon(sA_close.rings)
  const pB_close = toPolygon(sB_close.rings)
  const welds_close = organicWeld(sA_close, sB_close, 1.0)
  const closeUnion = unionPolygons([pA_close, pB_close, ...welds_close])
  const closePaths = multiPolygonToPathList(closeUnion)

  return {
    curPaths,
    straightPaths,
    softFilletPaths: [formatPath([
      // Cross A top arm
      [14.05, 1.5], [25.95, 1.5], [25.95, 14.05], [38.5, 14.05],
      // Rolling Fillet Top (curves inward into crotch)
      ...filletTop,
      // Cross B top-right
      [67.95, 43.5], [67.95, 56.05], [80.5, 56.05], [80.5, 67.95], [67.95, 67.95], [67.95, 80.5],
      [56.05, 80.5], [56.05, 67.95], [43.5, 67.95],
      // Rolling Fillet Bottom
      ...sampleCubic([43.5, 67.95], [30.0, 67.95], [25.95, 52.0], [25.95, 38.5], 18),
      // Cross A bottom-left
      [14.05, 38.5], [14.05, 25.95], [1.5, 25.95], [1.5, 14.05], [14.05, 14.05]
    ])],
    closePaths,
    outlines: [...multiPolygonToPathList([pA]), ...multiPolygonToPathList([pB])],
    outlinesClose: [...multiPolygonToPathList([pA_close]), ...multiPolygonToPathList([pB_close])]
  }
}

// 2. 4-Star Diagonal
function buildStar4Showcase() {
  const shape = PRESET_SHAPES.find(s => s.preset === 'star4')
  const sA = makeStamp(shape, 0, 0, 37)
  const sB = makeStamp(shape, 1, 1, 37)
  const pA = toPolygon(sA.rings)
  const pB = toPolygon(sB.rings)

  const welds = organicWeld(sA, sB, 1.0)
  const curUnion = unionPolygons([pA, pB, ...welds])
  const curPaths = multiPolygonToPathList(curUnion)
  const straightPaths = multiPolygonToPathList([curUnion[0].slice(0, 1)])

  // Soft rolling fillet between star points:
  // Star A right point (38.5, 20), inner notch (25.5, 25.5), bottom point (20, 38.5)
  // Star B left point (43.5, 62), top point (62, 43.5)
  // Curve from Star A right point toward Star B top point:
  const filletTop = sampleCubic([38.5, 20], [42, 28], [52, 38], [62, 43.5], 18)
  const filletBot = sampleCubic([43.5, 62], [38, 52], [28, 42], [20, 38.5], 18)

  const softPaths = [formatPath([
    [20, 1.5], [25.5, 14.5], [38.5, 20],
    ...filletTop,
    [74.5, 49], [80.5, 62], [74.5, 74.5], [62, 80.5], [49, 74.5], [43.5, 62],
    ...filletBot,
    [14.5, 25.5], [1.5, 20], [14.5, 14.5]
  ])]

  // Close proximity: size 50
  const sA_close = makeStamp(shape, 0, 0, 50)
  const sB_close = makeStamp(shape, 1, 1, 50)
  const pA_close = toPolygon(sA_close.rings)
  const pB_close = toPolygon(sB_close.rings)
  const welds_close = organicWeld(sA_close, sB_close, 1.0)
  const closeUnion = unionPolygons([pA_close, pB_close, ...welds_close])
  const closePaths = multiPolygonToPathList(closeUnion)

  return {
    curPaths,
    straightPaths,
    softFilletPaths: softPaths,
    closePaths,
    outlines: [...multiPolygonToPathList([pA]), ...multiPolygonToPathList([pB])],
    outlinesClose: [...multiPolygonToPathList([pA_close]), ...multiPolygonToPathList([pB_close])]
  }
}

// 3. Pentagon Horizontal
function buildPentagonHShowcase() {
  const shape = PRESET_SHAPES.find(s => s.preset === 'pentagon')
  const sA = makeStamp(shape, 0, 0, 37)
  const sB = makeStamp(shape, 1, 0, 37)
  const pA = toPolygon(sA.rings)
  const pB = toPolygon(sB.rings)

  const welds = organicWeld(sA, sB, 1.0)
  const curUnion = unionPolygons([pA, pB, ...welds])
  const curPaths = multiPolygonToPathList(curUnion)

  // Shallow / Flat Straight Bridge (current target clamp):
  // Top curve dips only ~1px from 9.5 to 10.6
  const pTopShallow = sampleCubic([30, 9.5], [37, 11], [45, 11], [52, 9.5], 16)
  const pBotShallow = sampleCubic([52, 35], [45, 33], [37, 33], [30, 35], 16)
  const straightPaths = [formatPath([
    [1.5, 16], [20, 2.5],
    ...pTopShallow,
    [62, 2.5], [80.5, 16], [73.5, 37.5],
    ...pBotShallow,
    [8.5, 37.5]
  ])]

  // Deep Molten Hourglass Waist (dips 5px inward on top, 8px inward on bottom):
  const pTopDeep = sampleCubic([30, 9.5], [36, 14.5], [46, 14.5], [52, 9.5], 16)
  const pBotDeep = sampleCubic([52, 35], [46, 26.5], [36, 26.5], [30, 35], 16)
  const softPaths = [formatPath([
    [1.5, 16], [20, 2.5],
    ...pTopDeep,
    [62, 2.5], [80.5, 16], [73.5, 37.5],
    ...pBotDeep,
    [8.5, 37.5]
  ])]

  // Close proximity: size 46 (gap = 2.5px)
  const sA_close = makeStamp(shape, 0, 0, 46)
  const sB_close = makeStamp(shape, 1, 0, 46)
  const pA_close = toPolygon(sA_close.rings)
  const pB_close = toPolygon(sB_close.rings)
  const welds_close = organicWeld(sA_close, sB_close, 1.0)
  const closeUnion = unionPolygons([pA_close, pB_close, ...welds_close])
  const closePaths = multiPolygonToPathList(closeUnion)

  return {
    curPaths,
    straightPaths,
    softFilletPaths: softPaths,
    closePaths,
    outlines: [...multiPolygonToPathList([pA]), ...multiPolygonToPathList([pB])],
    outlinesClose: [...multiPolygonToPathList([pA_close]), ...multiPolygonToPathList([pB_close])]
  }
}

// 4. X Shape Horizontal
function buildXShowcase() {
  const shape = PRESET_SHAPES.find(s => s.preset === 'x')
  const sA = makeStamp(shape, 0, 0, 37)
  const sB = makeStamp(shape, 1, 0, 37)
  const pA = toPolygon(sA.rings)
  const pB = toPolygon(sB.rings)

  const welds = organicWeld(sA, sB, 1.0)
  const curUnion = unionPolygons([pA, pB, ...welds])
  const curPaths = multiPolygonToPathList(curUnion)
  const straightPaths = multiPolygonToPathList([curUnion[0].slice(0, 1)])

  // Soft rolling waist filling the crotch smoothly
  const filletTop = sampleCubic([33, 7], [38, 14], [44, 14], [49, 7], 16)
  const filletBot = sampleCubic([49, 33], [44, 26], [38, 26], [33, 33], 16)
  const softPaths = [formatPath([
    [7, 7], [14, 20], [7, 33], [14, 33], [20, 26], [26, 33], [33, 33],
    ...sampleCubic([33, 33], [37, 24], [45, 24], [49, 33], 16),
    [56, 33], [62, 26], [68, 33], [75, 33], [68, 20], [75, 7], [68, 7], [62, 14], [56, 7], [49, 7],
    ...sampleCubic([49, 7], [45, 16], [37, 16], [33, 7], 16),
    [26, 7], [20, 14], [14, 7]
  ])]

  const sA_close = makeStamp(shape, 0, 0, 48)
  const sB_close = makeStamp(shape, 1, 0, 48)
  const pA_close = toPolygon(sA_close.rings)
  const pB_close = toPolygon(sB_close.rings)
  const welds_close = organicWeld(sA_close, sB_close, 1.0)
  const closeUnion = unionPolygons([pA_close, pB_close, ...welds_close])
  const closePaths = multiPolygonToPathList(closeUnion)

  return {
    curPaths,
    straightPaths,
    softFilletPaths: softPaths,
    closePaths,
    outlines: [...multiPolygonToPathList([pA]), ...multiPolygonToPathList([pB])],
    outlinesClose: [...multiPolygonToPathList([pA_close]), ...multiPolygonToPathList([pB_close])]
  }
}

const showcases = [
  { id: 'cross', title: 'Cross · Diagonal ↘', desc: 'Perpendicular arms meeting across diagonal.', data: buildCrossShowcase() },
  { id: 'star4', title: '4-Star · Diagonal ↘', desc: 'Pointed arms meeting across diagonal gap.', data: buildStar4Showcase() },
  { id: 'pentagon', title: 'Pentagon · Horizontal ➔', desc: 'Slanted flank meeting vertical base flank.', data: buildPentagonHShowcase() },
  { id: 'x', title: 'X · Horizontal ➔', desc: 'Dual flared arms facing across horizontal gap.', data: buildXShowcase() },
]

function renderHTML(isStandalone) {
  const bgBody = isStandalone ? "bg-slate-900 text-slate-100 p-6" : "bg-transparent text-[var(--foreground)] p-4"
  const cardBg = "bg-slate-800/90 border border-slate-700/80"
  const colBg = "bg-slate-950/60 rounded-xl p-3 flex flex-col items-center border"

  const cardsHtml = showcases.map(sc => {
    const curSvg = sc.data.curPaths.map(d => `<path d="${d}" fill="#f43f5e" fill-rule="evenodd" opacity="0.85"/>`).join('')
    const curOut = sc.data.outlines.map(d => `<path d="${d}" fill="none" stroke="#f43f5e" stroke-width="0.75" stroke-dasharray="1.5 1.5" opacity="0.6"/>`).join('')

    const strSvg = sc.data.straightPaths.map(d => `<path d="${d}" fill="#fbbf24" fill-rule="evenodd" opacity="0.85"/>`).join('')
    const strOut = sc.data.outlines.map(d => `<path d="${d}" fill="none" stroke="#fbbf24" stroke-width="0.75" stroke-dasharray="1.5 1.5" opacity="0.6"/>`).join('')

    const sftSvg = sc.data.softFilletPaths.map(d => `<path d="${d}" fill="#10b981" fill-rule="evenodd" opacity="0.9"/>`).join('')
    const sftOut = sc.data.outlines.map(d => `<path d="${d}" fill="none" stroke="#34d399" stroke-width="0.75" stroke-dasharray="1.5 1.5" opacity="0.6"/>`).join('')

    const clsSvg = sc.data.closePaths.map(d => `<path d="${d}" fill="#38bdf8" fill-rule="evenodd" opacity="0.9"/>`).join('')
    const clsOut = sc.data.outlinesClose.map(d => `<path d="${d}" fill="none" stroke="#38bdf8" stroke-width="0.75" stroke-dasharray="1.5 1.5" opacity="0.6"/>`).join('')

    return `
      <div class="${cardBg} rounded-2xl p-5 shadow-lg space-y-4 mb-6">
        <div class="flex items-center justify-between border-b border-slate-700/80 pb-2.5">
          <div>
            <h3 class="text-sm font-bold text-white">${sc.title}</h3>
            <p class="text-xs text-slate-400 mt-0.5">${sc.desc}</p>
          </div>
          <span class="text-xs font-mono px-2 py-0.5 rounded bg-slate-700 text-slate-300">${sc.id}</span>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <!-- 1. Current Method B -->
          <div class="${colBg} border-rose-500/30">
            <span class="text-[11px] font-bold text-rose-400 mb-1">1. Current (Method B)</span>
            <span class="text-[10px] text-slate-400 text-center mb-2">Dual struts trap diamond void</span>
            <div class="w-full aspect-square max-w-[130px]">
              <svg viewBox="-5 -5 94 94" class="w-full h-full">
                ${curSvg}
                ${curOut}
              </svg>
            </div>
            <span class="text-[9px] font-mono text-rose-300 mt-2 bg-rose-950/50 px-1.5 py-0.5 rounded">Weird Void</span>
          </div>

          <!-- 2. Flat Chamfer (Too Straight) -->
          <div class="${colBg} border-amber-500/30">
            <span class="text-[11px] font-bold text-amber-400 mb-1">2. Straight Chamfer</span>
            <span class="text-[10px] text-slate-400 text-center mb-2">Flat 45° line (criticized as rigid)</span>
            <div class="w-full aspect-square max-w-[130px]">
              <svg viewBox="-5 -5 94 94" class="w-full h-full">
                ${strSvg}
                ${strOut}
              </svg>
            </div>
            <span class="text-[9px] font-mono text-amber-300 mt-2 bg-amber-950/50 px-1.5 py-0.5 rounded">No Softness</span>
          </div>

          <!-- 3. Soft Rolling Fillet / Deep Waist -->
          <div class="${colBg} border-emerald-500/40 shadow-emerald-950/30 shadow-md">
            <span class="text-[11px] font-bold text-emerald-400 mb-1">3. Natural Soft Curve</span>
            <span class="text-[10px] text-slate-400 text-center mb-2">90° rolling-ball fillet & deep waist</span>
            <div class="w-full aspect-square max-w-[130px]">
              <svg viewBox="-5 -5 94 94" class="w-full h-full">
                ${sftSvg}
                ${sftOut}
              </svg>
            </div>
            <span class="text-[9px] font-mono text-emerald-300 mt-2 bg-emerald-950/50 px-1.5 py-0.5 rounded font-bold">Liquid Curvature</span>
          </div>

          <!-- 4. Closer Proximity -->
          <div class="${colBg} border-sky-500/30">
            <span class="text-[11px] font-bold text-sky-400 mb-1">4. Close Spacing (Size 48-50)</span>
            <span class="text-[10px] text-slate-400 text-center mb-2">Proximity brings natural fusion</span>
            <div class="w-full aspect-square max-w-[130px]">
              <svg viewBox="-5 -5 94 94" class="w-full h-full">
                ${clsSvg}
                ${clsOut}
              </svg>
            </div>
            <span class="text-[9px] font-mono text-sky-300 mt-2 bg-sky-950/50 px-1.5 py-0.5 rounded">Natural Proximity</span>
          </div>
        </div>
      </div>
    `
  }).join('')

  return `<!doctype html>
<html lang="en" class="dark">
<head>
  <meta charset="utf-8">
  <title>Curvature & Softness Evolution: Chamfer vs Natural Fillet</title>
  <script src="https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js"></script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  </style>
</head>
<body class="${bgBody}">
  <div class="max-w-6xl mx-auto space-y-6">
    <div class="border-b border-slate-700 pb-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-bold text-white">Problem Shapes Curvature & Softness Evolution</h1>
          <p class="text-xs text-slate-400 mt-1 max-w-2xl">
            Comparing <strong>Current Method B</strong> (struts with trapped void), <strong>Straight Chamfer</strong> (ruler-edge flat bridge), <strong>Natural Soft Curve</strong> (true 90° circular rolling-ball fillet & deep liquid waist), and <strong>Close Proximity</strong> (natural fusion when shapes are closer).
          </p>
        </div>
        <span class="text-xs text-emerald-400 font-mono bg-emerald-950/60 border border-emerald-500/30 px-3 py-1.5 rounded-lg">
          Live Interactive Review
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

writeFileSync(`${root}docs/problem-shapes-comparison.html`, renderHTML(true))
writeFileSync(`${root}public/docs/problem-shapes-comparison.html`, renderHTML(true))
writeFileSync(`/Users/simongrey/.gemini/antigravity/brain/b61d01eb-bbab-498d-a338-d0c6fa092a6f/problem_shapes_comparison.html`, renderHTML(false), {
  ArtifactMetadata: {
    Summary: "Visual side-by-side comparison of Problem Shapes showing Current vs Straight Chamfer vs Natural Soft Fillet vs Closer Proximity.",
    UserFacing: true,
    RequestFeedback: false
  }
})
console.log('Successfully generated curved showcase in docs, public/docs, and brain artifacts!')
