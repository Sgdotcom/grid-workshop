import { marchingSquares, sdfRings } from './sdfBlend'
import { ringsToPath } from './polyBool'

type Rings = [number, number][][]

function sampleField(rings: Rings[], margin: number, evaluate: (x: number, y: number) => number) {
  const points = rings.flat(2)
  const step = 0.65
  const originX = Math.min(...points.map(point => point[0])) - margin
  const originY = Math.min(...points.map(point => point[1])) - margin
  const cols = Math.ceil((Math.max(...points.map(point => point[0])) + margin - originX) / step)
  const rows = Math.ceil((Math.max(...points.map(point => point[1])) + margin - originY) / step)
  const values = new Array<number>((cols + 1) * (rows + 1))
  for (let row = 0; row <= rows; row++) {
    for (let col = 0; col <= cols; col++) {
      values[row * (cols + 1) + col] = evaluate(originX + col * step, originY + row * step)
    }
  }
  return marchingSquares(values, cols, rows, originX, originY, step, 0)
}

export function fieldBlendRings(rings: Rings[], size: number, softness: number, method: 'sdf' | 'offset') {
  if (softness <= 0) return rings.flat()
  const amount = size * softness * 0.42
  const margin = amount * 2 + 4
  let result: Rings
  if (method === 'sdf') {
    result = sampleField(rings, margin, (x, y) => {
      const distances = rings.map(outline => sdfRings(x, y, outline)).sort((left, right) => left - right)
      let distance = distances[0]
      for (const next of distances.slice(1)) {
        const weight = Math.max(amount - Math.abs(distance - next), 0) / amount
        distance = Math.min(distance, next) - weight * weight * amount * 0.25
      }
      return distance
    })
  } else {
    const expanded = sampleField(rings, margin, (x, y) => Math.min(...rings.map(outline => sdfRings(x, y, outline))) - amount)
    if (!expanded.length) return []
    result = sampleField([expanded], margin, (x, y) => sdfRings(x, y, expanded) + amount)
  }
  return result
}

export function fieldBlend(rings: Rings[], size: number, softness: number, method: 'sdf' | 'offset') {
  const result = fieldBlendRings(rings, size, softness, method)
  return result.length ? [ringsToPath(result)] : []
}
