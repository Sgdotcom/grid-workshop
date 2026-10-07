import {readFileSync,writeFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
const root=fileURLToPath(new URL('../../',import.meta.url))
let source=readFileSync(root+'src/lib/softness.ts','utf8')
function replaceOnce(from,to){if(!source.includes(from))throw new Error('Source changed: '+from.slice(0,80));source=source.replace(from,to)}
replaceOnce('  const ringA = a.rings[0]\n  const ringB = b.rings[0]',`  // Geometry-based order, independent of paint order and generated stamp ids.
  if (!site) {
    const order = a.cy - b.cy || a.cx - b.cx || a.size - b.size ||
      (a.preset ?? a.family).localeCompare(b.preset ?? b.family) ||
      JSON.stringify(a.rings).localeCompare(JSON.stringify(b.rings))
    if (order > 0) return organicWeld(b, a, softness)
  }
  const ringA = a.rings[0]
  const ringB = b.rings[0]`)
// Do not loosen the triangle tolerance: the exact reported case already passes.
replaceOnce(`  const holes = [holePolygon(a), holePolygon(b)].filter((p): p is Polygon => !!p)
  return holes.length ? differencePolygons([poly], holes) : [poly]
}`,`  const holes = [a, b].flatMap(stamp => stamp.rings.slice(1).map(ring => toPolygon([ring])))
    .filter((p): p is Polygon => !!p)
  const clipped = holes.length ? differencePolygons([poly], holes) : [poly]
  if (arcPair) return clipped // Retain the approved arc construction exactly.
  // Normalize the bridge alone before union with bodies, then discard only
  // generated pieces without any area attachment to either original body.
  try {
    const snap = (p: Polygon): Polygon => p.map(r => r.map(([x, y]) => [Math.round(x * 1000), Math.round(y * 1000)]))
    const bodies = [toPolygon(a.rings), toPolygon(b.rings)].filter((p): p is Polygon => !!p).map(snap)
    if (!clipped.length) return []
    const normalized = polygonClipping.union(snap(clipped[0]), ...clipped.slice(1).map(snap))
    return normalized.filter(piece => bodies.some(body => {
      const overlap = polygonClipping.intersection(piece, body)
      if (overlap.some(p => ringAbsArea(p[0]) - p.slice(1).reduce((sum, r) => sum + ringAbsArea(r), 0) > 1)) return true
      // A shared edge is also a valid attachment, even with zero overlap area.
      return polygonClipping.union(body, piece).length <= polygonClipping.union(body).length
    })).map(p => p.map(r => r.map(([x, y]) => [x / 1000, y / 1000])))
  } catch {
    return [] // Invalid generated ink must not endanger the original stamps.
  }
}`)
replaceOnce("  return holeMode !== 'open' ? filterPolygonHoles(polys, holeMode, maxGapArea) : polys",`  const filtered = holeMode !== 'open' ? filterPolygonHoles(polys, holeMode, maxGapArea) : polys
  if (holeMode !== 'no-gaps') return filtered
  // Fill Gaps removes only incidental voids, not an original ring cutout.
  const protectedHoles = stamps.flatMap(stamp => stamp.rings.slice(1).map(ring => toPolygon([ring])))
    .filter((p): p is Polygon => !!p)
  return protectedHoles.length ? differencePolygons(filtered, protectedHoles) : filtered`)
writeFileSync(new URL('./softness.ts',import.meta.url),'// ISOLATED PHASE 1 CANDIDATE. Not imported by the workshop.\n'+source)
let experiments=readFileSync(root+'src/lib/joinExperiments.ts','utf8')
experiments=experiments.replaceAll("from './", "from '@/lib/").replace("from '@/lib/softness'", "from './softness'")
writeFileSync(new URL('./joinExperiments.ts',import.meta.url),experiments)
// Run existing tests unchanged apart from importing this candidate.
for(const name of ['smoke-weld-alignment','smoke-arc-weld']){
 let test=readFileSync(root+`scripts/${name}.mjs`,'utf8')
 test=test.replace("new URL('../', import.meta.url)","new URL('../../', import.meta.url)").replace("new URL('../',import.meta.url)","new URL('../../',import.meta.url)")
 test=test.replaceAll("'./join-geometry.mjs'","'../../scripts/join-geometry.mjs'")
 test=test.replaceAll("'../src/lib/softness.ts'","'./softness.ts'").replaceAll("'../src/lib/joinExperiments.ts'","'./joinExperiments.ts'")
 test=test.replaceAll("'../src/","'../../src/").replaceAll("'./fixtures/","'../../scripts/fixtures/")
 writeFileSync(new URL(`./${name}.mjs`,import.meta.url),test)
}
let audit=readFileSync(root+'scripts/audit-join-coverage.mjs','utf8')
audit=audit.replace("new URL('../', import.meta.url)","new URL('../../', import.meta.url)").replace("'./join-geometry.mjs'","'../../scripts/join-geometry.mjs'")
audit=audit.replace("'../src/lib/softness.ts'","'./softness.ts'").replaceAll("'../src/","'../../src/")
audit=audit.replace('`${root}docs/join-extended-validation.json`','`${root}scratch/phase1/validation.json`')
writeFileSync(new URL('./audit.mjs',import.meta.url),audit)
console.log('Isolated candidate built; workshop source untouched.')
