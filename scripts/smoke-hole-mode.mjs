import assert from 'node:assert/strict'
import { createJiti } from 'jiti'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const jiti = createJiti(import.meta.url, { alias: { '@': `${root}src` } })

const { filterPolygonHoles, ringAbsArea } = await jiti.import('../src/lib/polyBool.ts')

console.log('--- Testing Hole & Gap Sealing Modes ---')

// 1. Simulating 4 stamps forming a diamond pinhole in the center
// Outer box: [0,0] to [100,100], Inner diamond pinhole: [45,50], [50,55], [55,50], [50,45]
const pinholeRing = [
  [45, 50],
  [50, 55],
  [55, 50],
  [50, 45],
  [45, 50],
]
const pinholeArea = ringAbsArea(pinholeRing) // 50 sq units
assert(pinholeArea > 0 && pinholeArea < 100, `Pinhole area should be ~50, got ${pinholeArea}`)

// Big typographic counter (e.g. inner loop of letter 'o' or bowl of 'a')
// Inner box: [30,30] to [70,70] => Area = 1600 sq units
const counterRing = [
  [30, 30],
  [70, 30],
  [70, 70],
  [30, 70],
  [30, 30],
]
const counterArea = ringAbsArea(counterRing)
assert.equal(counterArea, 1600, 'Typographic counter should have area 1600')

const exteriorRing = [
  [0, 0],
  [100, 0],
  [100, 100],
  [0, 100],
  [0, 0],
]

// Shape with both a tiny pinhole and a large typographic counter
const testPolygon = [exteriorRing, pinholeRing, counterRing]

// Test 1: Open mode preserves all interior holes
const openResult = filterPolygonHoles([testPolygon], 'open', 200)
assert.equal(openResult[0].length, 3, 'Open mode must keep both the pinhole and the counter')

// Test 2: 'no-gaps' mode eliminates holes <= maxGapArea (200), keeping counter (1600)
const noGapsResult = filterPolygonHoles([testPolygon], 'no-gaps', 200)
assert.equal(noGapsResult[0].length, 2, 'no-gaps mode must filter out the tiny pinhole')
assert.deepEqual(noGapsResult[0][0], exteriorRing, 'Exterior boundary preserved')
assert.deepEqual(noGapsResult[0][1], counterRing, 'Typographic counter preserved')

// Test 3: 'solid' mode removes ALL interior holes completely
const solidResult = filterPolygonHoles([testPolygon], 'solid', 200)
assert.equal(solidResult[0].length, 1, 'Solid mode must have no holes at all')
assert.deepEqual(solidResult[0][0], exteriorRing, 'Exterior boundary preserved in solid mode')

console.log('✓ filterPolygonHoles correctly handles open, no-gaps, and solid modes')
console.log('ALL HOLE MODE TESTS PASSED!')
