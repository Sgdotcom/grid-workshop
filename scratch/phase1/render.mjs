import {readFileSync,writeFileSync} from 'node:fs'
import {createJiti} from 'jiti'
import pc from 'polygon-clipping'
import {geometry} from '../../scripts/join-geometry.mjs'
const root=new URL('../../',import.meta.url).pathname
const jiti=createJiti(import.meta.url,{alias:{'@':root+'src'}})
const current=await jiti.import(root+'src/lib/softness.ts')
const proposal=await jiti.import('./softness.ts')
const {PRESET_SHAPES}=await jiti.import(root+'src/lib/types.ts')
const {toPolygon,unionPolygons,differencePolygons,multiPolygonToPathList}=await jiti.import(root+'src/lib/polyBool.ts')
const area=polys=>polys.reduce((n,p)=>n+p.reduce((s,r,i)=>s+(i?-1:1)*Math.abs(r.reduce((t,a,j)=>{const b=r[(j+1)%r.length];return t+a[0]*b[1]-b[0]*a[1]},0))/2,0),0)/1e6
const make=(preset,col,row,size=37,corners=2)=>current.makeSoftStamp(`${col}:${row}`,col,row,20+42*col,20+42*row,size,PRESET_SHAPES.find(s=>s.preset===preset),20+42*col-size/2,20+42*row-size/2,corners)
const cases=[
 {group:'preserve',title:'Square + ring · Fill Gaps',mode:'no-gaps',production:true,stamps:[make('square',0,0,56),make('ring',1,0,24)],note:'Restore the ring’s original cutout after incidental gap cleanup.'},
 {group:'preserve',title:'Square + ring · Solid',mode:'solid',production:true,stamps:[make('square',0,0,56),make('ring',1,0,24)],note:'Explicit Solid mode still fills the ring: this is intentional.'},
 {group:'preserve',title:'Wedge · unequal vertical',production:true,stamps:[make('wedge',0,0,56),make('wedge',0,1,24)],note:'Unresolved: this Phase 1 candidate does not repair the unequal-wedge body loss. Shown explicitly as a remaining failure.'},
 {group:'curves',title:'Square · diagonal reference',stamps:[make('square',0,0),make('square',1,1)],note:'Keep the existing diagonal silhouette. This is a regression reference, not an aesthetic redesign.'},
 {group:'curves',title:'Triangle · reported asymmetry',stamps:[make('triangle',0,0,56),make('triangle',0,1,56)],note:'The reported symmetry failure already passes. No tolerance change is proposed.'},
 {group:'curves',title:'Arc · approved reference',production:true,stamps:[make('arc',0,0,56),make('arc',0,1,24)],note:'The approved arc result must remain unchanged.'},
 {group:'arms',title:'Sharp stars · original report',stamps:[make('star5',0,0,56,0),make('star5',0,1,56,0)],note:'At softness 0.20 the old floating islands no longer reproduce. Separate original bodies are not debris.'},
 {group:'arms',title:'Arc + notch · detached addition',stamps:[make('arc',0,0,24),make('notch',1,0,56)],note:'Remove only generated ink with no attachment to an original body. The defect is small; use outlines to inspect it.'},
 {group:'arms',title:'Wedge + notch · detached addition',stamps:[make('wedge',0,0,24),make('notch',1,0,56)],note:'A shared edge remains a valid weld attachment; it must not be deleted as debris.'},
 {group:'holes',title:'Circle + 4-star · order reference',stamps:[make('circle',0,1),make('star4',1,0)],note:'A fixed geometry-based order makes the raw weld identical when the two arguments are swapped.'},
]
const records=[]
function render(engine,c,softness){
 const bodies=c.stamps.map(s=>toPolygon(s.rings))
 if(!softness)return multiPolygonToPathList(bodies)
 if(c.production)return engine.softnessFinishPathList(c.stamps,{softness,holeMode:c.mode??'open'})
 const holes=c.stamps.flatMap(s=>s.rings.slice(1).map(r=>toPolygon([r])))
 const joined=unionPolygons([...bodies,...engine.organicWeld(...c.stamps,softness)])
 return multiPolygonToPathList(holes.length?differencePolygons(joined,holes):joined)
}
const data=cases.map(c=>{
 const outline=multiPolygonToPathList(c.stamps.map(s=>toPolygon(s.rings)))
 const body=geometry(outline)
 const steps=Array.from({length:21},(_,i)=>{
  const softness=i/20,before=render(current,c,softness),after=render(proposal,c,softness)
  const output=geometry(after),prior=geometry(before)
  const row={softness,current:before,proposed:after,rejected:0,parts:output.length,missing:100*area(pc.difference(body,output))/area(body),beforeMissing:+(100*area(pc.difference(body,prior))/area(body)).toFixed(2),changeArea:area(pc.xor(prior,output))}
  records.push({title:c.title,...row,current:undefined,proposed:undefined})
  return row
 })
 return {title:c.title,group:c.group,note:c.note,baseline:c.production?'Current workshop defaults':'Current outline weld',outline,steps}
})
let html=readFileSync(root+'scratch/weld-preview/template.html','utf8')
html=html.replace('Weld proposals · Arc fix applied','Phase 1 · Welding checks').replace('Arc fix applied · Other proposals pending','Phase 1 candidate · Workshop unchanged')
html=html.replace('Proposed welds, before you choose.','Phase 1: preserve the ink, then tune the shape.')
html=html.replace('The arc fix in “Keep the shape” is now applied to the workshop. All other candidates remain previews.','The proposed corrections are isolated. The workshop still has only the previously approved arc fix.')
html=html.replace('1 · Keep the shape','1 · Bodies & holes').replace('2 · Smoother curves','2 · Reference shapes').replace('3 · Stars & arms','3 · Detached ink').replace('4 · Holes & clusters','4 · Input order')
html=html.replace('Original shape bodies and ring holes are protected in every proposed frame.','Correctness candidates only; shape-specific aesthetic tuning is still pending.')
html=html.replace('Original bodies retained.', 'Reference outlines shown for comparison.')
html=html.replace('The arc fix is applied. Other candidates remain isolated; saved shapes and workshop preferences have not changed.','This Phase 1 candidate is not integrated into the workshop. Solid mode is intentionally unchanged.')
html=html.replace('const status=[', 'const status=[frame.missing>0.1?`Proposed still loses ${frame.missing.toFixed(2)}% of original body.`:"",')
html=html.replace("frame.parts>1||frame.rejected||","frame.missing>0.1||frame.parts>1||frame.rejected||")
writeFileSync(root+'docs/phase1-weld-preview.html',html.replace('__DATA__',JSON.stringify(data)))
writeFileSync(new URL('./preview-validation.json',import.meta.url),JSON.stringify(records,null,2))
console.log('Rendered 10 Phase 1 comparisons across 21 softness settings.')
