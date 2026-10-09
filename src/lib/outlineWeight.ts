import Clipper from 'clipper-lib';
import pc, { type MultiPolygon } from 'polygon-clipping';
import { differencePolygons } from './polyBool';
const SCALE = 10000;
export function offsetContours(polys: MultiPolygon, amount: number): MultiPolygon {
    if (!polys.length)
        return [];
    const paths = polys.flatMap(p => p.map((ring, i) => { const pts = ring.slice(0, -1).map(([x, y]) => ({ X: Math.round(x * SCALE), Y: Math.round(y * SCALE) })); if ((Clipper.Clipper.Area(pts) > 0) !== (i === 0))
        pts.reverse(); return pts; }));
    const offset = new Clipper.ClipperOffset(2, .02 * SCALE), out: any[] = [];
    offset.AddPaths(paths, Clipper.JoinType.jtRound, Clipper.EndType.etClosedPolygon);
    offset.Execute(out, amount * SCALE);
    const outers: MultiPolygon = [], holes: MultiPolygon = [];
    for (const path of out) {
        const ring = path.map((p: any) => [p.X / SCALE, p.Y / SCALE] as [
            number,
            number
        ]);
        if (ring.length < 3)
            continue;
        ring.push(ring[0]);
        (Clipper.Clipper.Area(path) > 0 ? outers : holes).push([ring]);
    }
    const all = [...outers, ...holes];
    return all.length ? pc.xor(all[0], ...all.slice(1)) : [];
}
export function weightContours(polys: MultiPolygon, thickness: number, outlineOnly: boolean): MultiPolygon { if (!Number.isFinite(thickness) || thickness < 0)
    throw Error('Thickness must be a finite nonnegative number.'); if (!thickness)
    return outlineOnly ? [] : polys; const outer = offsetContours(polys, thickness / 2); return outlineOnly ? differencePolygons(outer, offsetContours(polys, -thickness / 2)) : outer; }
