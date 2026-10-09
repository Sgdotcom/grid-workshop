import { DEFAULT_SPECIMEN, validateSpecimen, type SpecimenSettings } from './specimen'
import { DEFAULT_FONT_DESIGN, DIGITS, PUNCTUATION, validCharacter, STANDARD_CHARACTERS, type CustomSymbol } from './fontDesign'
import { type GlyphDraft, type GridConfig, type ShapeDef, reconcileLibrary, PRESET_SHAPES } from './types'

export const FESTIVAL_KEY = 'grid-workshop-festival-v1'
export const ALPHABET = 'abcdefghijklmnopqrstuvwxyzåäö'.split('')

/** Next untouched letter, wrapping once and preserving upper/lowercase choice. */
export function nextEmptyLetter(current: string, upper: boolean, contributions: Contribution[], drafts: Iterable<GlyphDraft>, symbols:CustomSymbol[]=[]): string | undefined {
  const occupied = new Set(contributions.map(c => c.draft.char))
  for (const draft of drafts) if (draft.filled.length) occupied.add(draft.char)
  const category = DIGITS.includes(current) ? DIGITS : PUNCTUATION.includes(current) ? PUNCTUATION : symbols.some(s=>s.char===current) ? symbols.filter(s=>!s.deleted).map(s=>s.char) : ALPHABET
  const index = category.indexOf(category===ALPHABET?current.toLowerCase():current)
  for (let offset = 1; offset < category.length; offset++) {
    const base = category[(Math.max(index, 0) + offset) % category.length]
    if (!occupied.has(upper && category === ALPHABET ? base.toUpperCase() : base)) return base
  }
}

export interface Contribution {
  id: string
  createdAt: string
  draft: GlyphDraft
  svg: string
}

export interface FestivalSession {
  version: 1 | 2
  specimen?:SpecimenSettings
  specimenText?:string
  customSymbols?: CustomSymbol[]
  /** Room / document wall-clock — not used as a per-letter freshness clock. */
  updatedAt: string
  active: GlyphDraft
  drafts: GlyphDraft[]
  contributions: Contribution[]
  library: ShapeDef[]
  liveSvg: string
  /** Per-letter freshness (ISO). Source of truth for live LWW; mirrors room.draftUpdatedAt. */
  draftUpdatedAt?: Record<string, string>
}

function isGrid(value: unknown): value is GridConfig {
  if (!value || typeof value !== 'object') return false
  const grid = value as GridConfig
  return Number.isInteger(grid.cols) && grid.cols >= 1 && grid.cols <= 100 &&
    Number.isInteger(grid.rows) && grid.rows >= 1 && grid.rows <= 100 &&
    Number.isFinite(grid.cellSize) && grid.cellSize > 0 && grid.cellSize <= 500 &&
    Number.isFinite(grid.gap) && grid.gap > -grid.cellSize && grid.gap <= 100
}

function isDraft(value: unknown): value is GlyphDraft {
  if (!value || typeof value !== 'object') return false
  const draft = value as GlyphDraft
  return validCharacter(draft.char) && isGrid(draft.grid) &&
    typeof draft.softness === 'number' && draft.softness >= 0 && draft.softness <= 1 &&
    typeof draft.cornerRadius === 'number' && draft.cornerRadius >= 0 && draft.cornerRadius <= 500 &&
    (draft.holeMode === undefined || ['open', 'no-gaps', 'solid'].includes(draft.holeMode)) &&
    Array.isArray(draft.brokenJoins) && draft.brokenJoins.length <= 40000 && draft.brokenJoins.every(join => typeof join === 'string' && join.length <= 256) &&
    Array.isArray(draft.filled) && draft.filled.length <= 10000 && draft.filled.every(region =>
      region && typeof region.key === 'string' && region.key.length <= 256 && typeof region.shapeId === 'string' && region.shapeId.length <= 256 &&
      Number.isInteger(region.col) && region.col >= 0 && region.col < 100 &&
      Number.isInteger(region.row) && region.row >= 0 && region.row < 100 &&
      Number.isFinite(region.size) && region.size > 0 && region.size <= 1000 &&
      (region.rotation===undefined||Number.isFinite(region.rotation)) &&
      (region.mode===undefined||['ink','cutout'].includes(region.mode)) && region.layer==='a')
}

export function parseSession(raw: string): FestivalSession {
  if(raw.length>20_000_000)throw Error('Project exceeds the 20 MB safety limit.')
  const session = JSON.parse(raw) as FestivalSession
  if (!session || typeof session!=='object' || ![1,2].includes(session.version) || !isDraft(session.active) ||
    !Array.isArray(session.drafts) || session.drafts.length>512 || !session.drafts.every(isDraft) ||
    !Array.isArray(session.library) || !session.library.length || session.library.length>256 ||
    !session.library.every(shape => shape && typeof shape.id === 'string' &&
      typeof shape.label === 'string' && ['preset', 'polygon', 'star'].includes(shape.kind)) ||
    !Array.isArray(session.contributions) || session.contributions.length>10000 || !session.contributions.every(contribution =>
      contribution && typeof contribution.id === 'string' && typeof contribution.createdAt === 'string' &&
      typeof contribution.svg === 'string' && isDraft(contribution.draft)) ||
    typeof session.liveSvg !== 'string') {
    throw new Error('This file is not a supported workshop backup.')
  }
  session.specimen=validateSpecimen(session.specimen??DEFAULT_SPECIMEN)
  if(session.specimenText!==undefined&&(typeof session.specimenText!=='string'||session.specimenText.length>1500))throw Error('Invalid specimen text.')
  for(const shape of session.library){
    if(shape.kind==='preset'&&!PRESET_SHAPES.some(s=>s.kind==='preset'&&s.preset===shape.preset))throw Error('Unknown preset shape.')
    if(shape.kind==='polygon'&&(!Number.isInteger(shape.sides)||shape.sides<3||shape.sides>64))throw Error('Invalid polygon shape.')
    if(shape.kind==='star'&&(!Number.isInteger(shape.points)||shape.points<3||shape.points>64||!Number.isFinite(shape.innerRatio)||shape.innerRatio<=0||shape.innerRatio>=1))throw Error('Invalid star shape.')
    if(shape.kind!=='preset'&&(!Number.isFinite(shape.cornerRadius)||shape.cornerRadius<0||shape.cornerRadius>500))throw Error('Invalid shape roundness.')
  }
  session.customSymbols ??= []
  if(!Array.isArray(session.customSymbols)||session.customSymbols.length>512||session.customSymbols.some(s=>!s||typeof s!=='object'||!validCharacter(s.char)||STANDARD_CHARACTERS.includes(s.char)||typeof s.name!=='string'||!s.name.trim()||s.name.length>40||typeof s.updatedAt!=='string'||!Number.isFinite(Date.parse(s.updatedAt))||(s.deleted!==undefined&&typeof s.deleted!=='boolean')))throw Error('Invalid custom symbols.')
  if(new Set(session.customSymbols.map(s=>s.char)).size!==session.customSymbols.length||session.customSymbols.filter(s=>!s.deleted).length>256)throw Error('Duplicate or excessive custom symbols.')
  for(const draft of [session.active,...session.drafts,...session.contributions.map(c=>c.draft)]){
    if(draft.fontDesign!==undefined&&(!draft.fontDesign||typeof draft.fontDesign!=='object'||Array.isArray(draft.fontDesign)))throw Error('Invalid font design settings.')
    const d={...DEFAULT_FONT_DESIGN,...draft.fontDesign}
    if(!Number.isFinite(d.thickness)||d.thickness<0||d.thickness>1000||['outlineOnly','mergeHorizontal','mergeVertical','mergeDiagonal'].some(k=>typeof d[k as keyof typeof d]!=='boolean'))throw Error('Invalid font design settings.')
    draft.fontDesign=d
  }
  session.version=2
  session.library = reconcileLibrary(session.library)
  // Optional per-letter clocks — ignore junk from older backups.
  if (session.draftUpdatedAt && typeof session.draftUpdatedAt === 'object') {
    const clean: Record<string, string> = {}
    for (const [ch, at] of Object.entries(session.draftUpdatedAt)) {
      if (validCharacter(ch) && typeof at === 'string' && Number.isFinite(Date.parse(at))) clean[ch] = new Date(at).toISOString()
    }
    session.draftUpdatedAt = clean
  } else {
    delete session.draftUpdatedAt
  }
  return session
}

export function readSession(): FestivalSession | null {
  const raw = localStorage.getItem(FESTIVAL_KEY)
  return raw ? parseSession(raw) : null
}

export function latestContributions(contributions: Contribution[]) {
  return new Map(contributions.map(contribution => [contribution.draft.char, contribution]))
}

export function svgImage(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
