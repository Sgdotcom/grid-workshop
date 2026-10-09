import { useEffect, useMemo, useRef, useState } from 'react';
import type { BrokenJoins } from '@/lib/softness';
import type { FilledRegion, GlyphDraft, GridConfig, HoleMode, ShapeDef } from '@/lib/types';
import type { CustomSymbol, FontDesign } from '@/lib/fontDesign';
import { preparePaintGeometry } from '@/lib/paintGeometry';
import { DEFAULT_SPECIMEN, specimenSvg, type SpecimenGlyph, type SpecimenSettings } from '@/lib/specimen';
import { downloadBlob } from '@/lib/utils';
import { buildSvgMarkup, exportGlyphSet, type ExportPayload } from '@/lib/export';
export interface WordTesterProps {
    strokeActive?: boolean;
    activeChar: string;
    activeFilled: Map<string, FilledRegion>;
    drafts: Map<string, GlyphDraft>;
    grid: GridConfig;
    library: ShapeDef[];
    softness: number;
    cornerRadius: number;
    brokenJoins: BrokenJoins;
    holeMode?: HoleMode;
    fontDesign?: FontDesign;
    customSymbols?: CustomSymbol[];
    value: string;
    onValueChange: (v: string) => void;
    collapsed?: boolean;
    onToggleCollapsed?: () => void;
    onSelectChar: (c: string) => void;
    settings?: SpecimenSettings;
    onSettingsChange?: (s: SpecimenSettings) => void;
}
export function WordTester(p: WordTesterProps) {
    const [fallback, setFallback] = useState(DEFAULT_SPECIMEN), settings = p.settings ?? fallback, setSettings = p.onSettingsChange ?? setFallback, [glyphs, setGlyphs] = useState(new Map<string, SpecimenGlyph>()), [error, setError] = useState('');
    const [exporting,setExporting]=useState(false), exportLock=useRef(false);
    const [fontLink,setFontLink]=useState<{url:string;filename:string}>();
    useEffect(()=>()=>{if(fontLink)URL.revokeObjectURL(fontLink.url)},[fontLink]);
    const active: GlyphDraft = { char: p.activeChar, filled: [...p.activeFilled.values()], grid: p.grid, softness: p.softness, cornerRadius: p.cornerRadius, brokenJoins: [...p.brokenJoins], holeMode: p.holeMode, fontDesign: p.fontDesign };
    const selectedDrafts = new Map(p.drafts);
    selectedDrafts.set(p.activeChar, active);
    const payloads=useMemo<ExportPayload[]>(()=>{
      const store=new Map(p.drafts);
      store.set(p.activeChar,{char:p.activeChar,filled:[...p.activeFilled.values()],grid:p.grid,softness:p.softness,cornerRadius:p.cornerRadius,brokenJoins:[...p.brokenJoins],holeMode:p.holeMode,fontDesign:p.fontDesign});
      return [...store.values()].filter(d=>d.filled.length&&!(p.customSymbols??[]).some(s=>s.char===d.char&&s.deleted)).map(d=>({...d,grid:d.grid??p.grid,library:p.library,filledRegions:d.filled,glyphChar:d.char,softness:d.softness??.55,brokenJoins:new Set(d.brokenJoins)}));
    },[p.drafts,p.activeChar,p.activeFilled,p.grid,p.softness,p.cornerRadius,p.brokenJoins,p.holeMode,p.fontDesign,p.library,p.customSymbols]);
    useEffect(() => { if (p.strokeActive || p.collapsed)
        return; let current = true; void Promise.all(payloads.map(async (d) => [d.glyphChar, { polygons: await preparePaintGeometry(d), grid: d.grid }] as const)).then(entries => { if (current)
        { setGlyphs(new Map(entries)); setError(''); } }).catch(e => { if(current) setError(e instanceof Error ? e.message : String(e)); }); return () => { current = false; }; }, [payloads, p.strokeActive, p.collapsed]);
    const rendered = useMemo(() => specimenSvg(p.value, glyphs, settings), [p.value, glyphs, settings]);
    const run = async (f: () => void | Promise<void>) => { if (exportLock.current || p.strokeActive) return; exportLock.current=true; setExporting(true); try {
        await f();
        setError('');
    }
    catch (e) {
        setError(e instanceof Error ? e.message : String(e));
    } finally { exportLock.current=false; setExporting(false); } };
    const exportFont = async (format: 'otf' | 'woff') => { await Promise.all(payloads.map(preparePaintGeometry)); const { festivalFontFile } = await import('@/lib/fontExport'); const contributions = [...selectedDrafts.values()].filter(d => payloads.some(q => q.glyphChar === d.char)).map(d => ({ id: d.char, createdAt: '', draft: d, svg: '' })); const file=festivalFontFile(contributions,p.library,{fontName:settings.fontName,proportional:settings.proportional,format});setFontLink({url:URL.createObjectURL(file.blob),filename:file.filename});downloadBlob(file.blob,file.filename); };
    return <section data-testid="word-tester" className="font-design-tools"><button data-testid="word-tester-toggle" aria-expanded={!p.collapsed} disabled={!p.onToggleCollapsed} onClick={p.onToggleCollapsed}>Text specimen</button>{!p.collapsed && <><textarea aria-label="Text to test" value={p.value} maxLength={1500} onChange={e => p.onValueChange(e.target.value)} style={{ width: '100%', minHeight: 70 }}/><div className="specimen-controls">{(['size', 'tracking', 'leading'] as const).map(k => <label key={k}>{k}<input aria-label={`Specimen ${k}`} type="number" value={settings[k]} step={k === 'leading' ? .1 : 1} min={k === 'size' ? 12 : k === 'leading' ? .5 : -20} max={k === 'size' ? 500 : k === 'leading' ? 3 : 100} onChange={e => { const n = e.target.valueAsNumber, min = k === 'size' ? 12 : k === 'leading' ? .5 : -20, max = k === 'size' ? 500 : k === 'leading' ? 3 : 100; if (Number.isFinite(n) && n >= min && n <= max)
        setSettings({ ...settings, [k]: n }); }}/></label>)}{(['ink', 'paper'] as const).map(k => <label key={k}>{k}<input type="color" value={settings[k]} onChange={e => setSettings({ ...settings, [k]: e.target.value })}/></label>)}<label><input type="checkbox" checked={settings.proportional} onChange={e => setSettings({ ...settings, proportional: e.target.checked })}/>Proportional spacing</label><label>Font family<input aria-label="Font family" value={settings.fontName} maxLength={60} onChange={e => setSettings({ ...settings, fontName: e.target.value })}/></label></div><div style={{ overflow: 'auto', maxHeight: 300 }}><img alt="Typed font specimen" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(rendered.svg)}`} style={{ maxWidth: 'none' }}/></div><div aria-label="Edit specimen characters">{[...new Set([...p.value])].filter(c => payloads.some(d => d.glyphChar === c)).map(c => <button key={c} aria-label={`Edit ${c}`} aria-pressed={c === p.activeChar} onClick={() => p.onSelectChar(c)}>{c}</button>)}</div>{rendered.unsupported.length > 0 && <p>Not drawn: {rendered.unsupported.join(' ')}</p>}<button disabled={exporting || p.strokeActive} onClick={() => void run(async () => { const entries = await Promise.all(payloads.map(async d => [d.glyphChar, { polygons: await preparePaintGeometry(d), grid: d.grid }] as const)); const fresh=specimenSvg(p.value,new Map(entries),settings); downloadBlob(new Blob([fresh.svg], { type: 'image/svg+xml' }), 'specimen.svg'); })}>Specimen SVG</button><button disabled={exporting || p.strokeActive} onClick={() => void run(async () => { const d = payloads.find(d => d.glyphChar === p.activeChar); if (!d)
        throw Error('Draw a glyph first.'); await preparePaintGeometry(d); downloadBlob(new Blob([buildSvgMarkup(d)], { type: 'image/svg+xml' }), 'glyph.svg'); })}>Glyph SVG</button><button disabled={exporting || p.strokeActive} onClick={() => void run(async () => { await Promise.all(payloads.map(preparePaintGeometry)); exportGlyphSet(payloads); })}>Alphabet SVG</button><button disabled={exporting || p.strokeActive} onClick={() => void run(() => exportFont('otf'))}>Font OTF</button><button disabled={exporting || p.strokeActive} onClick={() => void run(() => exportFont('woff'))}>Font WOFF</button>{(p.customSymbols ?? []).filter(s => !s.deleted).map(s => <button key={s.char} title={`Insert ${s.name}`} disabled={p.value.length + s.char.length > 1500} onClick={() => { if(p.value.length + s.char.length <= 1500) p.onValueChange(p.value + s.char); }}>{s.name}</button>)}{fontLink&&<a href={fontLink.url} download={fontLink.filename}>Save {fontLink.filename}</a>}{exporting && <p role="status">Preparing download…</p>}{error && <p role="alert">{error}</p>}</>}</section>;
}
