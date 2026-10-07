import {readFileSync,writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
import pc from 'polygon-clipping'
import {geometry,measure} from '../../scripts/join-geometry.mjs'
const html=readFileSync(new URL('../../docs/arc-flat-preview.html',import.meta.url),'utf8')
const data=JSON.parse(html.match(/const data=(.*?);const labels=/s)[1])
const records=[]
for(const c of data)for(const [i,variants] of c.steps.entries())for(const [v,paths] of variants.entries()){
 if(v===0)continue
 const metric=measure({paths,outlines:c.outline},c.title==='Stars'?'vertical':'horizontal')
 assert(metric.removedPercent<=.005,`${c.title} loses original ink`)
 const original=geometry(c.outline),output=geometry(paths)
 assert(metric.holes<=original.reduce((n,p)=>n+p.length-1,0),`${c.title} creates a closed hole`)
 const detached=output.filter(p=>!pc.intersection([p],original).length).length
 assert.equal(detached,0,`${c.title} has detached ink`)
 if(i===0)assert.equal(metric.addedArea,0)
 records.push({title:c.title,softness:i/4,variant:'protected arc contact',...metric})
}
writeFileSync(new URL('./validation.json',import.meta.url),JSON.stringify(records,null,2))
console.log(`Checked ${records.length} candidate frames: original bodies retained within 0.005% grid-rounding tolerance; no detached components; zero softness unchanged.`)
console.log(JSON.stringify(records.filter(r=>r.softness===1),null,2))
