// Isolated proposal: never imported by the workshop. node scratch/weld-preview/build.mjs
import {readFileSync,writeFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import {createJiti} from 'jiti'
import pc from 'polygon-clipping'
const root=fileURLToPath(new URL('../../',import.meta.url))
const sourceFiles=['src/lib/softness.ts','src/lib/shapes.ts','src/lib/polyBool.ts','src/lib/shapeJoinRegistry.ts']
const hashes=()=>Object.fromEntries(sourceFiles.map(p=>[p,createHash('sha256').update(readFileSync(root+p)).digest('hex')]))
const before=hashes()
// Freeze the original before/after candidates now that the arc fix is approved.
let source=readFileSync(new URL('./softness-before-arc-implementation.ts',import.meta.url),'utf8')
// Keep original attachment machinery in a frozen, isolated copy; replace only
// the proposed curve construction and arm-local attachment budget.
const start=source.indexOf('  const flank = (p: WeldEnd, q: WeldEnd, sign: number) => {')
const end=source.indexOf('\n\n  // Closed by the chords',start)
if(start<0||end<0)throw new Error('Weld source changed: review extraction before rebuilding')
source=source.slice(0,start)+`  const flank = (p: WeldEnd, q: WeldEnd, sign: number) => {
    const op = offset(p.pt) * sign
    const oq = offset(q.pt) * sign
    const chord = dist(...p.pt, ...q.pt)
    const height = Math.max(0.4, Math.min(op, oq))
    const waist = Math.min(height, Math.max(0.45, height * (0.24 + softness * 0.35)))
    const mid: [number, number] = [mx + nx * sign * waist, my + ny * sign * waist]
    const dx = q.pt[0] - p.pt[0], dy = q.pt[1] - p.pt[1]
    const len = Math.hypot(dx, dy) || 1
    const tx = dx / len, ty = dy / len
    const h = Math.min(chord * 0.27, height * 0.85)
    const mh = chord * 0.16
    // Both outline tangents are retained exactly. The two cubic segments
    // share a tangent through the waist; no post-sampling coordinate clamp.
    const left = sampleCubic(p.pt,
      [p.pt[0] + p.exit[0] * h, p.pt[1] + p.exit[1] * h],
      [mid[0] - tx * mh, mid[1] - ty * mh], mid, 20)
    const right = sampleCubic(mid,
      [mid[0] + tx * mh, mid[1] + ty * mh],
      [q.pt[0] + q.exit[0] * h, q.pt[1] + q.exit[1] * h], q.pt, 20)
    return [...left, ...right.slice(1)]
  }`+source.slice(end)
source=source.replace('s.size * arcFrac, Math.max(1.5, s.size * 0.06)',
  "(['star', 'cross', 'x', 'chevron'].includes(s.family) ? Math.min(s.size * arcFrac, s.arm * (1.5 + softness * 1.5)) : s.size * arcFrac), Math.max(0.6, s.arm * 0.25)")
writeFileSync(new URL('./proposal-engine.ts',import.meta.url),'// GENERATED PREVIEW COPY ONLY. Not connected to the workshop.\n'+source)
const jiti=createJiti(import.meta.url,{alias:{'@':root+'src'},moduleCache:false})
const current=await jiti.import(new URL('./softness-before-arc-implementation.ts',import.meta.url).pathname)
const applied=await jiti.import(root+'src/lib/softness.ts')
const proposal=await jiti.import(new URL('./proposal-engine.ts',import.meta.url).pathname)
const {PRESET_SHAPES}=await jiti.import(root+'src/lib/types.ts')
const {toPolygon,unionPolygons,multiPolygonToPathList}=await jiti.import(root+'src/lib/polyBool.ts')
const {geometry}=await import('../../scripts/join-geometry.mjs')
const area=polys=>polys.reduce((total,p)=>total+p.reduce((sum,r,i)=>sum+(i?-1:1)*Math.abs(r.reduce((n,a,j)=>{const b=r[(j+1)%r.length];return n+a[0]*b[1]-b[0]*a[1]},0))/2,0),0)
const snap=polys=>polys.map(p=>p.map(r=>r.map(([x,y])=>[Math.round(x*1000),Math.round(y*1000)])))
const paths=polys=>multiPolygonToPathList(polys.map(p=>p.map(r=>r.map(([x,y])=>[x/1000,y/1000]))))
const make=(preset,col,row,size=37,corners=2)=>current.makeSoftStamp(`${col}:${row}`,col,row,20+42*col,20+42*row,size,PRESET_SHAPES.find(s=>s.preset===preset),20+42*col-size/2,20+42*row-size/2,corners)
const H=[[0,0],[1,0]],V=[[0,0],[0,1]],D=[[0,0],[1,1]],L=[[0,0],[1,0],[0,1]],Q=[[0,0],[1,0],[0,1],[1,1]]
const pairCase=(group,title,preset,layout,sizes=[37,37],note='',corners=2)=>({group,title,note,stamps:layout.map(([c,r],i)=>make(preset,c,r,sizes[i]??sizes[0],corners))})
const cases=[
 pairCase('preserve','Arc · unequal vertical','arc',V,[56,24],'Keep the complete arc bodies when adding a bridge.'),
 pairCase('preserve','Wedge · unequal vertical','wedge',V,[56,24],'Keep the complete wedge bodies when adding a bridge.'),
 {group:'preserve',title:'Wedge + capsule',rawWeld:true,note:'Mixed outlines with a known body-loss failure.',stamps:[make('wedge',0,0),make('capsule',0,1)]},
 pairCase('curves','Square · diagonal reference','square',D,[37,37],'Preserve the diagonal character you liked.'),
 pairCase('curves','Rectangle · vertical','rect',V,[37,37],'Curves leave the outline along its own direction.'),
 pairCase('curves','Capsule · diagonal','capsule',D,[37,37],'A shaped waist with no clipped curve points.'),
 pairCase('arms','Star · horizontal','star5',H,[41,41],'Limit attachments to the facing arms.',0),
 pairCase('arms','Star · diagonal','star5',D,[37,37],'Still too thin on this long diagonal. Included to show the remaining limitation.'),
 pairCase('arms','Cross · diagonal','cross',D,[37,37],'Try one filled neck instead of trapping a slit between two struts.'),
 pairCase('arms','X · horizontal','x',H,[37,37],'Try closing the accidental centre slit while preserving the outer arms.'),
 pairCase('arms','Chevron · horizontal','chevron',H,[37,37],'Inspect the open mouths and attachment points.'),
 {group:'holes',title:'Square + ring · Fill Gaps',note:'Seal incidental gaps while restoring the original ring hole. Solid mode is not changed.',mode:'no-gaps',stamps:[make('square',0,0,56),make('ring',1,0,24)]},
 pairCase('holes','Cross · block','cross',Q,[37,37],'Use the workshop’s orthogonal cluster connections in both columns.'),
 pairCase('holes','Chevron · L cluster','chevron',L,[37,37],'No diagonal shortcut across this cluster.'),
]
function edges(stamps){
 const map=new Map(stamps.map(s=>[`${s.col}:${s.row}`,s]))
 const out=[]
 for(const a of stamps)for(const [dx,dy] of [[1,0],[0,1],[1,1],[1,-1]]){
   const b=map.get(`${a.col+dx}:${a.row+dy}`)
   if(!b)continue
   if(dx&&dy&&(map.has(`${a.col+dx}:${a.row}`)||map.has(`${a.col}:${a.row+dy}`)))continue
   out.push([a,b])
 }
 return out
}
const stats=[]
const data=cases.map(c=>{
 const originals=c.stamps.map(s=>toPolygon(s.rings))
 const originalPaths=multiPolygonToPathList(originals)
 const holes=c.stamps.flatMap(s=>s.rings.slice(1).map(r=>snap([toPolygon([r])])[0]))
 const union=geometry(originalPaths)
 const base=holes.length?pc.difference(union,...holes):union
 const steps=[]
 for(let step=0;step<=20;step++){
   const softness=step/20
   let currentPaths=originalPaths
   if(softness>0.02){
     // Production on the reproduced body-loss/ring cases; pure weld on
     // design comparisons. Both candidate columns share the same pair graph.
     currentPaths=(c.group==='preserve'&&!c.rawWeld)||c.mode ? current.softnessFinishPathList(c.stamps,{softness,holeMode:c.mode??'open'}) : multiPolygonToPathList(unionPolygons([...originals,...edges(c.stamps).flatMap(([a,b])=>current.organicWeld(a,b,softness))]))
   }
   let output=base, rejected=0
   if(softness>0.02){
     if(c.mode){
       output=geometry(current.softnessFinishPathList(c.stamps,{softness,holeMode:c.mode}))
       if(holes.length)output=pc.difference(output,...holes)
     }else for(const [a,b] of edges(c.stamps)){
       for(const bridge of proposal.organicWeld(a,b,softness)){
         try{
           // Normalize bridge independently so malformed contours cannot
           // interfere with the stamp union. Keep only attached pieces.
           const normalized=pc.union(...snap([bridge]))
           const attached=normalized.filter(p=>area(pc.intersection([p],output))>1)
           if(!attached.length){rejected++;continue}
           let next=pc.union(output,...attached)
           if(holes.length)next=pc.difference(next,...holes)
           if(area(pc.difference(base,next))>1){rejected++;continue}
           output=next
         }catch{rejected++}
       }
     }
   }
   // Pair-only treatment: close newly created cross/X slits, never a cluster counter.
   if(softness>0.02 && c.stamps.length===2 && ['cross','x'].includes(c.stamps[0].preset) && !holes.length){
     const originalHoles=base.flatMap(p=>p.slice(1).map(r=>[r]))
     output=output.map(p=>[p[0]])
     if(originalHoles.length)output=pc.difference(output,...originalHoles)
   }
   // The approved card now shows the actual production arc result.
   if(c.title==='Arc · unequal vertical' && softness>0.02) output=geometry(applied.softnessFinishPathList(c.stamps,softness))
   const missing=area(pc.difference(base,output))/Math.max(1,area(base))*100
   const holeFill=holes.length?area(pc.intersection(output,holes))/1e6:0
   if(missing>.001||holeFill>.001)throw new Error(`${c.title}: body or hole protection failed`)
   const beforeGeom=geometry(currentPaths)
   const row={softness,current:currentPaths,proposed:paths(output),rejected,parts:output.length,missing:+missing.toFixed(4),beforeMissing:+(100*area(pc.difference(base,beforeGeom))/Math.max(1,area(base))).toFixed(2),holeFill}
   stats.push({title:c.title,...row,current:undefined,proposed:undefined})
   steps.push(row)
 }
 return {applied:c.title==='Arc · unequal vertical',group:c.group,title:c.title,note:c.note,baseline:(c.group==='preserve'&&!c.rawWeld)||c.mode?'Workshop defaults':'Current outline weld',outline:originalPaths,steps}
})
const unchanged=JSON.stringify(before)===JSON.stringify(hashes())
if(!unchanged)throw new Error('Production sources changed during preview generation')
writeFileSync(new URL('./validation.json',import.meta.url),JSON.stringify({productionUnchanged:unchanged,sourceHashes:before,cases:stats},null,2))
const template=readFileSync(new URL('./template.html',import.meta.url),'utf8')
writeFileSync(root+'docs/weld-proposals.html',template.replace('__DATA__',JSON.stringify(data)))
console.log(`Built ${data.length} comparisons × 21 softness steps. Body/hole invariants passed. Production hashes unchanged.`)
