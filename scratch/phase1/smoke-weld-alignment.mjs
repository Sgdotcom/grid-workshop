import assert from 'node:assert/strict'
import { createJiti } from 'jiti'
import pc from 'polygon-clipping'
import { fileURLToPath } from 'node:url'
import { geometry, measure } from '../../scripts/join-geometry.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const jiti = createJiti(import.meta.url, { alias: { '@': `${root}src` } })
const { compareJoin, JOIN_CASES } = await jiti.import('./joinExperiments.ts')
const { PRESET_SHAPES } = await jiti.import('../../src/lib/types.ts')
const { makeSoftStamp, organicWeld, softnessFinishPathList } = await jiti.import('./softness.ts')
const { toPolygon, unionPolygons, multiPolygonToPathList } = await jiti.import('../../src/lib/polyBool.ts')
const settings = { size: 37, softness: 1, roundedness: 2, radius: 1, neck: 1 }
let checks = 0
for (const shape of PRESET_SHAPES) {
  for (const layout of JOIN_CASES) {
    const result = compareJoin(shape, layout.cells, settings, 'weld')
    const stats = measure(result, layout.id)
    const label = `${shape.label} ${layout.id}`
    assert.equal(stats.components, 1, `${label} should connect at the review setting`)
    assert.ok(stats.removedPercent < 0.01, `${label} must retain the stamp bodies`)
    if (stats.asymmetryPercent !== null) assert.ok(stats.asymmetryPercent < 0.1, `${label} must retain the original axial symmetry`)
    if (shape.id === 'preset-ring') assert.ok(stats.holes >= layout.cells.length, `${label} must retain ring holes`)
    checks++
  }
}

const square = PRESET_SHAPES.find(shape => shape.id === 'preset-square')
const make = (col, row, size = 37, shape = square, corners = 2) => makeSoftStamp(`${col}:${row}`, col, row,
  20 + col * 42, 20 + row * 42, size, shape, 20 + col * 42 - size / 2, 20 + row * 42 - size / 2, corners)
const finish = (a, b) => multiPolygonToPathList(unionPolygons([toPolygon(a.rings), toPolygon(b.rings), ...organicWeld(a, b, 1)]))
const area = polygons => polygons.reduce((total, polygon) => total + polygon.reduce((sum, ring, i) => {
  const value = Math.abs(ring.reduce((n, p, j) => { const q = ring[(j + 1) % ring.length]; return n + p[0] * q[1] - p[1] * q[0] }, 0)) / 2
  return sum + (i ? -value : value)
}, 0), 0)
const differenceArea = (a, b) => area(pc.xor(geometry(a), geometry(b))) / 1e6

// Vertex order, pair order and a quarter-turn must not choose a different side.
for (const id of ['preset-square', 'preset-rect', 'preset-star5', 'preset-x', 'preset-chevron']) {
  const shape = PRESET_SHAPES.find(candidate => candidate.id === id)
  assert.ok(shape, id)
  for (const [col, row] of [[1, 0], [0, 1]]) {
    const a = make(0, 0, 37, shape)
    const b = make(col, row, 37, shape)
    const original = finish(a, b)
    const reorder = stamp => ({ ...stamp,
      rings: stamp.rings.map(ring => [...ring.slice(5), ...ring.slice(0, 5)]),
      contacts: [...stamp.contacts].reverse(),
    })
    assert.ok(differenceArea(original, finish(b, a)) < 0.1, `${id} pair order`)
    assert.ok(differenceArea(original, finish(reorder(a), reorder(b))) < 0.1, `${id} vertex order`)
    checks++
  }
}
const horizontal = geometry(finish(make(0, 0), make(1, 0)))
const rotated = horizontal.map(polygon => polygon.map(ring => ring.map(([x, y]) => [40000 - y, x])))
assert.ok(area(pc.xor(rotated, geometry(finish(make(0, 0), make(0, 1))))) / 1e6 < 0.1, 'Square rotation must preserve weld geometry')
// Regression checks for input order invariance across mixed/custom shapes and triangle symmetry.
const circle = PRESET_SHAPES.find(s => s.id === 'preset-circle')
const star4 = PRESET_SHAPES.find(s => s.id === 'preset-star4')
const diagCircle = make(0, 1, 37, circle)
const diagStar = make(1, 0, 37, star4)
assert.ok(differenceArea(finish(diagCircle, diagStar), finish(diagStar, diagCircle)) < 0.1, 'Diagonal Circle + Star4 pair order')
checks++

const customStar = { id: 'custom-star-3-0.15', kind: 'star', label: '3-star', points: 3, innerRatio: 0.15, cornerRadius: 0 }
const starTop = make(0, 0, 37, customStar, 0)
const starBottom = make(0, 1, 37, customStar, 0)
assert.ok(differenceArea(finish(starTop, starBottom), finish(starBottom, starTop)) < 0.1, 'Custom 3-star vertical pair order')
checks++

const triangle = PRESET_SHAPES.find(s => s.id === 'preset-triangle')
const triangleResult = compareJoin(triangle, [[0, 0], [0, 1]], { size: 56, softness: 1, roundedness: 2, radius: 1, neck: 1 }, 'weld')
const triangleStats = measure(triangleResult, 'vertical')
assert.ok(triangleStats.asymmetryPercent !== null && triangleStats.asymmetryPercent < 0.1, 'Large triangle vertical pair must retain axial symmetry')
checks++

const zero = compareJoin(square, [[0, 0], [1, 0]], { ...settings, softness: 0 }, 'weld')
assert.deepEqual(zero.paths, zero.outlines, 'Zero softness leaves the original stamps')
// Production uses this helper too; preserve its separate zero/broken-join contract.
const aProd = make(0, 0, 37, PRESET_SHAPES[0])
const bProd = make(1, 0, 37, PRESET_SHAPES[0])
assert.deepEqual(softnessFinishPathList([aProd, bProd], 0), [])
assert.equal(geometry(softnessFinishPathList([aProd, bProd], { softness: 1, brokenJoins: new Set(['0:0|1:0']) })).length, 2)

// Production must never bleed bridge ink inside a ring's inner cutout.
const ring = PRESET_SHAPES.find(s => s.id === 'preset-ring')
const square56 = make(0, 0, 56, square, 2)
const ring24 = make(1, 0, 24, ring, 2)
const prodOut = geometry(softnessFinishPathList([square56, ring24], 1))
const ringHole = geometry(multiPolygonToPathList([toPolygon([ring24.rings[1]])]))
const bleed = area(pc.intersection(prodOut, ringHole))
assert.ok(bleed < 0.01, 'Production bridge must not fill ring hole')
checks++

console.log(`PASS: ${checks} shape/layout and ordering cases, rotation, zero softness and broken joins.`)
