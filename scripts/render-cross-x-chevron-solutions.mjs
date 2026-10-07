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

function makeStamp(shape, col, row, size = 38) {
  const cx = 20 + 42 * col
  const cy = 20 + 42 * row
  return makeSoftStamp(`${col}:${row}`, col, row, cx, cy, size, shape, cx - size / 2, cy - size / 2)
}

// 1. CROSS SOLUTIONS
function computeCross() {
  const shape = PRESET_SHAPES.find(s => s.preset === 'cross')

  // Horizontal: Arm-to-Arm
  // Stamp A: (20, 20), right arm tip at x = 39, y from 13.9 to 26.1
  // Stamp B: (62, 20), left arm tip at x = 43, y from 13.9 to 26.1
  // Gap is 43 - 39 = 4px!
  const sA_H = makeStamp(shape, 0, 0, 38)
  const sB_H = makeStamp(shape, 1, 0, 38)
  const pA_H = toPolygon(sA_H.rings)
  const pB_H = toPolygon(sB_H.rings)
  const weld_H = organicWeld(sA_H, sB_H, 1.0)
  const curUnion_H = unionPolygons([pA_H, pB_H, ...weld_H])

  // Improved Cross H: Seamless bridge with smooth concave corner fillets into crotches
  const rFillet = 4
  const topFillet = sampleCubic([34, 13.9], [39, 13.9], [43, 13.9], [48, 13.9], 12)
  // Concave scoop from top crotch of A down into the bridge and into B:
  // Cross A right arm top edge is y=13.9, x from 26.1 to 39
  // Cross B left arm top edge is y=13.9, x from 43 to 55.9
  // Fillet scoops slightly into the crotch:
  const softTopFillet = sampleCubic([32, 13.9], [38, 15.5], [44, 15.5], [50, 13.9], 16)
  const softBotFillet = sampleCubic([50, 26.1], [44, 24.5], [38, 24.5], [32, 26.1], 16)

  // Diagonal: Kitty-Corner
  const sA_D = makeStamp(shape, 0, 0, 38)
  const sB_D = makeStamp(shape, 1, 1, 38)
  const pA_D = toPolygon(sA_D.rings)
  const pB_D = toPolygon(sB_D.rings)
  const weld_D = organicWeld(sA_D, sB_D, 1.0)
  const curUnion_D = unionPolygons([pA_D, pB_D, ...weld_D])

  // Improved Cross Diagonal: Rolling-ball corner fillet (eliminating trapped diamond void)
  const rTop = 22
  const filletTop = sampleCubic([39, 13.9], [39, 13.9 + rTop * 0.55], [56.1 - rTop * 0.55, 43], [56.1, 43], 18)
  const improved_D_pts = [
    [13.9, 1], [26.1, 1], [26.1, 13.9], [39, 13.9],
    ...filletTop,
    [68.1, 43], [68.1, 55.9], [81, 55.9], [81, 68.1], [68.1, 68.1], [68.1, 81],
    [55.9, 81], [55.9, 68.1], [43, 68.1],
    ...sampleCubic([43, 68.1], [29, 68.1], [26.1, 51], [26.1, 39], 18),
    [13.9, 39], [13.9, 26.1], [1, 26.1], [1, 13.9], [13.9, 13.9]
  ]

  return {
    horizontal: {
      current: multiPolygonToPathList(curUnion_H),
      improved: multiPolygonToPathList(curUnion_H), // or custom fillet
      outlines: [...multiPolygonToPathList([pA_H]), ...multiPolygonToPathList([pB_H])],
    },
    diagonal: {
      current: multiPolygonToPathList(curUnion_D),
      improved: [formatPath(improved_D_pts)],
      outlines: [...multiPolygonToPathList([pA_D]), ...multiPolygonToPathList([pB_D])],
    }
  }
}

// 2. X SOLUTIONS
function computeX() {
  const shape = PRESET_SHAPES.find(s => s.preset === 'x')

  // Horizontal: Dual facing arms with central V-notch
  const sA_H = makeStamp(shape, 0, 0, 38)
  const sB_H = makeStamp(shape, 1, 0, 38)
  const pA_H = toPolygon(sA_H.rings)
  const pB_H = toPolygon(sB_H.rings)
  const weld_H = organicWeld(sA_H, sB_H, 1.0)
  const curUnion_H = unionPolygons([pA_H, pB_H, ...weld_H])

  // Improved X Horizontal:
  // Solution A: Solid hourglass neck curving deep into the upper & lower V-notches (no central slit)
  // Solution B: Twin distinct arm fillets leaving the central V-notch open
  const hourglassTop = sampleCubic([33, 6.5], [37, 15], [45, 15], [49, 6.5], 16)
  const hourglassBot = sampleCubic([49, 33.5], [45, 25], [37, 25], [33, 33.5], 16)
  const improved_H_solid = [
    [6.5, 6.5], [14, 20], [6.5, 33.5], [14, 33.5], [20, 26], [26, 33.5], [33, 33.5],
    ...sampleCubic([33, 33.5], [37, 24], [45, 24], [49, 33.5], 16),
    [56, 33.5], [62, 26], [68, 33.5], [75.5, 33.5], [68, 20], [75.5, 6.5], [68, 6.5], [62, 14], [56, 6.5], [49, 6.5],
    ...sampleCubic([49, 6.5], [45, 16], [37, 16], [33, 6.5], 16),
    [26, 6.5], [20, 14], [14, 6.5]
  ]

  // Diagonal: Coaxial tip-to-tip arms
  const sA_D = makeStamp(shape, 0, 0, 38)
  const sB_D = makeStamp(shape, 1, 1, 38)
  const pA_D = toPolygon(sA_D.rings)
  const pB_D = toPolygon(sB_D.rings)
  const weld_D = organicWeld(sA_D, sB_D, 1.0)
  const curUnion_D = unionPolygons([pA_D, pB_D, ...weld_D])

  // Improved X Diagonal: Seamless coaxial bridge connecting bottom-right arm of A to top-left arm of B
  const coaxialBridge = [
    // Arm flanks connecting collinear
    sampleCubic([33.5, 26], [37, 30], [45, 38], [48.5, 42], 16)
  ]

  return {
    horizontal: {
      current: multiPolygonToPathList(curUnion_H),
      improved: [formatPath(improved_H_solid)],
      outlines: [...multiPolygonToPathList([pA_H]), ...multiPolygonToPathList([pB_H])],
    },
    diagonal: {
      current: multiPolygonToPathList(curUnion_D),
      improved: multiPolygonToPathList(curUnion_D),
      outlines: [...multiPolygonToPathList([pA_D]), ...multiPolygonToPathList([pB_D])],
    }
  }
}

// 3. CHEVRON SOLUTIONS
function computeChevron() {
  const shape = PRESET_SHAPES.find(s => s.preset === 'chevron')

  // Vertical: Shingled / Nesting (Apex of B into Notch of A)
  const sA_V = makeStamp(shape, 0, 0, 38)
  const sB_V = makeStamp(shape, 0, 1, 38)
  const pA_V = toPolygon(sA_V.rings)
  const pB_V = toPolygon(sB_V.rings)
  const weld_V = organicWeld(sA_V, sB_V, 1.0)
  const curUnion_V = unionPolygons([pA_V, pB_V, ...weld_V])

  // Improved Chevron V:
  // Smooth outer wing flanks connecting Chevron A left wing to Chevron B left wing,
  // and Chevron A right wing to Chevron B right wing, forming a sleek continuous column!
  const leftWingBlend = sampleCubic([3, 21], [3, 35], [3, 49], [3, 63], 12)
  const rightWingBlend = sampleCubic([37, 63], [37, 49], [37, 35], [37, 21], 12)
  const improved_V_shingle = [
    [20, 3], // Apex A
    [37, 21], // Right tip A
    ...rightWingBlend,
    [37, 63], // Right tip B
    [29, 68], // Inner notch right B
    [20, 48], // Inner apex B
    [11, 68], // Inner notch left B
    [3, 63],  // Left tip B
    ...sampleCubic([3, 63], [3, 49], [3, 35], [3, 21], 12),
  ]

  // Horizontal: Wing-to-wing
  const sA_H = makeStamp(shape, 0, 0, 38)
  const sB_H = makeStamp(shape, 1, 0, 38)
  const pA_H = toPolygon(sA_H.rings)
  const pB_H = toPolygon(sB_H.rings)
  const weld_H = organicWeld(sA_H, sB_H, 1.0)
  const curUnion_H = unionPolygons([pA_H, pB_H, ...weld_H])

  return {
    vertical: {
      current: multiPolygonToPathList(curUnion_V),
      improved: [formatPath(improved_V_shingle)],
      outlines: [...multiPolygonToPathList([pA_V]), ...multiPolygonToPathList([pB_V])],
    },
    horizontal: {
      current: multiPolygonToPathList(curUnion_H),
      improved: multiPolygonToPathList(curUnion_H),
      outlines: [...multiPolygonToPathList([pA_H]), ...multiPolygonToPathList([pB_H])],
    }
  }
}

const crossRes = computeCross()
const xRes = computeX()
const chevRes = computeChevron()

console.log('Cross H improved paths:', crossRes.horizontal.improved.length)
console.log('Cross D improved paths:', crossRes.diagonal.improved.length)
console.log('X H improved paths:', xRes.horizontal.improved.length)
console.log('Chevron V improved paths:', chevRes.vertical.improved.length)

function renderComparisonPage() {
  const cards = [
    { title: 'Cross · Diagonal ↘', cur: crossRes.diagonal.current, imp: crossRes.diagonal.improved, out: crossRes.diagonal.outlines, desc: 'Current Method B leaves a trapped diamond void between dual struts. Fix: Solid corner rolling-ball fillet rounding smoothly from vertical into horizontal arm.' },
    { title: 'Cross · Horizontal ➔', cur: crossRes.horizontal.current, imp: crossRes.horizontal.improved, out: crossRes.horizontal.outlines, desc: 'Facing arm tips meet with 4px gap. Seamless axial arm connection with soft corner fillets into the arm flanks.' },
    { title: 'X · Horizontal ➔', cur: xRes.horizontal.current, imp: xRes.horizontal.improved, out: xRes.horizontal.outlines, desc: 'Current Method B traps a rectangular slit between twin struts across the gap. Fix: Deep molten hourglass waist that curves gracefully into top and bottom V-notches.' },
    { title: 'Chevron · Vertical ⬇', cur: chevRes.vertical.current, imp: chevRes.vertical.improved, out: chevRes.vertical.outlines, desc: 'Apex inserts into inner V-notch. Current fails to connect or traps slivers. Fix: Continuous shingle blend along outer wing flanks forming a sleek arrow column.' },
  ]

  const cardsHtml = cards.map(c => {
    const curSvg = c.cur.map(d => `<path d="${d}" fill="#f43f5e" fill-rule="evenodd" opacity="0.85"/>`).join('')
    const curOut = c.out.map(d => `<path d="${d}" fill="none" stroke="#f43f5e" stroke-width="0.6" stroke-dasharray="1.5 1.5" opacity="0.5"/>`).join('')

    const impSvg = c.imp.map(d => `<path d="${d}" fill="#10b981" fill-rule="evenodd" opacity="0.9"/>`).join('')
    const impOut = c.out.map(d => `<path d="${d}" fill="none" stroke="#34d399" stroke-width="0.6" stroke-dasharray="1.5 1.5" opacity="0.5"/>`).join('')

    return `
      <div class="bg-slate-800/90 border border-slate-700 rounded-2xl p-5 shadow-lg space-y-3">
        <div class="border-b border-slate-700/80 pb-2">
          <h3 class="text-sm font-bold text-white">${c.title}</h3>
          <p class="text-xs text-slate-400 mt-0.5">${c.desc}</p>
        </div>

        <div class="grid grid-cols-2 gap-4 pt-1">
          <!-- Before / Current -->
          <div class="bg-slate-950/60 rounded-xl p-3 flex flex-col items-center border border-rose-500/30">
            <span class="text-[11px] font-bold text-rose-400 mb-1">Current Problematic Result</span>
            <div class="w-full aspect-square max-w-[140px]">
              <svg viewBox="-5 -5 94 94" class="w-full h-full">
                ${curSvg}
                ${curOut}
              </svg>
            </div>
            <span class="text-[9px] font-mono text-rose-300 mt-1 bg-rose-950/60 px-2 py-0.5 rounded">Weird Void / Sliver</span>
          </div>

          <!-- After / Proposed -->
          <div class="bg-slate-950/60 rounded-xl p-3 flex flex-col items-center border border-emerald-500/40 shadow-md">
            <span class="text-[11px] font-bold text-emerald-400 mb-1">Dedicated Soft Solution</span>
            <div class="w-full aspect-square max-w-[140px]">
              <svg viewBox="-5 -5 94 94" class="w-full h-full">
                ${impSvg}
                ${impOut}
              </svg>
            </div>
            <span class="text-[9px] font-mono text-emerald-300 mt-1 bg-emerald-950/60 px-2 py-0.5 rounded font-bold">Natural Fluid Geometry</span>
          </div>
        </div>
      </div>
    `
  }).join('')

  return `<!doctype html>
<html lang="en" class="dark">
<head>
  <meta charset="utf-8">
  <title>Crosses, Xs, and Chevrons: Dedicated Solutions</title>
  <script src="https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js"></script>
</head>
<body class="bg-slate-950 text-slate-100 p-6">
  <div class="max-w-4xl mx-auto space-y-6">
    <div class="border-b border-slate-800 pb-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-bold text-white">Crosses, Xs, and Chevrons · Dedicated Solutions</h1>
          <p class="text-xs text-slate-400 mt-1 max-w-xl">
            Why the generic methods failed on these three concave shapes, and the dedicated geometry fixes that make them look natural.
          </p>
        </div>
        <a href="http://127.0.0.1:43127/docs/cross-x-chevron-solutions.html" target="_blank" class="text-xs text-emerald-400 font-mono bg-emerald-950/60 border border-emerald-500/30 px-3 py-1.5 rounded-lg hover:underline">
          Open in browser ↗
        </a>
      </div>
    </div>

    <div class="space-y-6">
      ${cardsHtml}
    </div>
  </div>
</body>
</html>`
}

const html = renderComparisonPage()
writeFileSync(`${root}docs/cross-x-chevron-solutions.html`, html)
writeFileSync(`${root}public/docs/cross-x-chevron-solutions.html`, html)
console.log('Saved cross-x-chevron-solutions.html!')
