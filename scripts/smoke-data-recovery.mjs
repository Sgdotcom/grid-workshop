import assert from 'node:assert/strict'
import {createJiti} from 'jiti'
import {fileURLToPath} from 'node:url'
const root=fileURLToPath(new URL('../',import.meta.url)),j=createJiti(import.meta.url,{alias:{'@':root+'src'}})
const {parseSession,readSession,nextEmptyLetter,FESTIVAL_KEY}=await j.import('../src/lib/festival.ts')
const {PRESET_SHAPES}=await j.import('../src/lib/types.ts')
const time='2026-10-09T08:00:00.000Z'
const draft={char:'a',grid:{cols:3,rows:5,cellSize:40,gap:2},filled:[{key:'99:99:ink',col:99,row:99,layer:'a',kind:'shape',shapeId:'preset-square',size:37,mode:'ink'}],brokenJoins:[],softness:1,cornerRadius:0}
const base={version:1,updatedAt:time,active:draft,drafts:[draft],contributions:[],library:PRESET_SHAPES,liveSvg:''}
const parse=s=>parseSession(JSON.stringify(s))
let checks=0
for(const version of [1,2]){
  const result=parse({...base,version});assert.equal(result.version,2);assert.equal(result.active.filled[0].col,99);assert.equal(result.active.fontDesign.mergeDiagonal,true);assert.equal(result.customSymbols.length,0);checks++
}
const char='\u{10400}',symbol={char,name:'Deseret letter',updatedAt:time}
const recovered=parse({...base,active:{...draft,char},customSymbols:[symbol],draftUpdatedAt:{[char]:time,a:'garbage',b:'2026-10-09T10:00:00+02:00'}})
assert.equal(recovered.draftUpdatedAt[char],time);assert.equal(recovered.draftUpdatedAt.b,time);assert.equal(recovered.draftUpdatedAt.a,undefined);checks++
for(const mutation of [
  s=>s.active.holeMode='bad',s=>s.active.grid.cols=101,s=>s.active.grid.gap=-40,
  s=>s.active.filled[0].col=100,s=>s.active.filled[0].row=-1,s=>s.active.filled[0].size=null,
  s=>s.active.filled[0].rotation=null,s=>s.active.filled[0].mode='bad',s=>s.active.brokenJoins=['x'.repeat(257)],
  s=>s.active.fontDesign={thickness:-1},s=>s.customSymbols=[null],s=>s.customSymbols=[{...symbol,char:'ab'}],
  s=>s.customSymbols=[{...symbol,char:'\u0301'}],s=>s.customSymbols=[{...symbol,char:'\u0903'}],s=>s.customSymbols=[{...symbol,name:'   '}],s=>s.customSymbols=[symbol,symbol],s=>s.customSymbols=[{...symbol,updatedAt:'bad'}],
  s=>s.library=[{id:'bad',label:'Bad',kind:'star',points:5,innerRatio:1,cornerRadius:0}],
  s=>s.drafts=Array(513).fill(draft),s=>s.specimenText='x'.repeat(1501),s=>s.version=3,
]){const s=structuredClone(base);mutation(s);assert.throws(()=>parse(s));checks++}
assert.throws(()=>parseSession(' '.repeat(20_000_001)),/20 MB/);checks++
for(const raw of ['null','{','[]','"text"']){assert.throws(()=>parseSession(raw));checks++}
const symbols=[{char:'β',name:'Beta',updatedAt:time},{char:'γ',name:'Gamma',updatedAt:time}]
assert.equal(nextEmptyLetter('β',true,[],[{...draft,char:'Γ'}],symbols),'γ');checks++
// Reading a corrupt/blocked save must never write or destroy the original value.
let writes=0;let saved='{broken';globalThis.localStorage={getItem:key=>{assert.equal(key,FESTIVAL_KEY);return saved},setItem:()=>{writes++},removeItem:()=>{writes++}}
assert.throws(()=>readSession());assert.equal(saved,'{broken');assert.equal(writes,0);checks++
saved=JSON.stringify(base);assert.equal(readSession().active.char,'a');assert.equal(writes,0);checks++
globalThis.localStorage.getItem=()=>{throw new Error('Storage blocked')};assert.throws(()=>readSession(),/Storage blocked/);assert.equal(writes,0);checks++
delete globalThis.localStorage
console.log(JSON.stringify({checks,legacyMigration:true,supplementaryClocks:true,hiddenCoordinates:true,malformedRejected:true,storageReadOnly:true}))
