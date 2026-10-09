import type { Polygon } from 'polygon-clipping'
import pc from 'polygon-clipping'
import { contactSites, fuseMaxGap, softnessFinishPolygons, softEdgeKey, type SoftStamp } from './softness'
import { fieldBlendRings } from './fieldExperiments'
import { differencePolygons, intentionalHoleCutters, ringAbsArea, toPolygon, unionPolygons } from './polyBool'
import { getMixedPairJoinMethod, isPresetMeltOff } from './shapeJoinRegistry'

export type FlowVariant = 'soft-field' | 'full-field' | 'rounded-closing' | 'contour-flow'

/** Fluid joins for the main Paint/export engine; approved reference shapes retain their engine. */
export function flowBlend(stamps: SoftStamp[], softness: number, variant: FlowVariant, brokenJoins = new Set<string>()): Polygon[] {
  const ordered = [...stamps].sort((a,b) => a.row-b.row || a.col-b.col || a.id.localeCompare(b.id))
  const bodies = ordered.map(s => toPolygon(s.rings)).filter((p): p is Polygon => !!p)
  if (softness <= .02) return unionPolygons(bodies)
  const pieces: Polygon[] = [...bodies]
  for (let i=0;i<ordered.length;i++) for(let j=i+1;j<ordered.length;j++) {
    const a=ordered[i],b=ordered[j], dc=Math.abs(a.col-b.col),dr=Math.abs(a.row-b.row)
    if (dc>1 || dr>1 || brokenJoins.has(softEdgeKey(a.col,a.row,b.col,b.row))) continue
    const diagonal=!!(dc&&dr)
    if (diagonal && ordered.some(s => s!==a && s!==b && ((s.col===a.col&&s.row===b.row)||(s.col===b.col&&s.row===a.row)))) continue
    if (isPresetMeltOff(a.preset) || isPresetMeltOff(b.preset) || getMixedPairJoinMethod(a.preset,b.preset)==='none') continue
    if (a.preset===b.preset && ['circle','ring','diamond','square','arc'].includes(a.preset ?? '')) {
      pieces.push(...softnessFinishPolygons([a,b],{softness,brokenJoins})); continue
    }
    const size=(a.size+b.size)/2, gap=Math.min(...contactSites(a,b).map(c=>c.gap))
    if (gap>fuseMaxGap(size,softness,diagonal)) continue
    const closing = variant==='rounded-closing' || variant==='contour-flow'
    const amount = closing
      ? Math.max(size*.2, gap*.65+size*.06)*softness
      : Math.max(size*(variant==='full-field'?.9:.6), gap*(variant==='full-field'?3.1:2.5)+size*.12)*softness**1.25
    const effectiveSoftness=amount/(size*.42)
    const rings=fieldBlendRings([a.rings,b.rings],size,effectiveSoftness,closing?'offset':'sdf',.02)
    const polygons=rings.map(r=>toPolygon([r])).filter((p): p is Polygon => !!p)
    // Marching squares returns outer rings and holes independently: rebuild even-odd nesting.
    const field = polygons.length ? pc.xor(polygons[0],...polygons.slice(1)) : []
    if (variant==='contour-flow') {
      const pairBodies=[toPolygon(a.rings),toPolygon(b.rings)].filter((p): p is Polygon => !!p)
      if (unionPolygons([...pairBodies,...field]).length>1) {
        // Closing alone cannot bridge every tip/diagonal gap. Scale this fallback
        // by the actual gap, so already-touching shapes never grow a centre blob.
        const reach=(gap*2.5+size*.12)*softness**1.25
        // A smooth-min field cannot cross a gap unless its reach exceeds 2×gap.
        // Avoid a second full sampling pass that cannot possibly connect it yet.
        if (reach > gap*2) {
          const fallbackRings=fieldBlendRings([a.rings,b.rings],size,reach/(size*.42),'sdf')
          const fallback=fallbackRings.map(r=>toPolygon([r])).filter((p): p is Polygon => !!p)
          if (fallback.length) pieces.push(...pc.xor(fallback[0],...fallback.slice(1)))
        }
      }
    }
    pieces.push(...field)
  }
  const joined=unionPolygons(pieces)
  const size=ordered.length ? ordered.reduce((n,s)=>n+s.size,0)/ordered.length : 0
  const cleaned=joined.map(p=>[p[0],...p.slice(1).filter(r=>ringAbsArea(r)>=size*size*.003)])
  const cutters=intentionalHoleCutters(ordered.map(s=>s.rings))
  return cutters.length ? differencePolygons(cleaned,cutters) : cleaned
}
