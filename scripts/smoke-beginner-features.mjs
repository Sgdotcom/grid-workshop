import assert from 'node:assert/strict'
import { createJiti } from 'jiti'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const jiti = createJiti(import.meta.url, { alias: { '@': `${root}src` } })

const { DEFAULT_GRID } = await jiti.import('../src/lib/gridGeometry.ts')
const {
  LETTER_SIBLINGS,
  STARTER_BLUEPRINTS,
  buildStarterBlueprint,
  nudgeFilled,
  getMirroredCoord,
  getLetterSiblings,
} = await jiti.import('../src/lib/skeletons.ts')

console.log('--- Testing Beginner Type Design Suite ---')

// 1. Test Sibling Groups
const nSiblings = getLetterSiblings('n')
assert.equal(nSiblings.name, 'Arch Group')
assert(nSiblings.siblings.includes('m') && nSiblings.siblings.includes('h') && nSiblings.siblings.includes('u'))
assert(nSiblings.tip.length > 0)

const bSiblings = getLetterSiblings('b')
assert.equal(bSiblings.name, 'Bowl Group')
assert(bSiblings.siblings.includes('d') && bSiblings.siblings.includes('p') && bSiblings.siblings.includes('q'))
console.log('✓ Letter sibling cohorts and typographic DNA hints are defined')

// 2. Test Starter Blueprints
for (const char of ['A', 'B', 'H', 'O', 'n', 'o', 'b', 's']) {
  const bp = buildStarterBlueprint(char, DEFAULT_GRID, 'preset-circle', 40)
  assert(bp.size > 0, `Blueprint for "${char}" must produce active cells`)
  for (const region of bp.values()) {
    assert(region.col >= 0 && region.col < DEFAULT_GRID.cols, `Col out of bounds for "${char}"`)
    assert(region.row >= 0 && region.row < DEFAULT_GRID.rows, `Row out of bounds for "${char}"`)
  }
}
console.log('✓ Starter blueprints generate valid grid-aligned cells on 7×9')

// 3. Test Nudge Transforms
const sample = buildStarterBlueprint('I', DEFAULT_GRID, 'preset-circle', 40)
const initialCols = [...sample.values()].map((r) => r.col)
const nudgedRight = nudgeFilled(sample, 1, 0, DEFAULT_GRID)
const rightCols = [...nudgedRight.values()].map((r) => r.col)
for (let i = 0; i < initialCols.length; i++) {
  if (initialCols[i] + 1 < DEFAULT_GRID.cols) {
    assert(rightCols.includes(initialCols[i] + 1), 'Nudge right should shift column by +1')
  }
}

const nudgedDown = nudgeFilled(sample, 0, 1, DEFAULT_GRID)
const downRows = [...nudgedDown.values()].map((r) => r.row)
for (const r of sample.values()) {
  if (r.row + 1 < DEFAULT_GRID.rows) {
    assert(downRows.includes(r.row + 1), 'Nudge down should shift row by +1')
  }
}
console.log('✓ Nudge Left/Right/Up/Down shifts shapes within grid bounds')

// 4. Test Symmetry Coordinate Mirroring
const hMirror = getMirroredCoord(1, 3, DEFAULT_GRID, 'horizontal', 0)
assert(hMirror, 'Horizontal mirror must return a coordinate')
assert.equal(hMirror.col, 5, 'Col 1 on 7-col grid (0..6) should mirror to 5')
assert.equal(hMirror.row, 3, 'Row should remain unchanged in horizontal mirror')
assert.equal(hMirror.rotation, 270, 'Arc 0° should flip horizontally to 270°')

const vMirror = getMirroredCoord(1, 2, DEFAULT_GRID, 'vertical', 0)
assert(vMirror, 'Vertical mirror must return a coordinate')
assert.equal(vMirror.col, 1, 'Col should remain unchanged in vertical mirror')
assert.equal(vMirror.row, 6, 'Row 2 on 9-row grid (0..8) should mirror to 6')
assert.equal(vMirror.rotation, 90, 'Arc 0° should flip vertically to 90°')
console.log('✓ Horizontal and vertical symmetry mirroring with rotation inversion passed')

// 5. Mirroring follows each shape's own symmetry (a triangle must not turn sideways)
const { PRESET_SHAPES } = await jiti.import('../src/lib/types.ts')
const preset = (name) => PRESET_SHAPES.find((shape) => shape.id === `preset-${name}`)
const twin = (name, symmetry, rotation) => getMirroredCoord(1, 3, DEFAULT_GRID, symmetry, rotation, preset(name)).rotation
assert.equal(twin('triangle', 'horizontal', 0), 0, 'Upright triangle stays upright when mirrored left-right')
assert.equal(twin('triangle', 'horizontal', 90), 270, 'Right-pointing triangle mirrors to left-pointing')
assert.equal(twin('triangle', 'vertical', 0), 180, 'Upright triangle mirrors top-bottom to pointing down')
assert.equal(twin('rect', 'horizontal', 0), 0, 'Horizontal bar stays horizontal')
assert.equal(twin('chevron', 'vertical', 0), 180, 'Chevron flips upside down across the horizontal axis')
assert.equal(twin('arc', 'horizontal', 0), 270, 'Arc keeps its approved mapping')
assert.equal(twin('arc', 'vertical', 90), 0, 'Arc keeps its approved vertical mapping')
assert.equal(twin('wedge', 'horizontal', 90), 180, 'Wedge mirrors like the arc')
assert.equal(twin('notch', 'horizontal', 0), 90, 'Notch hugs the opposite top corner')
assert.equal(twin('notch', 'vertical', 0), 270, 'Notch hugs the bottom corner when mirrored top-bottom')
console.log('✓ Mirroring respects per-shape symmetry (triangle, bar, chevron, arc, wedge, notch)')

console.log('\nALL BEGINNER TYPE DESIGN FEATURES PASSED!')
