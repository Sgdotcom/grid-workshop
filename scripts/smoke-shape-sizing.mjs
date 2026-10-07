import assert from 'node:assert/strict'
import {createJiti} from 'jiti'
const j=createJiti(import.meta.url,{alias:{'@':new URL('../src',import.meta.url).pathname}})
const {PRESET_SHAPES}=await j.import('../src/lib/types.ts')
const {shapeOutlineRings,moduleShapePath,capsuleMedial}=await j.import('../src/lib/shapes.ts')
let checks=0
for(const def of PRESET_SHAPES)for(const size of [24,37,56,160])for(const corners of [0,2,8]){
 const rings=shapeOutlineRings(def,0,0,size,corners),pts=rings.flat();
 const extent=Math.max(...[0,1].map(axis=>Math.max(...pts.map(p=>p[axis]))-Math.min(...pts.map(p=>p[axis]))));
 assert(Math.abs(extent-size)<1e-8,`${def.preset} size ${size} corners ${corners}`)
 for(const rotation of [45,90]){
 const rotated=shapeOutlineRings(def,0,0,size,corners,rotation).flat();
 pts.forEach((p,i)=>assert(Math.abs(Math.hypot(p[0]-size/2,p[1]-size/2)-Math.hypot(rotated[i][0]-size/2,rotated[i][1]-size/2))<1e-8,'Rotation preserves physical size'))
 }
 if(!['circle','ring'].includes(def.preset)){
 const path=moduleShapePath(def,0,0,size,corners)
 const numbers=path.match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi).map(Number)
 assert.deepEqual(numbers,pts.flat(),'Painted and welded outlines match')
 }
 checks++
}
for(const size of [24,37,56,160])for(const preset of ['capsule','capsuleV']){
 const def=PRESET_SHAPES.find(d=>d.preset===preset),ring=shapeOutlineRings(def,0,0,size)[0];
 const {ax,ay,bx,by,r}=capsuleMedial(0,0,size,preset==='capsuleV');
 for(let i=0;i<ring.length;i++){
  const a=ring[i],b=ring[(i+1)%ring.length],x=(a[0]+b[0])/2,y=(a[1]+b[1])/2;
  const dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy)));
  assert(Math.abs(Math.hypot(x-ax-t*dx,y-ay-t*dy)-r)<.01001,'Capsule chord error below 0.01px')
 }
}
console.log(`PASS: ${checks} size cases, rotation invariance, paint/weld agreement and capsule curve precision.`)
