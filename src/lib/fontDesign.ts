import { regionKey, type FilledRegion, type GlyphDraft, type GridConfig } from './types';
export interface FontDesign {
    thickness: number;
    outlineOnly: boolean;
    mergeHorizontal: boolean;
    mergeVertical: boolean;
    mergeDiagonal: boolean;
}
export const DEFAULT_FONT_DESIGN: FontDesign = { thickness: 0, outlineOnly: false, mergeHorizontal: true, mergeVertical: true, mergeDiagonal: true };
export interface CustomSymbol {
    char: string;
    name: string;
    updatedAt: string;
    deleted?: boolean;
}
export const DIGITS = [...'0123456789'];
export const PUNCTUATION = [...`!"#$%&'()*+,-./:;<=>?@[\\]^_\u0060{|}~`];
export const LETTER_CHARACTERS = [...'abcdefghijklmnopqrstuvwxyzåäöABCDEFGHIJKLMNOPQRSTUVWXYZÅÄÖ'];
export const STANDARD_CHARACTERS = [...LETTER_CHARACTERS, ...DIGITS, ...PUNCTUATION];
export function validCharacter(c: unknown): c is string { return typeof c === 'string' && [...c].length === 1 && !/[\p{Cc}\p{Cf}\p{Cs}\p{M}\s]/u.test(c) && !/[\uFDD0-\uFDEF]/u.test(c) && (c.codePointAt(0)! & 0xffff) < 0xfffe; }
export function mergeSymbols(a: CustomSymbol[] = [], b: CustomSymbol[] = []): CustomSymbol[] { const m = new Map<string, CustomSymbol>(); for (const s of [...a, ...b]) {
    if (!s || !validCharacter(s.char) || STANDARD_CHARACTERS.includes(s.char) || typeof s.name !== 'string' || !s.name.trim() || s.name.length > 40 || typeof s.updatedAt !== 'string' || !Number.isFinite(Date.parse(s.updatedAt)) || (s.deleted !== undefined && typeof s.deleted !== 'boolean'))
        continue;
    const old = m.get(s.char);
    const time = Date.parse(s.updatedAt), oldTime = old ? Date.parse(old.updatedAt) : -Infinity;
    if (!old || time > oldTime || (time === oldTime && (s.deleted && !old.deleted || !!s.deleted === !!old.deleted && s.name > old.name)))
        m.set(s.char, { ...s, updatedAt: new Date(time).toISOString() });
} return [...m.values()].sort((x, y) => x.char.codePointAt(0)! - y.char.codePointAt(0)!); }
export function symbolCharacter(symbols: CustomSymbol[], entered: string) {
    // A deleted mapping still owns its code point: published glyphs and late desk
    // updates can reference it. Only undo may restore that existing identity.
    if (symbols.filter(s => !s.deleted).length >= 256) throw Error('Maximum 256 custom symbols.');
    if (symbols.length >= 512) throw Error('This project has reached its 512 symbol-history limit. Start a new project to add more symbols.');
    if (entered) {
    if (!validCharacter(entered) || STANDARD_CHARACTERS.includes(entered) || symbols.some(s => s.char === entered))
        throw Error('Enter one unused visible Unicode character.');
    return entered;
} for (let cp = 0xe000; cp <= 0xf8ff; cp++) {
    const c = String.fromCodePoint(cp);
    if (!symbols.some(s => s.char === c))
        return c;
} throw Error('No private-use slots remain.'); }
export function resizeGlyph(draft: GlyphDraft, next: GridConfig, stretch: boolean): GlyphDraft { const old = draft.grid;
    for (const grid of [old, next]) {
        if (!grid || !Number.isInteger(grid.cols) || !Number.isInteger(grid.rows) || grid.cols < 1 || grid.cols > 100 || grid.rows < 1 || grid.rows > 100 || !Number.isFinite(grid.cellSize) || grid.cellSize <= 0 || !Number.isFinite(grid.gap) || grid.gap < 0) throw Error('Use a valid grid with whole dimensions from 1 to 100.');
    }
    if (!old) throw Error('The selected glyph has no grid.');
    if (!stretch)
    return { ...draft, grid: next }; const ratio = Math.min(next.cols, next.rows) / Math.min(old.cols, old.rows), filled: FilledRegion[] = []; const source = new Map(draft.filled.filter(r => r.col < old.cols && r.row < old.rows).map(r => [`${r.col}:${r.row}:${r.mode ?? 'ink'}`, r])); for (let row = 0; row < next.rows; row++)
    for (let col = 0; col < next.cols; col++)
        for (const mode of ['ink', 'cutout'] as const) {
            const x = Math.min(old.cols - 1, Math.floor((col + .5) * old.cols / next.cols)), y = Math.min(old.rows - 1, Math.floor((row + .5) * old.rows / next.rows)), r = source.get(`${x}:${y}:${mode}`);
            if (r)
                filled.push({ ...r, col, row, key: regionKey(col, row, mode), size: Math.max(.1, Math.min(1000, r.size * ratio)) });
        } return { ...draft, grid: next, filled, brokenJoins: [] }; }
export function randomCells(grid: GridConfig, rng = Math.random) { const cells = new Set<string>(), mode = Math.floor(rng() * 5), add = (x: number, y: number) => { if (x >= 0 && x < grid.cols && y >= 0 && y < grid.rows)
    cells.add(`${x}:${y}`); }, integer = (n: number) => Math.floor(rng() * n); if (mode < 3) {
    const w = mode === 2 ? Math.max(2, integer(grid.cols) + 1) : grid.cols, h = mode === 2 ? Math.max(2, integer(grid.rows) + 1) : grid.rows, left = integer(Math.max(1, grid.cols - w + 1)), top = integer(Math.max(1, grid.rows - h + 1)), density = mode === 1 ? .08 + rng() * .12 : .2 + rng() * .6;
    for (let y = top; y < top + h; y++)
        for (let x = left; x < left + w; x++)
            if (rng() < density)
                add(x, y);
}
else {
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1]];
    for (let s = 0; s < Math.max(3, integer(grid.cols + grid.rows)); s++) {
        let x = integer(grid.cols), y = integer(grid.rows);
        const d = dirs[integer(dirs.length)];
        for (let i = 0; i < 2 + integer(Math.max(grid.cols, grid.rows)); i++) {
            add(x, y);
            const step = mode === 3 ? dirs[integer(4)] : d;
            x += step[0];
            y += step[1];
        }
    }
} for (let y = 0; y < grid.rows && cells.size < Math.min(3, grid.cols * grid.rows); y++)
    for (let x = 0; x < grid.cols && cells.size < Math.min(3, grid.cols * grid.rows); x++)
        add(x, y); return [...cells].map(k => k.split(':').map(Number)); }

export function symbolTime(symbols:CustomSymbol[]){return new Date(Math.max(Date.now(),...symbols.map(s=>Date.parse(s.updatedAt)||0))+1).toISOString()}
