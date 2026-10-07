import assert from 'node:assert/strict'
import {createJiti} from 'jiti'
import pc from 'polygon-clipping'
import {geometry} from '../../scripts/join-geometry.mjs'
const root=new URL('../../',import.meta.url).pathname
const jiti=createJiti(import.meta.url,{alias:{'@':root+'src'}})
const old=await jiti.import(root+'src/lib/softness.ts')
const candidate=await jiti.import('./softness.ts')
const {PRESET_SHAPES}=await jiti.import(root+'src/lib/types.ts')
const {toPolygon,multiPolygonToPathList,unionPolygons}=await jiti.import(root+'src/lib/polyBool.ts')
const area=polys=>polys.reduce((n,p)=>n+p.reduce((s,r,i)=>s+(i?-1:1)*Math.abs(r.reduce((t,a,j)=>{const b=r[(j+1)%r.length];return t+a[0]*b[1]-b[0]*a[1]},0))/2,0),0)/1e6
const make=(shape,c,r,size=37)=>old.makeSoftStamp(`${c}:${r}`,c,r,20+c*42,20+r*42,size,shape,20+c*42-size/2,20+r*42-size/2,2)
const lookup=preset=>PRESET_SHAPES.find(s=>s.preset===preset)
let exactChecks=0
if(!process.env.RING_ONLY)for(let i=0;i<PRESET_SHAPES.length;i++)for(let j=i;j<PRESET_SHAPES.length;j++)for(const [c,r] of [[1,0],[0,1],[1,1],[1,-1]]){
 const a=make(PRESET_SHAPES[i],0,0),b=make(PRESET_SHAPES[j],c,r)
 for(const softness of [.2,1]){
  assert.deepEqual(candidate.organicWeld(a,b,softness),candidate.organicWeld(b,a,softness),'Raw pair output must be exactly commutative')
  assert.deepEqual(candidate.organicWeld({...a,id:'zz'}, {...b,id:'aa'},softness),candidate.organicWeld(a,b,softness),'Stamp ids cannot change the chosen order')
  exactChecks++
 }
}
let holes=0
for(const preset of ['square','rect','octagon','diamond','hexagon'])for(const [c,r] of [[1,0],[0,1]])for(const softness of [.2,1]){
 const stamps=[make(lookup(preset),0,0,56),make(lookup('ring'),c,r,24)]
 const hole=geometry(multiPolygonToPathList([toPolygon([stamps[1].rings[1]])]))
 for(const mode of ['open','no-gaps','solid']){
  const output=geometry(candidate.softnessFinishPathList(stamps,{softness,holeMode:mode,maxGapArea:1058.4}))
  if(mode==='solid')assert.ok(area(pc.intersection(hole,output))>area(hole)*.99,'Solid intentionally fills original hole')
  // Allow 0.01 square pixels for the independent oracle’s 0.001px coordinate rounding.
  else assert.ok(area(pc.intersection(hole,output))<.01,JSON.stringify({preset,c,r,softness,mode,filled:area(pc.intersection(hole,output))}))
  holes++
 }
}
const square=[make(lookup('square'),0,0),make(lookup('square'),1,1)]
for(let i=1;i<=20;i++){
 const render=engine=>geometry(multiPolygonToPathList(unionPolygons([...square.map(s=>toPolygon(s.rings)),...engine.organicWeld(...square,i/20)])))
 assert.ok(area(pc.xor(render(old),render(candidate)))<.02,'Square diagonal gold standard unchanged')
}
console.log(`PASS: ${exactChecks} exact commutativity/id checks, ${holes} ring-mode checks and 20 square diagonal reference frames.`)
