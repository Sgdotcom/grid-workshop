import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createJiti} from 'jiti'
import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
const j=createJiti(import.meta.url,{jsx:{runtime:'automatic'},alias:{'@':new URL('../src',import.meta.url).pathname}})
const {resizeGlyph,DEFAULT_FONT_DESIGN}=await j.import('../src/lib/fontDesign.ts')
const {resizeIdentity}=await j.import('../src/lib/resizeGesture.ts')
const {FontDesignTools}=await j.import('../src/components/FontDesignTools.tsx')
const grid={cols:7,rows:9,cellSize:40,gap:2}
const source={char:'a',grid,filled:[{key:'1:1',col:1,row:1,shapeId:'preset-square',kind:'shape',size:37,rotation:45,layer:'b',mode:'ink'},{key:'1:1:cutout',col:1,row:1,shapeId:'preset-circle',kind:'shape',size:12,rotation:15,layer:'a',mode:'cutout'},{key:'99:99',col:99,row:99,shapeId:'preset-ring',kind:'shape',size:37,rotation:0,layer:'a',mode:'ink'}],brokenJoins:['1:1-2:1'],softness:.55,cornerRadius:0,holeMode:'open',fontDesign:DEFAULT_FONT_DESIGN}
for(const file of ['src/App.tsx','src/components/StudioDesk.tsx']){
 const text=readFileSync(new URL('../'+file,import.meta.url),'utf8')
 const body=text.match(/onResize=\{\(g,stretch,continuing\)=>\{(.*?)\}\} symbols=/s)?.[1]?.replaceAll('new Set<string>()','new Set()')
 assert.ok(body,'Live resize callback located')
 const activeRef={current:structuredClone(source)},resizeSourceRef={current:source},resizeResultRef={current:null},filledRef={current:new Map()},settingsRef={current:{grid}},brokenRef={current:new Set()};const snapshots=[]
 const restoreFilled=rows=>new Map(rows.map(r=>[r.key,r])),noop=()=>{}
 const callback=Function('resizeGlyph','resizeIdentity','activeRef','resizeSourceRef','resizeResultRef','filledRef','settingsRef','brokenRef','pushHistory','restoreFilled','setFilled','setGrid','setBrokenJoins',`return (g,stretch,continuing)=>{${body}}`)(resizeGlyph,resizeIdentity,activeRef,resizeSourceRef,resizeResultRef,filledRef,settingsRef,brokenRef,()=>snapshots.push(structuredClone(activeRef.current)),restoreFilled,noop,noop,noop)
 // Every intermediate step resamples the original drawing, not an already degraded result.
 for(const cols of [6,5,3,2,8,14,7])callback({...grid,cols},true,cols!==6)
 assert.equal(snapshots.length,1);assert.deepEqual(activeRef.current,resizeGlyph(source,grid,true));assert.equal(activeRef.current.filled.length,2)
 assert.deepEqual(snapshots[0],source,'undo restores hidden cells, joins and mixed cell styles')
 const remote={...source,filled:[{...source.filled[0],col:4,key:'4:1',size:88}],updatedAt:'2099-01-01'}
 activeRef.current=remote;callback({...grid,cols:14},true,true)
 assert.equal(snapshots.length,2);assert.deepEqual(activeRef.current,resizeGlyph(remote,{...grid,cols:14},true),'remote drawing replaces resize source')
 const other={...source,char:'b',filled:[{...source.filled[0],row:5,key:'1:5'}]}
 activeRef.current=other;callback({...grid,rows:18},true,true)
 assert.equal(snapshots.length,3);assert.deepEqual(activeRef.current,resizeGlyph(other,{...grid,rows:18},true),'letter switch replaces resize source')
 callback({...grid,rows:20},true,false);assert.equal(snapshots.length,4,'separate pointer/keyboard gesture has separate undo')
 assert.equal(resizeIdentity({...source,updatedAt:'later'}),resizeIdentity(source),'persistence clock does not break a gesture')
}
const noop=()=>{},props={design:DEFAULT_FONT_DESIGN,onDesign:noop,grid,onResize:noop,symbols:[],onCreate:noop,onRemove:noop,onSelect:noop,onRandom:noop,section:'characters'}
for(const [activeChar,category]of [['a','letters'],['3','digits'],['!','punctuation'],['\ue000','custom']]){
 const html=renderToStaticMarkup(React.createElement(FontDesignTools,{...props,activeChar}));assert.match(html,new RegExp(`<option selected="">${category}</option>`))
}
console.log('Resize callbacks passed in Workshop and desks: original-source multi-step drag, undo recovery, remote edits, letter switches, separate gestures; active character category initialization passed.')

const {restoreDeskCharacter}=await j.import('../src/lib/deskResume.ts')
const deskB={...source,char:'b',filled:[source.filled[1]]},session={version:2,active:deskB,drafts:[source],contributions:[],library:[],liveSvg:'',updatedAt:''}
assert.equal(restoreDeskCharacter(session,'a').active.char,'a')
assert.deepEqual(restoreDeskCharacter(session,'a').active.filled,source.filled)
assert.equal(restoreDeskCharacter(session,'b').active.char,'b')
assert.ok(restoreDeskCharacter(session,'a').drafts.some(d=>d.char==='b'),'the other desk active drawing remains shared')
assert.equal(restoreDeskCharacter(session,'3').active.filled.length,0)
assert.equal(restoreDeskCharacter(session,'3').active.char,'3')
assert.equal(restoreDeskCharacter(session,'invalid'),session)
assert.equal(restoreDeskCharacter(null,'a'),null)
assert.equal(restoreDeskCharacter({...session,customSymbols:[{char:'\ue000',name:'Deleted',deleted:true,updatedAt:''}]},'\ue000').active.char,'b')
console.log('Independent desk character restore passed: shared drawings retained, empty character resumed, invalid/deleted symbols ignored.')
