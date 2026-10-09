import assert from 'node:assert/strict'
import {createJiti} from 'jiti'
import {fileURLToPath} from 'node:url'
import {performance} from 'node:perf_hooks'
const root=fileURLToPath(new URL('../',import.meta.url)), j=createJiti(import.meta.url,{alias:{'@':root+'src'}})
const {glyphPolygons,glyphGeometryKey,rememberGlyphGeometry,buildSvgMarkup}=await j.import('../src/lib/export.ts')
const {PRESET_SHAPES}=await j.import('../src/lib/types.ts')
const {DEFAULT_FONT_DESIGN}=await j.import('../src/lib/fontDesign.ts')
let storage={};globalThis.window={localStorage:{getItem:key=>storage[key]??null}}
const p={grid:{cols:7,rows:9,cellSize:40,gap:2},library:PRESET_SHAPES,filledRegions:Array.from({length:12},(_,i)=>({key:`${i%4}:${Math.floor(i/4)}`,col:i%4,row:Math.floor(i/4),layer:'a',kind:'shape',shapeId:i%2?'preset-square':'preset-star5',size:37,rotation:45,mode:'ink'})),glyphChar:'a',softness:1,cornerRadius:2,holeMode:'open',brokenJoins:new Set(),fontDesign:{...DEFAULT_FONT_DESIGN,thickness:12,outlineOnly:true}}
const first=performance.now(), original=glyphPolygons(p),coldMs=performance.now()-first
assert.strictEqual(glyphPolygons(p),original)
const start=performance.now();for(let i=0;i<20;i++)buildSvgMarkup(p);const cachedExportMs=(performance.now()-start)/20
const originalKey=glyphGeometryKey(p)
for(const patch of [{fontDesign:{...p.fontDesign,thickness:16}},{fontDesign:{...p.fontDesign,outlineOnly:false}},{fontDesign:{...p.fontDesign,mergeDiagonal:false}},{softness:.55},{cornerRadius:0},{grid:{...p.grid,cols:3}},{holeMode:'solid'},{brokenJoins:new Set(['0:0|1:0'])},{filledRegions:[...p.filledRegions,{...p.filledRegions[0],mode:'cutout',shapeId:'preset-circle'}]},{library:PRESET_SHAPES.map((s,i)=>i? s:{...s,name:'Custom name'})}]){
 const changed={...p,...patch};assert.notEqual(glyphGeometryKey(changed),originalKey)
 assert.notStrictEqual(glyphPolygons(changed),original)
}
assert.equal(glyphGeometryKey({...p,brokenJoins:new Set(['a','b'])}),glyphGeometryKey({...p,brokenJoins:new Set(['b','a'])}))
for(const name of ['gridz-shape-join-methods-v2','gridz-active-join-engine-mode','gridz-melt-off-presets-v1']){
 storage={[name]:'changed'};assert.notEqual(glyphGeometryKey(p),originalKey)
}
// A late worker answer is stored under its captured preference key, never the current one.
storage={'gridz-melt-off-presets-v1':'["star5"]'}
const changedKey=glyphGeometryKey(p);rememberGlyphGeometry(originalKey,original)
const current=glyphPolygons(p);assert.notStrictEqual(current,original);assert.equal(glyphGeometryKey(p),changedKey)
storage={};assert.strictEqual(glyphPolygons(p),original)
for(let i=0;i<256;i++)rememberGlyphGeometry('eviction-test:'+i,[])
assert.notStrictEqual(glyphPolygons(p),original,'Bounded cache must evict its oldest result')
console.log(JSON.stringify({coldMs:Math.round(coldMs),cachedExportMs:Number(cachedExportMs.toFixed(2)),invalidationChecks:13,stalePreferences:'passed'}))
