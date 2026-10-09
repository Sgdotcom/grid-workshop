import assert from 'node:assert/strict'
import { Worker } from 'node:worker_threads'
import { readdirSync } from 'node:fs'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'
import { performance } from 'node:perf_hooks'
const root=fileURLToPath(new URL('../',import.meta.url))
const j=createJiti(import.meta.url,{alias:{'@':`${root}src`}})
const { glyphPolygons, glyphGeometryKey, rememberGlyphGeometry, buildSvgMarkup }=await j.import('../src/lib/export.ts')
const { PRESET_SHAPES }=await j.import('../src/lib/types.ts')
const file=readdirSync(`${root}dist/assets`).find(f=>f.startsWith('paintGeometry.worker-')&&f.endsWith('.js'))
assert.ok(file,'Run build first')
const worker=new Worker(`const {parentPort}=require('node:worker_threads');globalThis.self=globalThis;globalThis.postMessage=v=>parentPort.postMessage(v);import(${JSON.stringify(pathToFileURL(`${root}dist/assets/${file}`).href)}).then(()=>{parentPort.on('message',data=>self.onmessage({data}));parentPort.postMessage({ready:true})});`,{eval:true})
await new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject)})
let id=0,checks=0,maxTimerGap=0
let storage={}
globalThis.window={localStorage:{getItem:key=>storage[key]??null}}
try {
  for(const pair of [['circle'],['star5','square'],['circle','cross'],['diamond'],['ring'],['diamond'],['cross','square'],['ring']]) {
    storage=checks===4?{'gridz-melt-off-presets-v1':'["ring"]'}:checks===5?{'gridz-active-join-engine-mode':'fork-current'}:{}
    const payload={grid:{cols:7,rows:9,cellSize:40,gap:2},library:PRESET_SHAPES,
      filledRegions:Array.from({length:12},(_,i)=>({key:`${i%4}:${Math.floor(i/4)}`,col:i%4,row:Math.floor(i/4),layer:'a',kind:'shape',shapeId:`preset-${pair[i%pair.length]}`,size:37,rotation:0,mode:'ink'})),
      glyphChar:'a',fontDesign:checks>=6?{thickness:8,outlineOnly:checks===7,mergeHorizontal:false,mergeVertical:true,mergeDiagonal:false}:undefined,softness:checks===5?1:.55,cornerRadius:2,brokenJoins:new Set(checks===4?['0:0|1:0']:[]),holeMode:checks===4?'solid':'open'}
    let last=performance.now()
    const timer=setInterval(()=>{const now=performance.now();maxTimerGap=Math.max(maxTimerGap,now-last);last=now},10)
    const start=performance.now()
    const result=await new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);worker.postMessage({id:++id,payload,storage})})
    clearInterval(timer)
    assert.equal(result.error,undefined)
    const workerMs=performance.now()-start
    const mainStart=performance.now(),expected=glyphPolygons(payload),mainMs=performance.now()-mainStart
    assert.deepEqual(result.polygons,expected,'Worker must use identical Paint/export geometry')
    rememberGlyphGeometry(glyphGeometryKey(payload, storage), result.polygons)
    assert.strictEqual(glyphPolygons(payload),result.polygons,'Export must reuse exact worker result without recomputing offsets')
    const exportStart=performance.now();buildSvgMarkup(payload);const cachedExportMs=performance.now()-exportStart
    console.log(JSON.stringify({brushes:pair.join('+'),workerMs:Math.round(workerMs),synchronousMs:Math.round(mainMs),cachedExportMs:Math.round(cachedExportMs)}))
    checks++
  }
  assert.ok(maxTimerGap<100,`Background geometry blocked the caller: ${maxTimerGap} ms`)
  console.log(JSON.stringify({checks,maxTimerGapMs:Math.round(maxTimerGap)}))
} finally {await worker.terminate()}
