import { type GlyphDraft, type GridConfig, type ShapeDef, reconcileLibrary } from './types'

export const FESTIVAL_KEY = 'grid-workshop-festival-v1'
export const ALPHABET = 'abcdefghijklmnopqrstuvwxyzåäö'.split('')

export interface Contribution {
  id: string
  createdAt: string
  draft: GlyphDraft
  svg: string
}

export interface FestivalSession {
  version: 1
  updatedAt: string
  active: GlyphDraft
  drafts: GlyphDraft[]
  contributions: Contribution[]
  library: ShapeDef[]
  liveSvg: string
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
  return typeof draft.char === 'string' && draft.char.length === 1 &&
    ALPHABET.includes(draft.char.toLowerCase()) && isGrid(draft.grid) &&
    typeof draft.softness === 'number' && draft.softness >= 0 && draft.softness <= 1 &&
    typeof draft.cornerRadius === 'number' && draft.cornerRadius >= 0 && draft.cornerRadius <= 500 &&
    Array.isArray(draft.brokenJoins) && draft.brokenJoins.every(join => typeof join === 'string') &&
    Array.isArray(draft.filled) && draft.filled.length <= 10000 && draft.filled.every(region =>
      region && typeof region.key === 'string' && typeof region.shapeId === 'string' &&
      Number.isInteger(region.col) && region.col >= 0 && region.col < draft.grid!.cols &&
      Number.isInteger(region.row) && region.row >= 0 && region.row < draft.grid!.rows &&
      Number.isFinite(region.size) && region.size > 0 && region.size <= 1000)
}

export function parseSession(raw: string): FestivalSession {
  const session = JSON.parse(raw) as FestivalSession
  if (session.version !== 1 || !isDraft(session.active) ||
    !Array.isArray(session.drafts) || !session.drafts.every(isDraft) ||
    !Array.isArray(session.library) || !session.library.length ||
    !session.library.every(shape => shape && typeof shape.id === 'string' &&
      typeof shape.label === 'string' && ['preset', 'polygon', 'star'].includes(shape.kind)) ||
    !Array.isArray(session.contributions) || !session.contributions.every(contribution =>
      contribution && typeof contribution.id === 'string' && typeof contribution.createdAt === 'string' &&
      typeof contribution.svg === 'string' && isDraft(contribution.draft)) ||
    typeof session.liveSvg !== 'string') {
    throw new Error('This file is not a supported workshop backup.')
  }
  session.library = reconcileLibrary(session.library)
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
