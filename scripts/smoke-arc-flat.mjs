import assert from 'node:assert/strict'
import {createJiti} from 'jiti'
import pc from 'polygon-clipping'
import {geometry,measure} from './join-geometry.mjs'
const j=createJiti(import.meta.url,{alias:{'@':new URL('../src',import.meta.url).pathname}})
const {PRESET_SHAPES}=await j.import('../src/lib/types.ts')
const {makeSoftStamp,softnessFinishPathList}=await j.import('../src/lib/softness.ts')
const {multiPolygonToPathList}=await j.import('../src/lib/polyBool.ts')
const make=(preset,col,row,size=37,rotation=0)=>makeSoftStamp(`${col}:${row}`,col,row,20+42*col,20+42*row,size,PRESET_SHAPES.find(s=>s.preset===preset),20+42*col-size/2,20+42*row-size/2,2,rotation)
const cases=[
 [make('square',0,0),make('arc',1,0)], [make('arc',0,0),make('square',0,1)],
 [make('arc',0,0),make('square',1,0)], [make('square',0,0),make('arc',0,1)],
 [make('arc',0,0,37,180),make('arc',1,0)], [make('rect',0,0),make('arc',1,0)],
 [make('square',0,0,24),make('arc',1,0,56)], [make('arc',0,0,24),make('square',0,1,56)],
]
for(const stamps of cases){
 const outlines=multiPolygonToPathList(stamps.map(s=>s.rings))
 for(const softness of [.25,.5,.75,1]){
 const paths=softnessFinishPathList(stamps,{softness,holeMode:'open'}),m=measure({paths,outlines},'none')
 assert(m.removedPercent<.005,'Original bodies retained')
 assert.equal(m.holes,0,'Arc mouths stay open')
 if(softness===1)assert.equal(m.components,1,'Full-softness pair must join')
 const reverse=softnessFinishPathList([...stamps].reverse(),{softness,holeMode:'open'})
 assert.deepEqual(paths,reverse,'Paint order does not change the result')
 }
 const key=stamps.map(s=>s.id).sort().join('|')
 const broken=softnessFinishPathList(stamps,{softness:1,brokenJoins:new Set([key]),holeMode:'open'})
 assert.equal(pc.xor(geometry(broken),geometry(outlines)).length,0,'Broken join preserves bodies')
 assert.deepEqual(softnessFinishPathList(stamps,0),[],'Zero softness does not weld')
}
console.log('PASS: 32 live arc/flat blends, body preservation, open mouths, order and broken/zero joins.')
