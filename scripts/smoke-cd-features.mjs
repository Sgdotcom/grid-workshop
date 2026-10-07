import assert from 'node:assert/strict'
import { createJiti } from 'jiti'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const jiti = createJiti(import.meta.url, { alias: { '@': `${root}src` } })

const { PRESET_SHAPES, reconcileLibrary, regionKey } = await jiti.import('../src/lib/types.ts')
const {
  moduleShapePath,
  shapeOutlineRings,
} = await jiti.import('../src/lib/shapes.ts')
const { applyDotDilation } = await jiti.import('../src/lib/permutations.ts')
const { differencePolygons, toPolygon } = await jiti.import('../src/lib/polyBool.ts')
const { buildGlyphBodyMarkup } = await jiti.import('../src/lib/export.ts')
const { DEFAULT_GRID } = await jiti.import('../src/lib/gridGeometry.ts')

console.log('--- Testing Pinterest CD Board Suite ---')

// 1. Check Presets and reconcileLibrary
const arc = PRESET_SHAPES.find((s) => s.id === 'preset-arc')
const wedge = PRESET_SHAPES.find((s) => s.id === 'preset-wedge')
const notch = PRESET_SHAPES.find((s) => s.id === 'preset-notch')
assert(arc, 'preset-arc must exist')
assert(wedge, 'preset-wedge must exist')
assert(notch, 'preset-notch must exist')

// Test that an old saved library without the new presets gets reconciled correctly
const legacySavedLibrary = [
  { id: 'preset-circle', kind: 'preset', preset: 'circle', label: 'Circle' },
  { id: 'preset-square', kind: 'preset', preset: 'square', label: 'Square' },
]
const reconciled = reconcileLibrary(legacySavedLibrary)
assert(reconciled.some((s) => s.id === 'preset-arc'), 'reconcileLibrary must add missing preset-arc')
assert(reconciled.some((s) => s.id === 'preset-wedge'), 'reconcileLibrary must add missing preset-wedge')
assert(reconciled.some((s) => s.id === 'preset-notch'), 'reconcileLibrary must add missing preset-notch')
console.log('✓ New preset definitions found and reconcileLibrary successfully migrates legacy sessions')

// 2. Test Arc, Wedge, Notch path generation & 4 rotations
for (const shape of [arc, wedge, notch]) {
  for (const rot of [0, 90, 180, 270]) {
    const path = moduleShapePath(shape, 0, 0, 40, 0, rot)
    assert(path.startsWith('M ') && path.endsWith('Z'), `${shape.id} rot ${rot} path must be valid`)
    const rings = shapeOutlineRings(shape, 0, 0, 40, 0, rot)
    assert(rings.length >= 1 && rings[0].length >= 3, `${shape.id} rot ${rot} must produce outline ring`)
  }
}
console.log('✓ Arc, Wedge, and Notch generate valid rotated paths and rings (0°, 90°, 180°, 270°)')

// 3. Test Punch-Out Region Keys and Boolean Subtraction
const inkKey = regionKey(0, 0, 'ink')
const cutoutKey = regionKey(0, 0, 'cutout')
assert.notEqual(inkKey, cutoutKey, 'Ink and Cutout keys must be distinct to prevent deleting ink shapes')

const square = PRESET_SHAPES.find((s) => s.id === 'preset-square')
const circle = PRESET_SHAPES.find((s) => s.id === 'preset-circle')
const sqRings = shapeOutlineRings(square, 0, 0, 50, 0, 0)
const circRings = shapeOutlineRings(circle, 10, 10, 30, 0, 0)
const sqPoly = toPolygon(sqRings)
const circPoly = toPolygon(circRings)
assert(sqPoly && circPoly, 'Polygons must be convertible')

const diff = differencePolygons([sqPoly], [circPoly])
assert(diff.length === 1, 'Difference must produce 1 multi-polygon')
assert(diff[0].length === 2, 'Result must contain outer ring and hole ring (drilled plate punch-out)')
console.log('✓ Boolean punch-out difference successfully cut hole through solid body without destroying ink')

// 4. Test Dot Dilation
const sampleFilled = new Map([
  ['0:0', { key: '0:0', layer: 'a', col: 0, row: 0, kind: 'shape', shapeId: 'preset-circle', size: 30 }],
  ['0:1', { key: '0:1', layer: 'a', col: 0, row: 1, kind: 'shape', shapeId: 'preset-circle', size: 30 }],
])
const dilated = applyDotDilation(sampleFilled, 1.5, 6, 100)
assert.equal(dilated.get('0:0').size, 45, 'Dot dilation should scale 30 * 1.5 = 45')
console.log('✓ Dot dilation scaling passed')

// 5. Test Export markup with cutouts
const exportPayload = {
  grid: DEFAULT_GRID,
  library: PRESET_SHAPES,
  filledRegions: [
    { key: '0:0', layer: 'a', col: 0, row: 0, kind: 'shape', shapeId: 'preset-square', size: 40, mode: 'ink' },
    { key: '0:0-hole', layer: 'a', col: 0, row: 0, kind: 'shape', shapeId: 'preset-circle', size: 20, mode: 'cutout' },
  ],
  glyphChar: 'A',
  softness: 0,
}
const markup = buildGlyphBodyMarkup(exportPayload, '#000000')
assert(markup.length > 0, 'Export markup must be generated')
assert(markup[0].includes('fill-rule="evenodd"'), 'Punch-out export must include evenodd fill rule for holes')
console.log('✓ Export markup properly formats punch-out SVG paths')

console.log('\nALL PINTEREST CD SUITE TESTS PASSED!')
