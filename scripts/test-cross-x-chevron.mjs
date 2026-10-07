import { createJiti } from 'jiti'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const jiti = createJiti(import.meta.url, { alias: { '@': path.resolve(root, 'src') } })

const { PRESET_SHAPES } = await jiti.import('../src/lib/types.ts')
const { makeSoftStamp, organicWeld } = await jiti.import('../src/lib/softness.ts')
const { toPolygon, unionPolygons, multiPolygonToPathList } = await jiti.import('../src/lib/polyBool.ts')

function sampleCubic(p0, p1, p2, p3, steps = 16) {
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

// Let's test Cross H, V, Diag
const crossShape = PRESET_SHAPES.find(s => s.preset === 'cross')
const xShape = PRESET_SHAPES.find(s => s.preset === 'x')
const chevronShape = PRESET_SHAPES.find(s => s.preset === 'chevron')

console.log('Cross:', !!crossShape, 'X:', !!xShape, 'Chevron:', !!chevronShape)
