import pc, { type Polygon } from 'polygon-clipping'
import type { SoftStamp } from './softness'
import { fieldBlendRings } from './fieldExperiments'
type Point = [number, number]
const scaled = (polys: Polygon[]): Polygon[] => polys.map(p => p.map(r => r.map(([x,y]) => [Math.round(x*1000),Math.round(y*1000)])))
const unscaled = (polys: Polygon[]): Polygon[] => polys.map(p => p.map(r => r.map(([x,y]) => [x/1000,y/1000])))
export function usesArcFlatBlend(a: SoftStamp,b: SoftStamp) {
  if (a.col !== b.col && a.row !== b.row) return false
  const arc = a.preset === 'arc' ? a : b.preset === 'arc' ? b : undefined
  if (!arc) return false
  const other = arc === a ? b : a
  return other.preset === 'square' || other.preset === 'rect' ||
    (other.preset === 'arc' && Math.abs(((arc.rotation ?? 0)-(other.rotation ?? 0))%360) === 180)
}
function opening(stamp: SoftStamp, stamps: SoftStamp[]): Polygon[]{
 const {cx,cy,size,rotation = 0}=stamp,ox=cx-size/2,oy=cy+size/2,r=size*.28,a=rotation*Math.PI/180;
 const local=([x,y]: Point): Point=>[cx+(x-cx)*Math.cos(a)+(y-cy)*Math.sin(a),cy-(x-cx)*Math.sin(a)+(y-cy)*Math.cos(a)];
 const other=stamps.find(s=>s!==stamp)!,ptsOther=other.rings.flat().map(local),center=local([other.cx,other.cy]);
 const lg=center[0]<cx?Math.max(0,Math.min(r*.95,ox-Math.max(...ptsOther.map(p=>p[0])))):0;
 const bg=center[1]>cy?Math.max(0,Math.min(r*.95,Math.min(...ptsOther.map(p=>p[1]))-oy)):0;
 const pts: Point[]=[[ox-lg,oy+bg],[ox-lg,oy-r+lg]];
 const cubic=(p: Point,c: Point,d: Point,q: Point)=>{for(let i=1;i<=24;i++){const t=i/24,u=1-t;pts.push([u*u*u*p[0]+3*u*u*t*c[0]+3*u*t*t*d[0]+t*t*t*q[0],u*u*u*p[1]+3*u*u*t*c[1]+3*u*t*t*d[1]+t*t*t*q[1]])}};
 cubic(pts[pts.length-1],[ox-lg,oy-r+lg*.448],[ox-lg*.552,oy-r],[ox,oy-r]);
 for(let i=1;i<=64;i++){const t=-Math.PI/2+i/64*Math.PI/2;pts.push([ox+r*Math.cos(t),oy+r*Math.sin(t)])}
 cubic(pts[pts.length-1],[ox+r,oy+bg*.552],[ox+r-bg*.448,oy+bg],[ox+r-bg,oy+bg]);
 if(bg>0){const left=Math.min(ox,...ptsOther.map(p=>p[0]))-10;pts.splice(0,26,[left,oy+bg],[left,oy-r],[ox,oy-r])}
 return scaled([[pts.map(([x,y])=>[cx+(x-cx)*Math.cos(a)-(y-cy)*Math.sin(a),cy+(x-cx)*Math.sin(a)+(y-cy)*Math.cos(a)])]])
}

const cache = new Map<string, Polygon[]>()
/** Approved rounded contact, preserving the arc mouth and both original bodies. */
export function arcFlatBlend(a: SoftStamp, b: SoftStamp, softness: number): Polygon[] {
  if (softness <= 0) return []
  const stamps = [a,b].sort((l,r)=>l.cy-r.cy || l.cx-r.cx)
  const key = JSON.stringify([softness,...stamps.map(s=>[s.rings,s.rotation])])
  const previous = cache.get(key)
  if (previous) return previous
  const bodies = scaled(stamps.map(s=>s.rings))
  const body = pc.union(bodies[0],...bodies.slice(1))
  const rings = fieldBlendRings(stamps.map(s=>s.rings),Math.min(a.size,b.size),softness*.65,'offset')
  const pieces = scaled(rings.map(r=>[r]))
  const melt = pieces.length ? pc.xor(pieces[0],...pieces.slice(1)) : []
  const openings = stamps.filter(s=>s.preset==='arc').flatMap(s=>opening(s,stamps))
  const protectedSpace = pc.difference(pc.union(openings[0],...openings.slice(1)),body)
  // Include the attached bodies so the guarded arc union can verify area attachment.
  const result = unscaled(pc.union(body,pc.difference(melt,protectedSpace)))
  if (cache.size >= 128) cache.delete(cache.keys().next().value!)
  cache.set(key,result)
  return result
}
