import pc from 'polygon-clipping'

const areaRing = ring => Math.abs(ring.reduce((sum, p, i) => {
  const q = ring[(i + 1) % ring.length]
  return sum + p[0] * q[1] - p[1] * q[0]
}, 0)) / 2
const area = polygons => polygons.reduce((sum, polygon) => sum + areaRing(polygon[0]) - polygon.slice(1).reduce((n, ring) => n + areaRing(ring), 0), 0)
export function geometry(paths) {
  const polygons = paths.map(path => {
    if (/[CQASTHV]/i.test(path.replace(/e[-+]?\d+/gi, ''))) throw new Error('Audit expects polygonal SVG paths')
    const rings = path.split(/M/i).filter(part => part.trim()).map(part => {
      const nums = part.match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi).map(Number)
      // Integer coordinates prevent near-identical floating point edges from
      // breaking the independent boolean measurements (0.001px precision).
      return Array.from({ length: nums.length / 2 }, (_, i) => [Math.round(nums[i * 2] * 1000), Math.round(nums[i * 2 + 1] * 1000)])
    }).filter(ring => ring.length >= 3)
    // SVG evenodd fill: holes and disconnected exteriors can share one path.
    return rings.length ? pc.xor(...rings.map(ring => [ring])) : []
  }).filter(polygon => polygon.length)
  return polygons.length ? pc.union(...polygons) : []
}
export function measure(result, layout) {
  const output = geometry(result.paths)
  const original = geometry(result.outlines)
  const originalArea = area(original)
  const added = pc.difference(output, original)
  const removed = pc.difference(original, output)
  const axes = layout === 'horizontal' ? ['y'] : layout === 'vertical' ? ['x'] : []
  let asymmetry = null
  for (const axis of axes) {
    const reflect = polygons => polygons.map(polygon => polygon.map(ring => ring.map(([x, y]) => axis === 'x' ? [40000 - x, y] : [x, 40000 - y])))
    if (area(pc.xor(original, reflect(original))) / originalArea < 0.0001) {
      asymmetry = area(pc.xor(output, reflect(output))) / originalArea
    }
  }
  return {
    components: output.length,
    originalComponents: original.length,
    holes: output.reduce((n, polygon) => n + polygon.length - 1, 0),
    addedArea: +(area(added) / 1e6).toFixed(3),
    removedPercent: +(100 * area(removed) / originalArea).toFixed(4),
    asymmetryPercent: asymmetry === null ? null : +(100 * asymmetry).toFixed(4),
  }
}
