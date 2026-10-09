import { useEffect, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_FONT_DESIGN, DIGITS, LETTER_CHARACTERS, PUNCTUATION, type CustomSymbol, type FontDesign } from '@/lib/fontDesign';
import type { GridConfig } from '@/lib/types';
const characterCategory = (char: string) => LETTER_CHARACTERS.includes(char) ? 'letters' : DIGITS.includes(char) ? 'digits' : PUNCTUATION.includes(char) ? 'punctuation' : 'custom';
export function FontDesignTools({ design = DEFAULT_FONT_DESIGN, onDesign, grid, onResize, symbols, onCreate, onRemove, onSelect, onRandom, activeChar, section = 'all', renderCharacter, characterClassName }: {
    section?: 'all' | 'geometry' | 'characters';
    renderCharacter?: (char:string) => ReactNode;
    characterClassName?: (char:string) => string;
    design: FontDesign;
    onDesign: (d: FontDesign) => void;
    grid: GridConfig;
    onResize: (g: GridConfig, stretch: boolean, continuing?: boolean) => void;
    symbols: CustomSymbol[];
    onCreate: (name: string, char: string) => void;
    onRemove: (char: string) => void;
    onSelect: (char: string) => void;
    onRandom: () => void;
    activeChar: string;
}) {
    const [category, setCategory] = useState(() => characterCategory(activeChar)), [name, setName] = useState(''), [character, setCharacter] = useState(''), [error, setError] = useState('');
    useEffect(() => { setCategory(characterCategory(activeChar)); }, [activeChar]);
    const resizeGesture = useRef<string | null>(null);
    const chars = category === 'letters' ? LETTER_CHARACTERS : category === 'digits' ? DIGITS : category === 'punctuation' ? PUNCTUATION : symbols.filter(s => !s.deleted).map(s => s.char);
    const run = (f: () => void) => { try {
        f();
        setError('');
    }
    catch (e) {
        setError(String(e instanceof Error ? e.message : e));
    } };
    return <section className="font-design-tools" aria-label={section === 'characters' ? 'Character controls' : 'Font design'}>{section !== 'characters' && <><h3 className="font-design-heading">Font design</h3><fieldset><legend>Joins</legend>{(['mergeHorizontal', 'mergeVertical', 'mergeDiagonal'] as const).map((key, i) => <label key={key}><input type="checkbox" checked={design[key]} onChange={e => onDesign({ ...design, [key]: e.target.checked })}/>{['Horizontal', 'Vertical', 'Diagonal'][i]}</label>)}</fieldset>
 <label>Outline thickness · px<input aria-label="Outline thickness slider" type="range" min="0" max="40" step=".5" value={Math.min(40, design.thickness)} onChange={e => onDesign({ ...design, thickness: Number(e.target.value) })}/><input aria-label="Outline thickness" type="number" min="0" max="1000" step=".5" value={design.thickness} onChange={e => { const n = e.target.valueAsNumber; if (Number.isFinite(n) && n >= 0 && n <= 1000) {
        onDesign({ ...design, thickness: n });
        setError('');
    }
    else
        setError('Enter a thickness from 0 to 1000 px.'); }}/></label><label><input type="checkbox" checked={design.outlineOnly} onChange={e => onDesign({ ...design, outlineOnly: e.target.checked })}/>Outline only</label>
 <fieldset><legend>Grid · {grid.cols} × {grid.rows}</legend>{(['cols', 'rows'] as const).map(k => <label key={k}>{k === 'cols' ? 'Columns' : 'Rows'} · {grid[k]}<input aria-label={`Resize ${k}`} type="range" min="1" max="100" step="1" value={grid[k]} onPointerDown={() => {resizeGesture.current=null}} onPointerUp={() => {resizeGesture.current=null}} onPointerCancel={() => {resizeGesture.current=null}} onKeyUp={() => {resizeGesture.current=null}} onBlur={() => {resizeGesture.current=null}} onChange={e => run(() => {const n=Number(e.target.value); if(n===grid[k])return; const identity = `${activeChar}:${k}`; onResize({...grid,[k]:n},true,resizeGesture.current === identity); resizeGesture.current=identity;})}/></label>)}</fieldset>
 </>}{section !== 'geometry' && <><label>Characters<select aria-label="Character category" value={category} onChange={e => setCategory(e.target.value)}>{['letters', 'digits', 'punctuation', 'custom'].map(c => <option key={c}>{c}</option>)}</select></label><div className="font-character-picker">{chars.map(c => <button key={c} className={characterClassName?.(c)} data-testid={renderCharacter ? `studio-glyph-${c}` : undefined} aria-pressed={activeChar === c} title={symbols.find(s => s.char === c)?.name ?? c} onClick={() => onSelect(c)}>{renderCharacter ? renderCharacter(c) : c}</button>)}</div>
 <label>Symbol name<input value={name} maxLength={40} onChange={e => setName(e.target.value)}/></label><label>Unicode character (optional)<input value={character} onChange={e => setCharacter(e.target.value)}/></label><button onClick={() => run(() => { onCreate(name, character); setCategory('custom'); setName(''); setCharacter(''); })}>Add symbol</button><button onClick={() => run(() => { onRandom(); setCategory('custom'); })}>Random symbol</button>{symbols.some(s => s.char === activeChar && !s.deleted) && <button onClick={() => onRemove(activeChar)}>Remove symbol</button>}</>}{error && <p role="alert">{error}</p>}</section>;
}
