import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {createJiti} from 'jiti'
import pc from 'polygon-clipping'
import {geometry} from '../../scripts/join-geometry.mjs'
const root=fileURLToPath(new URL('../../',import.meta.url))
const jiti=createJiti(import.meta.url,{alias:{'@':root+'src'}})
const {PRESET_SHAPES}=await jiti.import('../../src/lib/types.ts')
const {makeSoftStamp,softnessFinishPathList}=await jiti.import('./softness.ts')
const {multiPolygonToPathList,toPolygon}=await jiti.import('../../src/lib/polyBool.ts')
const arc=PRESET_SHAPES.find(s=>s.preset==='arc')
const make=(col,row,size,rotation=0,shape=arc)=>makeSoftStamp(`${col}:${row}`,col,row,20+42*col,20+42*row,size,shape,20+42*col-size/2,20+42*row-size/2,2,rotation)
const area=polys=>polys.reduce((n,p)=>n+p.reduce((s,r,i)=>s+(i?-1:1)*Math.abs(r.reduce((t,a,j)=>{const b=r[(j+1)%r.length];return t+a[0]*b[1]-b[0]*a[1]},0))/2,0),0)/1e6
const originals=stamps=>geometry(multiPolygonToPathList(stamps.map(s=>toPolygon(s.rings))))
const approved=JSON.parse(readFileSync(new URL('../../scripts/fixtures/approved-arc-weld.json',import.meta.url)))
const pair=[make(0,0,56),make(0,1,24)]
for(const step of approved.steps){
  const actual=step.softness ? geometry(softnessFinishPathList(pair,step.softness)) : originals(pair)
  assert.ok(area(pc.xor(actual,geometry(step.paths)))<.02,`Approved preview at softness ${step.softness}`)
}
let checks=0
for(const cells of [[[0,0],[1,0]],[[0,0],[0,1]],[[0,0],[1,1]],[[0,1],[1,0]],[[0,0],[1,0],[0,1]],[[0,0],[1,0],[0,1],[1,1]]])
for(const sizes of [[56,24],[24,56],[37,37]])for(const rotation of [0,90,180,270])for(const softness of [.05,.2,.5,1]){
  const stamps=cells.map(([c,r],i)=>make(c,r,sizes[i%2],rotation))
  const body=originals(stamps)
  const actual=geometry(softnessFinishPathList(stamps,softness))
  assert.ok(area(pc.difference(body,actual))<.02,`Arc body loss: ${JSON.stringify({cells,sizes,rotation,softness})}`)
  for(const p of actual)assert.ok(area(pc.intersection([p],body))>.000001,'No detached ink added')
  const reverse=geometry(softnessFinishPathList([...stamps].reverse(),softness))
  assert.ok(area(pc.xor(actual,reverse))<.02,'Reversing stamp order preserves arc weld')
  checks++
}
assert.deepEqual(softnessFinishPathList(pair,0),[],'Zero softness contract')
const broken=geometry(softnessFinishPathList(pair,{softness:1,brokenJoins:new Set(['0:0|0:1'])}))
assert.ok(area(pc.xor(broken,originals(pair)))<.02,'Broken arc join retains separate original bodies')
const ring=make(1,0,24,0,PRESET_SHAPES.find(s=>s.preset==='ring'))
const mixed=[make(0,0,56),ring]
const hole=geometry(multiPolygonToPathList([toPolygon([ring.rings[1]])]))
const mixedResult=geometry(softnessFinishPathList(mixed,1))
assert.ok(area(pc.intersection(hole,mixedResult))<.0001,'Protected original hole in mixed arc component')
console.log(`PASS: 21 approved preview frames, ${checks} arc layout/size/rotation/softness cases, order, detached ink, zero/broken joins and mixed ring hole.`)
