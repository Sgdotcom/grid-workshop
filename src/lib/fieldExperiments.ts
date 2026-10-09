import { marchingSquares, sdfRings } from './sdfBlend'
import { ringsToPath } from './polyBool'

type Rings = [number, number][][]

/** Bounded simplification of a closed contour used only by the fluid-flow sampler. */
export function compactFieldRing(ring: [number,number][], tolerance: number): [number,number][] {
  if (tolerance <= 0 || ring.length < 5) return ring
  const points = [...ring]
  if (points[0][0]===points[points.length-1][0] && points[0][1]===points[points.length-1][1]) points.pop()
  let split=1, farthest=0
  for(let i=1;i<points.length;i++) {
    const d=(points[i][0]-points[0][0])**2+(points[i][1]-points[0][1])**2
    if(d>farthest){farthest=d;split=i}
  }
  const simplify = (part: [number,number][]) => {
    const keep=new Set([0,part.length-1]), stack:[number,number][]=[[0,part.length-1]]
    while(stack.length){
      const [start,end]=stack.pop()!, a=part[start],b=part[end],dx=b[0]-a[0],dy=b[1]-a[1],len=dx*dx+dy*dy
      let index=-1,max=tolerance*tolerance
      for(let i=start+1;i<end;i++){
        const p=part[i],t=len?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/len)):0
        const distance=(p[0]-a[0]-t*dx)**2+(p[1]-a[1]-t*dy)**2
        if(distance>max){max=distance;index=i}
      }
      if(index>=0){keep.add(index);stack.push([start,index],[index,end])}
    }
    return [...keep].sort((a,b)=>a-b).map(i=>part[i])
  }
  const result=[...simplify(points.slice(0,split+1)),...simplify([...points.slice(split),points[0]]).slice(1,-1)]
  return result.length>=3?result:ring
}

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

const fieldCache = new Map<string, Rings>()

function computeFieldBlendRings(rings: Rings[], size: number, softness: number, method: 'sdf' | 'offset', tolerance: number) {
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
    // The expanded contour contains hundreds of nearly-collinear grid samples.
    // Reduce only this intermediate outline, within a pixel error bound, before erosion.
    const compact = tolerance ? expanded.map(r=>compactFieldRing(r,tolerance)) : expanded
    result = sampleField([expanded], margin, (x, y) => sdfRings(x, y, compact) + amount)
  }
  return result
}

/** Translation-independent cache: adding a stamp reuses unchanged local pair melts. */
export function fieldBlendRings(rings: Rings[], size: number, softness: number, method: 'sdf' | 'offset', tolerance = 0) {
  if (!rings.length) return []
  const points = rings.flat(2)
  const x = Math.min(...points.map(p => p[0])), y = Math.min(...points.map(p => p[1]))
  const local = rings.map(shape => shape.map(ring => ring.map(p => [Math.round((p[0]-x)*1e9)/1e9, Math.round((p[1]-y)*1e9)/1e9] as [number, number])))
  const key = JSON.stringify([size, softness, method, tolerance, local])
  let result = fieldCache.get(key)
  if (!result) {
    result = computeFieldBlendRings(local, size, softness, method, tolerance)
    if (fieldCache.size >= 256) fieldCache.delete(fieldCache.keys().next().value!)
    fieldCache.set(key, result)
  }
  return result.map(ring => ring.map(p => [p[0]+x, p[1]+y] as [number, number]))
}

export function fieldBlend(rings: Rings[], size: number, softness: number, method: 'sdf' | 'offset') {
  const result = fieldBlendRings(rings, size, softness, method)
  return result.length ? [ringsToPath(result)] : []
}
