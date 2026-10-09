import type { MultiPolygon } from 'polygon-clipping';
import { canvasPixelSize, letterGuideMetrics } from './gridGeometry';
import type { GridConfig } from './types';
export interface SpecimenSettings {
    size: number;
    tracking: number;
    leading: number;
    ink: string;
    paper: string;
    proportional: boolean;
    fontName: string;
}
export const DEFAULT_SPECIMEN: SpecimenSettings = { size: 72, tracking: 0, leading: 1.35, ink: '#000000', paper: '#ffffff', proportional: false, fontName: 'Beckmans Together' };
export interface GlyphMetrics {
    scale: number;
    left: number;
    advance: number;
    baseline: number;
    minY: number;
    maxY: number;
}
export function glyphMetrics(polys: MultiPolygon, grid: GridConfig, proportional = false): GlyphMetrics { const { width, height } = canvasPixelSize(grid), scale = 1000 / height, points = polys.flat(2), xs = points.map(p => p[0]), ys = points.map(p => p[1]); const minX = points.length ? xs.reduce((n, x) => Math.min(n, x), Infinity) : 0, maxX = points.length ? xs.reduce((n, x) => Math.max(n, x), -Infinity) : width, minY = points.length ? ys.reduce((n, y) => Math.min(n, y), Infinity) : 0, maxY = points.length ? ys.reduce((n, y) => Math.max(n, y), -Infinity) : height; return { scale, left: proportional ? minX : Math.min(0, minX), advance: Math.round(((proportional ? maxX - minX : Math.max(width, maxX) - Math.min(0, minX)) * scale) + 120), baseline: letterGuideMetrics(width, height, 1).baseline, minY, maxY }; }
export interface SpecimenGlyph {
    polygons: MultiPolygon;
    grid: GridConfig;
}
export function specimenSvg(text: string, glyphs: Map<string, SpecimenGlyph>, settings: SpecimenSettings) {
    validateSpecimen(settings);
    const n = (v: number) => Math.round(v * 1000) / 1000;
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    const scale = settings.size / 1000, tracking = settings.tracking / scale;
    let minX = 0, maxX = 1, minY = 0;
    let maxY = (lines.length - 1) * settings.size * settings.leading + settings.size;
    let content = '';
    const unsupported = new Set<string>();
    lines.forEach((line, i) => {
        let x = 0;
        const lineY = i * settings.size * settings.leading;
        for (const char of line) {
            if (char === ' ') { maxX = Math.max(maxX, (x + 550) * scale); x += 550 + tracking; continue; }
            const g = glyphs.get(char);
            if (!g) {
                unsupported.add(char);
                minX = Math.min(minX, x * scale);
                maxX = Math.max(maxX, x * scale + settings.size * .5);
                content += `<rect x="${n(x * scale)}" y="${n(lineY)}" width="${n(settings.size * .5)}" height="${n(settings.size * .8)}" fill="none" stroke="${settings.ink}" stroke-dasharray="3 3"/>`;
                x += 550 + tracking;
                continue;
            }
            const m = glyphMetrics(g.polygons, g.grid, settings.proportional);
            minY = Math.min(minY, lineY + (800 + (m.minY - m.baseline) * m.scale) * scale);
            maxY = Math.max(maxY, lineY + (800 + (m.maxY - m.baseline) * m.scale) * scale);
            for (const p of g.polygons) {
                const d = p.map(r => r.map(([px, py], j) => {
                    const pointX = (x + 60 + (px - m.left) * m.scale) * scale;
                    minX = Math.min(minX, pointX); maxX = Math.max(maxX, pointX);
                    return `${j ? 'L' : 'M'}${n(pointX)} ${n(lineY + (800 + (py - m.baseline) * m.scale) * scale)}`;
                }).join(' ') + ' Z').join(' ');
                content += `<path d="${d}" fill="${settings.ink}" fill-rule="evenodd"/>`;
            }
            maxX = Math.max(maxX, (x + m.advance) * scale);
            x += m.advance + tracking;
        }
    });
    // Reserve half a pixel for unsupported-marker strokes and rounding at the bounds.
    const padding = unsupported.size ? .5 : .001;
    minX -= padding; minY -= padding; maxX += padding; maxY += padding;
    const width = Math.max(1, maxX - minX), height = Math.max(settings.size, maxY - minY);
    return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${n(width)}" height="${n(height)}" viewBox="${n(minX)} ${n(minY)} ${n(width)} ${n(height)}"><rect x="${n(minX)}" y="${n(minY)}" width="${n(width)}" height="${n(height)}" fill="${settings.paper}"/>${content}</svg>`, unsupported: [...unsupported] };
}
export function validateSpecimen(s: SpecimenSettings) { if (!s || !Number.isFinite(s.size) || s.size < 12 || s.size > 500 || !Number.isFinite(s.tracking) || s.tracking < -20 || s.tracking > 100 || !Number.isFinite(s.leading) || s.leading < .5 || s.leading > 3 || !/^#[0-9a-f]{6}$/i.test(s.ink) || !/^#[0-9a-f]{6}$/i.test(s.paper) || typeof s.proportional !== 'boolean' || typeof s.fontName !== 'string' || s.fontName.length > 60)
    throw Error('Invalid specimen settings.'); return s; }
