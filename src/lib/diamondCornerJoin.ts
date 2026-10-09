import type { Polygon } from 'polygon-clipping'
import type { SoftStamp } from './softness'
import { toPolygon, unionPolygons } from './polyBool'
type Point = [number, number]

/** Full-Softness attachment at real diamond corners, preserving the square join's waist. */
export function diamondCornerJoin(a: SoftStamp, b: SoftStamp, bridges: Polygon[]): Polygon[] {
  const bodies = [a, b].map(s => toPolygon(s.rings)).filter((p): p is Polygon => !!p)
  const original = unionPolygons([...bodies, ...bridges])
  const length = Math.hypot(b.cx - a.cx, b.cy - a.cy)
  if (!length || !bridges.length) return bridges
  const u: Point = [(b.cx-a.cx)/length, (b.cy-a.cy)/length], n: Point = [-u[1], u[0]]
  const mid: Point = [(a.cx+b.cx)/2, (a.cy+b.cy)/2]
  const hits: number[] = []
  for (const p of original) for (const ring of p) for (let i=0; i<ring.length; i++) {
    const p = ring[i], q = ring[(i+1)%ring.length]
    const dp = (p[0]-mid[0])*u[0]+(p[1]-mid[1])*u[1], dq = (q[0]-mid[0])*u[0]+(q[1]-mid[1])*u[1]
    if ((dp<=0 && dq>0) || (dq<=0 && dp>0)) {
      const t = dp/(dp-dq)
      hits.push((p[0]+t*(q[0]-p[0])-mid[0])*n[0]+(p[1]+t*(q[1]-p[1])-mid[1])*n[1])
    }
  }
  if (!hits.length) return bridges
  const width = Math.max(...hits)-Math.min(...hits)
  if (width <= 0) return bridges
  const anchor = (s: SoftStamp, other: SoftStamp, sign: number): Point | undefined => {
    const candidates = s.rings[0].filter(p => (p[0]-s.cx)*(other.cx-s.cx)+(p[1]-s.cy)*(other.cy-s.cy)>=-1e-6)
    return candidates.reduce<Point | undefined>((best,p) => !best || sign*((p[0]-s.cx)*n[0]+(p[1]-s.cy)*n[1]) > sign*((best[0]-s.cx)*n[0]+(best[1]-s.cy)*n[1]) ? p : best, undefined)
  }
  const cubic = (p: Point, c: Point, d: Point, q: Point): Point[] => Array.from({length:33},(_,i) => {
    const t=i/32, v=1-t
    return [v*v*v*p[0]+3*v*v*t*c[0]+3*v*t*t*d[0]+t*t*t*q[0], v*v*v*p[1]+3*v*v*t*c[1]+3*v*t*t*d[1]+t*t*t*q[1]]
  })
  // On long face-facing gaps, approach the waist immediately rather than rounding a shoulder.
  const facePair = Math.abs(u[0])>.1 && Math.abs(u[1])>.1
  const shoulder = facePair ? Math.min(1,Math.max(0,(length/((a.size+b.size)/2/Math.SQRT2)-2.2)*14)) : 0
  const flank = (sign: number): Point[] | undefined => {
    const p=anchor(a,b,sign), q=anchor(b,a,sign)
    if (!p || !q) return
    const m: Point = [mid[0]+n[0]*sign*width/2,mid[1]+n[1]*sign*width/2]
    const reach=Math.max(0,Math.min(length*.23,((m[0]-p[0])*u[0]+(m[1]-p[1])*u[1])*.45,((q[0]-m[0])*u[0]+(q[1]-m[1])*u[1])*.45))
    return [...cubic(p,[p[0]+u[0]*reach-n[0]*sign*reach*shoulder,p[1]+u[1]*reach-n[1]*sign*reach*shoulder],[m[0]-u[0]*reach,m[1]-u[1]*reach],m),
      ...cubic(m,[m[0]+u[0]*reach,m[1]+u[1]*reach],[q[0]-u[0]*reach-n[0]*sign*reach*shoulder,q[1]-u[1]*reach-n[1]*sign*reach*shoulder],q).slice(1)]
  }
  const top=flank(1), bottom=flank(-1)
  if (!top || !bottom) return bridges
  const bridge=toPolygon([[...top,...bottom.reverse()]])
  return bridge ? [bridge] : bridges
}
