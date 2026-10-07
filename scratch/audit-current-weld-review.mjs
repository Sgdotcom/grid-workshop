// Additional coverage only: does not modify production geometry or preferences.
// node scripts/audit-join-coverage.mjs
import { createJiti } from 'jiti'
import pc from 'polygon-clipping'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { geometry } from '../scripts/join-geometry.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const sourceFiles = ['src/lib/softness.ts', 'src/lib/shapes.ts', 'src/lib/polyBool.ts']
const fingerprints = () => Object.fromEntries(sourceFiles.map(path => [path,
  createHash('sha256').update(readFileSync(root + path)).digest('hex')]))
const startedSources = fingerprints()
const jiti = createJiti(import.meta.url, { alias: { '@': `${root}src` } })
const { PRESET_SHAPES } = await jiti.import('../src/lib/types.ts')
const { makeSoftStamp, organicWeld, softnessFinishPathList } = await jiti.import('../src/lib/softness.ts')
const { toPolygon, unionPolygons, differencePolygons, multiPolygonToPathList, multiPolygonFills } = await jiti.import('../src/lib/polyBool.ts')
const area = polygons => polygons.reduce((total, polygon) => total + polygon.reduce((sum, ring, i) => {
  const value = Math.abs(ring.reduce((n, p, j) => { const q = ring[(j + 1) % ring.length]; return n + p[0] * q[1] - p[1] * q[0] }, 0)) / 2
  return sum + (i ? -value : value)
}, 0), 0) / 1e6
const snapGeometry = polygons => geometry(multiPolygonToPathList(polygons))
const transform = (polygons, f) => polygons.map(poly => poly.map(ring => ring.map(f)))
const make = (shape, col, row, size, corners) => makeSoftStamp(`${col}:${row}`, col, row,
  20 + 42 * col, 20 + 42 * row, size, shape, 20 + 42 * col - size / 2, 20 + 42 * row - size / 2, corners)
function originals(stamps) {
  const bodies = stamps.map(stamp => toPolygon(stamp.rings))
  const holes = stamps.flatMap(stamp => stamp.rings.slice(1).map(ring => toPolygon([ring])))
  return { bodies, holes, protected: snapGeometry(holes.length ? differencePolygons(bodies, holes) : unionPolygons(bodies)) }
}
function render(stamps, softness, method) {
  if (method === 'production') return geometry(softnessFinishPathList(stamps, softness))
  const { bodies, holes } = originals(stamps)
  const bridges = []
  for (let i = 0; i < stamps.length; i++) for (let j = i + 1; j < stamps.length; j++) {
    const a = stamps[i], b = stamps[j]
    // For larger layouts, only immediate grid neighbours participate.
    // This extends B's 2x2 lab cases without welding distant cells together.
    if (Math.abs(a.col - b.col) <= 1 && Math.abs(a.row - b.row) <= 1) bridges.push(...organicWeld(a, b, softness))
  }
  const result = unionPolygons([...bodies, ...bridges])
  return snapGeometry(holes.length ? differencePolygons(result, holes) : result)
}
const rotateStamp = stamp => ({ ...stamp, col: -stamp.row, row: stamp.col, cx: -stamp.cy, cy: stamp.cx,
  rings: stamp.rings.map(ring => ring.map(([x, y]) => [-y, x])), contacts: stamp.contacts.map(([x, y]) => [-y, x]) })
const failures = []
const counts = { pairs: 0, custom: 0, layouts: 0, rendered: 0, orderChecks: 0, rotationChecks: 0, counterChecks: 0 }
const timings = { weld: [], production: [] }
function inspect(stamps, config, category) {
  counts[category]++
  const reference = originals(stamps)
  const originalArea = area(reference.protected)
  for (const method of ['weld', 'production']) {
    const issues = []
    const start = performance.now()
    try {
      const output = render(stamps, config.softness, method)
      timings[method].push(performance.now() - start)
      counts.rendered++
      const missingPercent = 100 * area(pc.difference(reference.protected, output)) / originalArea
      if (missingPercent > 1) issues.push({ type: 'body-loss', percent: +missingPercent.toFixed(3) })
      if (!output.length) issues.push({ type: 'empty-output' })
      const islands = output.filter(poly => area([poly]) > 0.05 && area(pc.intersection([poly], reference.protected)) < 0.00001)
      if (islands.length) issues.push({ type: 'detached-additions', count: islands.length, area: +area(islands).toFixed(3) })
      if (reference.holes.length) {
        const holeFill = area(pc.intersection(output, snapGeometry(reference.holes)))
        if (holeFill > 0.1) issues.push({ type: 'filled-ring-hole', area: +holeFill.toFixed(3) })
      }
      const reverse = render([...stamps].reverse(), config.softness, method)
      const orderDiff = 100 * area(pc.xor(output, reverse)) / originalArea
      counts.orderChecks++
      if (orderDiff > 0.5) issues.push({ type: 'order-dependent', percent: +orderDiff.toFixed(3) })
      // Rotate the actual geometry for B. Production also dispatches on preset
      // orientation, so rotating its geometry without changing its preset is
      // not a valid application-level rotation test.
      if (method === 'weld' && category !== 'layouts') {
        const rotated = render(stamps.map(rotateStamp), config.softness, method)
        const back = transform(rotated, ([x, y]) => [y, -x])
        const rotationDiff = 100 * area(pc.xor(output, back)) / originalArea
        counts.rotationChecks++
        if (rotationDiff > 0.5) issues.push({ type: 'rotation-dependent', percent: +rotationDiff.toFixed(3) })
      }
      if (config.pattern === 'O') {
        counts.counterChecks++
        if (multiPolygonFills(output, 104000, 104000)) issues.push({ type: 'filled-letter-counter' })
      }
    } catch (error) {
      // A failure here may be in the measurement oracle; keep it separate
      // from confirmed rendering issues until reproduced independently.
      issues.push({ type: 'execution-or-measurement-error', message: error.message })
    }
    if (issues.length) failures.push({ category, method, ...config, issues })
  }
}
const layouts = { H: [[0, 0], [1, 0]], V: [[0, 0], [0, 1]], SE: [[0, 0], [1, 1]], NE: [[0, 1], [1, 0]] }
for (let a = 0; a < PRESET_SHAPES.length; a++) {
  for (let b = a; b < PRESET_SHAPES.length; b++) for (const [layout, cells] of Object.entries(layouts)) {
    for (const sizes of [[37, 37], [24, 56], [56, 24]]) for (const softness of [0.2, 1]) {
      const shapes = [PRESET_SHAPES[a], PRESET_SHAPES[b]]
      inspect(cells.map(([col, row], i) => make(shapes[i], col, row, sizes[i], 2)),
        { shapes: shapes.map(shape => shape.id), layout, sizes, softness, corners: 2 }, 'pairs')
    }
  }
  console.log(`Pair coverage: ${PRESET_SHAPES[a].label}`)
}
const custom = [
  ...[3, 7, 12].map(sides => ({ id: `custom-polygon-${sides}`, kind: 'polygon', label: `${sides}-gon`, sides, cornerRadius: 0 })),
  ...[3, 7, 12].flatMap(points => [0.15, 0.85].map(innerRatio => ({ id: `custom-star-${points}-${innerRatio}`, kind: 'star', label: 'Custom star', points, innerRatio, cornerRadius: 0 }))),
]
for (const shape of custom) for (const [layout, cells] of Object.entries(layouts)) for (const corners of [0, 12]) {
  inspect(cells.map(([col, row]) => make(shape, col, row, 37, corners)),
    { shape, layout, sizes: [37, 37], softness: 1, corners }, 'custom')
}
const patterns = {
  O: ['11111', '10001', '10001', '10001', '11111'],
  A: ['00100', '01010', '10001', '11111', '10001'],
  S: ['11111', '10000', '11111', '00001', '11111'],
}
const families = ['preset-circle', 'preset-square', 'preset-star5', 'preset-cross', 'preset-ring', 'mixed']
for (const family of families) for (const [pattern, grid] of Object.entries(patterns)) for (const size of [37, 56]) for (const softness of [0.2, 1]) {
  const cells = grid.flatMap((line, row) => [...line].flatMap((on, col) => on === '1' ? [[col, row]] : []))
  const shapes = family === 'mixed' ? ['preset-circle', 'preset-square', 'preset-ring'].map(id => PRESET_SHAPES.find(shape => shape.id === id)) : [PRESET_SHAPES.find(shape => shape.id === family)]
  inspect(cells.map(([col, row], i) => make(shapes[i % shapes.length], col, row, size, 12)),
    { family, pattern, size, softness, corners: 12 }, 'layouts')
}
const finishedSources = fingerprints()
const byIssue = {}
for (const failure of failures) for (const issue of failure.issues) {
  const key = `${failure.method}:${issue.type}`
  byIssue[key] = (byIssue[key] || 0) + 1
}
const result = { generatedAt: new Date().toISOString(), sourceHashes: startedSources,
  sourcesUnchanged: JSON.stringify(startedSources) === JSON.stringify(finishedSources), counts, byIssue,
  timingNote: 'Single local run; timings cover initial render including geometry parsing, excluding reversed/rotated runs and visual rendering.',
  timings: Object.fromEntries(Object.entries(timings).map(([method, values]) => {
    const ordered = [...values].sort((a, b) => a - b)
    return [method, { medianMs: +ordered[Math.floor(ordered.length / 2)].toFixed(2), p95Ms: +ordered[Math.floor(ordered.length * 0.95)].toFixed(2), maxMs: +ordered.at(-1).toFixed(2) }]
  })), failures }
writeFileSync('/tmp/gridz-current-weld-review.json', JSON.stringify(result, null, 2))
console.log(JSON.stringify({ ...result, failures: failures.slice(0, 8) }, null, 2))
