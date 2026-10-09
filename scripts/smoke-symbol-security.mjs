import assert from 'node:assert/strict'
import {createJiti} from 'jiti'
const j=createJiti(import.meta.url)
const {validCharacter,symbolCharacter,mergeSymbols,resizeGlyph,randomCells,symbolTime}=await j.import('../src/lib/fontDesign.ts')
const at='2026-10-09T09:00:00.000Z', deleted={char:'\ue000',name:'Old symbol',updatedAt:at,deleted:true}
assert.equal(symbolCharacter([deleted],''),'\ue001')
assert.throws(()=>symbolCharacter([deleted],'\ue000'))
for(const c of ['\u0903','\u0301','\uFDD0','\uFFFF','\u{1FFFE}','\uD800','ab',' ','\n'])assert.equal(validCharacter(c),false,c)
for(const c of ['\u{1D400}','\u{20000}','\ue123','🦋'])assert.equal(validCharacter(c),true,c)
const occupied=Array.from({length:256},(_,i)=>({char:String.fromCodePoint(0xe000+i),name:'Symbol',updatedAt:at}))
assert.throws(()=>symbolCharacter(occupied,''),/256/)
assert.throws(()=>symbolCharacter(Array.from({length:512},(_,i)=>({...deleted,char:String.fromCodePoint(0xe000+i)})),''),/512/)
const a={char:'\ue001',name:'First',updatedAt:at},b={...a,name:'Last'}
assert.deepEqual(mergeSymbols([a],[b]),mergeSymbols([b],[a]))
assert.equal(mergeSymbols([{...a,updatedAt:'2026-10-09T12:00:00+02:00'}],[{...b,updatedAt:'2026-10-09T09:30:00Z'}])[0].name,'First')
assert.equal(mergeSymbols([{...a,updatedAt:'invalid'}],[b]).length,1)
assert.equal(mergeSymbols([a],[{...a,deleted:true}])[0].deleted,true)
assert.equal(mergeSymbols([{...a,deleted:true}],[a])[0].deleted,true)
assert.equal(mergeSymbols([{...a,name:'X'.repeat(41)}]).length,0)
assert.ok(Date.parse(symbolTime([{...a,updatedAt:'2099-01-01T00:00:00Z'}]))>Date.parse('2099-01-01T00:00:00Z'))
const grid={cols:2,rows:2,cellSize:40,gap:2},ink={key:'0:0',col:0,row:0,kind:'shape',layer:'b',shapeId:'preset-square',size:37,rotation:90,mode:'ink'},cutout={...ink,key:'0:0:cutout',mode:'cutout'},hidden={...ink,key:'3:3',col:3,row:3}
const draft={char:'a',grid,filled:[ink,cutout,hidden],brokenJoins:['old']}
const preserved=resizeGlyph(draft,{...grid,cols:1,rows:1},false)
assert.deepEqual(preserved.filled,draft.filled);assert.deepEqual(preserved.brokenJoins,['old'])
const stretched=resizeGlyph(draft,{...grid,cols:4,rows:4},true)
assert.equal(stretched.filled.length,8);assert.deepEqual(stretched.brokenJoins,[])
assert.ok(stretched.filled.every(r=>r.size===74&&r.rotation===90&&r.layer==='b'))
assert.equal(stretched.filled.filter(r=>r.mode==='cutout').length,4)
for(const bad of [NaN,Infinity,0,101,1.5])assert.throws(()=>resizeGlyph(draft,{...grid,cols:bad},true))
assert.equal(resizeGlyph(draft,{...grid,cols:100,rows:100},false).grid.cols,100)
let seed=12345;const rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32}
const variants=new Set(), counts=[]
for(const [cols,rows] of [[1,1],[1,100],[100,1],[7,9],[20,24],[100,100]])for(let i=0;i<50;i++){
 const cells=randomCells({...grid,cols,rows},rng)
 assert.ok(cells.length>=Math.min(3,cols*rows));assert.equal(new Set(cells.map(c=>c.join(':'))).size,cells.length)
 assert.ok(cells.every(([x,y])=>Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&x<cols&&y>=0&&y<rows))
 if(cols===7&&rows===9){variants.add(JSON.stringify(cells));counts.push(cells.length)}
}
assert.ok(variants.size>40);assert.ok(Math.max(...counts)-Math.min(...counts)>25)
console.log('Unicode, tombstones, limits, metadata clocks, resize modes, and 300 random patterns passed.')
