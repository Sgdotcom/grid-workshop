import assert from 'node:assert/strict'
import {createJiti} from 'jiti'
const jiti=createJiti(import.meta.url,{alias:{'@':process.cwd()+'/src'}})
const old=await jiti.import('./softness-before-arc-implementation.ts')
const current=await jiti.import('../../src/lib/softness.ts')
const {PRESET_SHAPES}=await jiti.import('../../src/lib/types.ts')
const {JOIN_CASES}=await jiti.import('../../src/lib/joinExperiments.ts')
let count=0
for(const shape of PRESET_SHAPES.filter(s=>s.preset!=='arc'))for(const layout of JOIN_CASES)for(const softness of [.2,.5,1]){
 const stamps=layout.cells.map(([c,r])=>current.makeSoftStamp(`${c}:${r}`,c,r,20+42*c,20+42*r,37,shape,20+42*c-18.5,20+42*r-18.5,2))
 assert.deepEqual(current.softnessFinishPathList(stamps,softness),old.softnessFinishPathList(stamps,softness),`${shape.label} ${layout.id} production`)
 for(let i=0;i<stamps.length;i++)for(let j=i+1;j<stamps.length;j++)assert.deepEqual(current.organicWeld(stamps[i],stamps[j],softness),old.organicWeld(stamps[i],stamps[j],softness),`${shape.label} ${layout.id} direct weld`)
 count++
}
console.log(`PASS: ${count} non-arc configurations unchanged in workshop and direct welds.`)
