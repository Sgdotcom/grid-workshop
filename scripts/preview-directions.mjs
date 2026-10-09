import { createJiti } from 'jiti'
import { mkdirSync, readFileSync, writeFileSync, cpSync } from 'node:fs'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../', import.meta.url))
const out = fileURLToPath(new URL('../../../outputs/', import.meta.url))
const candidate = `${root}scratch/direction-candidate/`
mkdirSync(candidate, { recursive: true })
mkdirSync(out, { recursive: true })
cpSync(`${root}src/lib`, `${candidate}lib`, { recursive: true })
const source = readFileSync(`${root}src/lib/softness.ts`, 'utf8')
const replacement = `const direction = axis === 'h' ? 'horizontal' : axis === 'v' ? 'vertical'
    : (b.col - a.col) * (b.row - a.row) > 0 ? 'diagonal-right' : 'diagonal-left'
  const method = getActiveJoinMethod(preset, direction)`
assert.ok(source.includes('const method = getActiveJoinMethod(preset, axis)'))
writeFileSync(`${candidate}lib/softness.ts`, source.replace('const method = getActiveJoinMethod(preset, axis)', replacement))
const jiti = createJiti(import.meta.url, { alias: { '@': `${root}src` } })
const baseline = await jiti.import(`${root}src/lib/softness.ts`)
const proposed = await jiti.import(`${candidate}lib/softness.ts`)
const { PRESET_SHAPES } = await jiti.import(`${root}src/lib/types.ts`)
const { multiPolygonToPathList, toPolygon, unionPolygons, differencePolygons } = await jiti.import(`${root}src/lib/polyBool.ts`)
const layouts = [
  { id: 'horizontal', name: 'Horizontal', cells: [[0,0],[1,0]] },
  { id: 'vertical', name: 'Vertical', cells: [[0,0],[0,1]] },
  { id: 'diagonal-right', name: 'Diagonal ↘', cells: [[0,0],[1,1]] },
  { id: 'diagonal-left', name: 'Diagonal ↙', cells: [[1,0],[0,1]] },
  { id: 'elbow', name: 'L cluster', cells: [[0,0],[1,0],[0,1]] },
  { id: 'block', name: '2 × 2 cluster', cells: [[0,0],[1,0],[0,1],[1,1]] },
]
const levels = [0, .25, .55, 1]
const data = {}
let checks = 0, changed = 0
const issues = []
const area = ps => ps.reduce((sum,p) => sum + p.reduce((s,r,i) => s + (i ? -1 : 1) * Math.abs(r.reduce((a,v,k) => { const n=r[(k+1)%r.length]; return a+v[0]*n[1]-n[0]*v[1] },0))/2,0),0)
for (const preset of ['square','diamond']) for (const size of [37,42,56]) for (const corner of [0,2]) for (const rotation of [0,90]) {
  const shape = PRESET_SHAPES.find(s => s.preset === preset)
  const rows = []
  for (const layout of layouts) {
    const stamps = layout.cells.map(([col,row]) => baseline.makeSoftStamp(`${col}:${row}`,col,row,20+col*42,20+row*42,size,shape,20+col*42-size/2,20+row*42-size/2,corner,rotation))
    const bodies = unionPolygons(stamps.map(s=>toPolygon(s.rings)))
    const outlines = multiPolygonToPathList(bodies)
    const comparisons = levels.map(softness => {
      const before = softness ? baseline.softnessFinishPolygons(stamps,softness) : bodies
      const after = softness ? proposed.softnessFinishPolygons(stamps,softness) : bodies
      assert.ok(after.length, 'Candidate must retain ink')
      for (const p of after) for (const r of p) for (const xy of r) assert.ok(xy.every(Number.isFinite))
      const lost = area(differencePolygons(bodies,after)); const beforeLost = area(differencePolygons(bodies,before))
      const reversed = softness ? proposed.softnessFinishPolygons([...stamps].reverse(),softness) : bodies
      const orderDelta = area(differencePolygons(after,reversed))+area(differencePolygons(reversed,after)); if(lost>.01 || orderDelta>.1) issues.push({preset,size,corner,rotation,layout:layout.id,softness,lost,beforeLost,orderDelta})
      const delta = area(differencePolygons(before,after))+area(differencePolygons(after,before))
      if (delta>.01) changed++
      if (!softness || (preset==='square' && layout.id.startsWith('diagonal')) || (preset==='diamond' && ['horizontal','vertical'].includes(layout.id))) assert.ok(delta<.01,'Unaffected direction changed')
      checks++
      return {softness,lost,beforeLost,orderDelta,before:multiPolygonToPathList(before),after:multiPolygonToPathList(after),delta:Math.round(delta*10)/10}
    })
    rows.push({...layout,outlines,comparisons})
  }
  data[`${preset}|${size}|${corner}|${rotation}`] = rows
}
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Paint geometry · directional joins</title>
<style>*{box-sizing:border-box}body{margin:0;background:#f3f2ed;color:#20211d;font:15px system-ui}main{max-width:1450px;margin:auto;padding:32px}h1{font-size:30px;margin:0 0 12px}p{max-width:850px;line-height:1.5}.controls{display:flex;gap:22px;flex-wrap:wrap;padding:20px 0;position:sticky;top:0;background:#f3f2ed;z-index:2}label{display:grid;gap:6px;font-size:12px}select{font:15px system-ui;padding:8px;border:1px solid #bbb;background:white}.note{padding:12px 0;color:#52574b}table{width:100%;border-collapse:collapse;table-layout:fixed}th{text-align:left;font-weight:500;padding:14px 8px;border-bottom:1px solid #bbb}td{vertical-align:top;padding:16px 8px;border-bottom:1px solid #ccc}th:first-child{width:125px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:8px}figure{margin:0}figcaption{font-size:11px;color:#555;padding:5px 0}svg{display:block;width:100%;background:white;aspect-ratio:1}.changed{color:#276248}.detail{font-size:11px;color:#777;margin-top:6px}.scroll{overflow:auto}table{min-width:950px}footer{margin-top:25px;font-size:12px;color:#666}@media(max-width:1000px){table{min-width:0}thead{display:none}tbody,tr{display:block}tr>th{display:block;width:100%!important;font-weight:600}td{display:inline-block;width:50%}td::before{content:attr(data-level);display:block;font-size:12px;margin-bottom:8px}.scroll{overflow:visible}} </style>
<main><h1>Paint geometry · directional joins</h1><p>Compare the existing Paint engine with a candidate that correctly reads horizontal, vertical and diagonal join settings. Black is the finished ink; the optional green outline shows the original stamps.</p>
<div class="controls"><label>Brush<select id="shape"><option value="square">Square</option><option value="diamond">Diamond</option></select></label><label>Stamp size<select id="size"><option>37</option><option selected>42</option><option>56</option></select></label><label>Corner radius<select id="corner"><option value="0">0 px</option><option value="2">2 px</option></select></label><label>Rotation<select id="rotation"><option value="0">0°</option><option value="90">90°</option></select></label><label>Original outlines<select id="outline"><option value="off">Hidden</option><option value="on">Shown</option></select></label></div>
<div id="note" class="note"></div><div class="scroll"><table><thead><tr><th>Direction</th><th>Crisp · 0%</th><th>Softness · 25%</th><th>Softness · 55%</th><th>Softness · 100%</th></tr></thead><tbody id="rows"></tbody></table></div>
<footer>Source: Sgdotcom/grid-workshop · main c4222756 · 8 October 2026. Grid: 40 px cells, 2 px gap. Default join preferences; melt enabled; open gaps. Candidate changes exist only in an isolated copy. L and block cases apply the new settings per pair; cluster-specific overrides remain outside this proposal. ${checks} geometry comparisons verified: finite outlines and unchanged controls. Stamp retention and input-order checks are reported below each comparison. ${changed} comparisons differ.</footer></main>
<script>const data=${JSON.stringify(data)};const ids=['shape','size','corner','rotation','outline'];const get=id=>document.getElementById(id).value;function picture(paths,outlines){return '<svg viewBox="-14 -14 110 110" role="img" aria-label="Paint silhouette">'+paths.map(d=>'<path d="'+d+'" fill="#111" fill-rule="evenodd"/>').join('')+(get('outline')==='on'?outlines.map(d=>'<path d="'+d+'" fill="none" stroke="#3b8768" stroke-width=".55"/>').join(''):'')+'</svg>'}function render(){const shape=get('shape');document.getElementById('note').textContent=shape==='square'?'Square: horizontal / vertical use the intended Current method; diagonals keep Weld.':'Diamond: diagonals use the intended Weld method; horizontal / vertical keep Metaball.';document.getElementById('rows').innerHTML=data[[shape,get('size'),get('corner'),get('rotation')].join('|')].map(row=>'<tr><th>'+row.name+'</th>'+row.comparisons.map(c=>'<td data-level="Softness '+Math.round(c.softness*100)+'%"><div class="pair"><figure>'+picture(c.before,row.outlines)+'<figcaption>Before</figcaption></figure><figure>'+picture(c.after,row.outlines)+'<figcaption>Candidate</figcaption></figure></div><div class="detail '+(c.delta? 'changed':'')+'">'+(c.delta?'Geometry changed':'Same geometry')+(c.lost>.01?'<br>Stamp loss: '+c.lost.toFixed(2)+' px² (before '+c.beforeLost.toFixed(2)+')':'')+(c.orderDelta>.1?'<br>Order sensitivity: '+c.orderDelta.toFixed(2)+' px²':'')+'</div></td>').join('')+'</tr>').join('')}ids.forEach(id=>document.getElementById(id).addEventListener('change',render));render();</script></html>`
writeFileSync(`${out}paint-direction-preview.html`,html)
writeFileSync(`${out}paint-direction-candidate.patch`, `--- a/src/lib/softness.ts\n+++ b/src/lib/softness.ts\n@@ -1343,1 +1343,3 @@\n-  const method = getActiveJoinMethod(preset, axis)\n+  ${replacement.replaceAll('\n','\n+')}\n`)
writeFileSync(`${out}paint-direction-validation.json`,JSON.stringify({checks,changed,issues},null,2))
console.log(JSON.stringify({checks,changed,issues,output:`${out}paint-direction-preview.html`}))
