import {createJiti} from 'jiti'
import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
const root=fileURLToPath(new URL('../',import.meta.url)),out=fileURLToPath(new URL('../../../outputs/',import.meta.url))
const j=createJiti(import.meta.url,{alias:{'@':`${root}src`}})
const {buildStarterBlueprint,STARTER_BLUEPRINTS}=await j.import('../src/lib/skeletons.ts')
const {STANDARD_CHARACTERS}=await j.import('../src/lib/fontDesign.ts')
const {PRESET_SHAPES}=await j.import('../src/lib/types.ts')
const {glyphPolygons}=await j.import('../src/lib/export.ts')
const {multiPolygonToPathList}=await j.import('../src/lib/polyBool.ts')
const grids=[[3,5],[7,9],[14,18],[20,9],[7,24],[20,24]]
let checks=0
for(const char of STANDARD_CHARACTERS)for(const [cols,rows]of grids){
 const grid={cols,rows,cellSize:40,gap:2},map=buildStarterBlueprint(char,grid,'preset-square',37)
 assert.ok(map.size,`${char} ${cols}x${rows} empty`)
 for(const [key,r]of map){assert.equal(key,r.key);assert.ok(r.col>=0&&r.col<cols&&r.row>=0&&r.row<rows);assert.equal(r.size,37);assert.equal(r.layer,'a');assert.equal(r.mode,'ink');assert.equal(r.rotation,0)}
 if(cols===7&&rows===9)assert.equal(map.size,STARTER_BLUEPRINTS[char].length)
 checks++
}
const compactGrid={cols:3,rows:5,cellSize:40,gap:2}
const eight=buildStarterBlueprint('8',compactGrid,'preset-square',37)
assert.ok(![...eight.values()].some(r=>r.col===1&&(r.row===1||r.row===3)), 'Compact 8 must preserve both counters')
const question=buildStarterBlueprint('?',compactGrid,'preset-square',37)
assert.ok([...question.values()].some(r=>r.row===4), 'Compact question mark keeps its dot')
assert.ok(![...question.values()].some(r=>r.row===3), 'Compact question mark separates its dot')
// Exact twofold expansion fills each reference cell with four stamps rather than scattering it.
assert.equal(buildStarterBlueprint('H',{cols:14,rows:18,cellSize:40,gap:2},'preset-square',37).size,STARTER_BLUEPRINTS.H.length*4)
let html='<!doctype html><meta charset="utf-8"><title>Responsive starter glyphs</title><style>body{font:16px system-ui;background:#f5f3ed;margin:28px}section{margin:28px 0}.cards{display:flex;flex-wrap:wrap;gap:12px}figure{margin:0;background:white;padding:12px;width:140px}svg{width:140px;height:160px}figcaption{text-align:center}h1{font-size:26px}</style><h1>Responsive starter glyphs</h1><p>Actual local Paint/export outlines. Reference proportions are preserved and centred. Larger grids fill strokes; tiny grids necessarily lose detail. The 3 × 5 examples use original compact drawings to preserve counters and dots. Existing 7 × 9 drawings remain unchanged.</p>'
for(const [cols,rows]of grids){html+=`<section><h2>${cols} × ${rows}</h2><div class="cards">`;for(const char of ['A','H','O','a','g','ä','2','8','?','&']){
 const grid={cols,rows,cellSize:40,gap:2},filledRegions=[...buildStarterBlueprint(char,grid,'preset-square',40).values()]
 const polys=glyphPolygons({grid,library:PRESET_SHAPES,filledRegions,glyphChar:char,softness:0,cornerRadius:0,holeMode:'open',brokenJoins:new Set()})
 assert.ok(polys.length)
 const paths=multiPolygonToPathList(polys);const safe=char==='&'?'&amp;':char
 html+=`<figure><svg viewBox="-5 -5 ${cols*42+10} ${rows*42+10}">${paths.map(d=>`<path d="${d}" fill="#111" fill-rule="evenodd"/>`).join('')}</svg><figcaption>${safe}</figcaption></figure>`
}html+='</div></section>'}
writeFileSync(`${out}starter-glyphs-review.html`,html)
console.log(JSON.stringify({checks,characters:STANDARD_CHARACTERS.length,renderedExamples:60,status:'passed'}))
