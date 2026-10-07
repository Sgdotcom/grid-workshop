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
  return 'M ' + pts.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L ') + ' Z'
}

// 1. Cross Diagonal - True Soft Rolling Fillet vs Straight Chamfer
// Size 42 (center distance 42):
// Cross A: (20, 20), Cross B: (62, 62).
// Arm width 13.5px.
// Straight Chamfer: straight line from (41, 14) to (69, 41)
const crossStraight = [
  [-1, 13.5], [13.5, 13.5], [13.5, -1], [26.5, -1], [26.5, 13.5], [41, 13.5],
  // Flat chamfer bridge:
  [69, 41], [69, 54.5], [83.5, 54.5], [83.5, 67.5], [69, 67.5], [69, 83.5],
  [54.5, 83.5], [54.5, 69], [41, 69],
  // Flat chamfer bridge on other side:
  [13.5, 41], [13.5, 26.5], [-1, 26.5]
]

// Soft Rolling Fillet:
const r = 27
const cTop = sampleCubic([41, 13.5], [41, 13.5 + r * 0.55], [69 - r * 0.55, 41], [69, 41], 16)
const cBot = sampleCubic([69, 69], [54.5 + r * 0.45, 69], [41, 54.5 + r * 0.45], [41, 69], 16) // wait, other side:
const cOther = sampleCubic([41, 69], [41 - r * 0.55, 69], [13.5, 41 + r * 0.55], [13.5, 41], 16)

const crossFillet = [
  [-1, 13.5], [13.5, 13.5], [13.5, -1], [26.5, -1], [26.5, 13.5],
  ...cTop,
  [69, 54.5], [83.5, 54.5], [83.5, 67.5], [69, 67.5], [69, 83.5],
  [54.5, 83.5], [54.5, 69],
  ...cOther,
  [13.5, 26.5], [-1, 26.5]
]

// 2. Pentagon Horizontal - Deep Hourglass vs Shallow Flat
const pTopShallow = sampleCubic([30, 9.5], [37, 11], [45, 11], [52, 9.5], 16)
const pBotShallow = sampleCubic([52, 35], [45, 33], [37, 33], [30, 35], 16)

// Deep Soft Hourglass (dips 6.5px down to y=16 on top, dips up to y=24 on bottom):
const pTopDeep = sampleCubic([30, 9.5], [36, 16], [46, 16], [52, 9.5], 16)
const pBotDeep = sampleCubic([52, 35], [46, 24], [36, 24], [30, 35], 16)

const pentShallow = [
  [1.5, 16], [20, 2.5],
  ...pTopShallow,
  [62, 2.5], [80.5, 16], [73.5, 37.5],
  ...pBotShallow,
  [8.5, 37.5]
]

const pentDeep = [
  [1.5, 16], [20, 2.5],
  ...pTopDeep,
  [62, 2.5], [80.5, 16], [73.5, 37.5],
  ...pBotDeep,
  [8.5, 37.5]
]

console.log("CROSS_STRAIGHT:", formatPath(crossStraight))
console.log("CROSS_FILLET:", formatPath(crossFillet))
console.log("PENT_SHALLOW:", formatPath(pentShallow))
console.log("PENT_DEEP:", formatPath(pentDeep))
