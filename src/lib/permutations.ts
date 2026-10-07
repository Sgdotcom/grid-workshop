import type { FilledRegion } from '@/lib/types'

/**
 * MuirMcNeil "TwoPoint" and Ran Zheng parametric grid permutations.
 * Transform a filled glyph draft through systematic raster rules.
 */

/** Drops alternate rows to create horizontal scanlines (Pin 13 Style B). */
export function applyScanlineDrop(
  filled: Map<string, FilledRegion>,
  keepEven = true,
): Map<string, FilledRegion> {
  const next = new Map<string, FilledRegion>()
  for (const [key, region] of filled) {
    if ((region.row % 2 === 0) === keepEven) {
      next.set(key, { ...region })
    }
  }
  return next
}

/** Drops alternate columns to create vertical slit/barcode effects (Pin 13 Style C). */
export function applyColumnDrop(
  filled: Map<string, FilledRegion>,
  keepEven = true,
): Map<string, FilledRegion> {
  const next = new Map<string, FilledRegion>()
  for (const [key, region] of filled) {
    if ((region.col % 2 === 0) === keepEven) {
      next.set(key, { ...region })
    }
  }
  return next
}

/** Drops alternating diagonal cells to create a checkerboard/halftone stipple (Pin 13 Style D). */
export function applyCheckerboardDrop(
  filled: Map<string, FilledRegion>,
  keepEven = true,
): Map<string, FilledRegion> {
  const next = new Map<string, FilledRegion>()
  for (const [key, region] of filled) {
    const isEven = (region.col + region.row) % 2 === 0
    if (isEven === keepEven) {
      next.set(key, { ...region })
    }
  }
  return next
}

/**
 * Dot Dilation: scales the module size across all filled cells without
 * changing the underlying grid coordinate pitch (Pin 13 dot weight dilation).
 */
export function applyDotDilation(
  filled: Map<string, FilledRegion>,
  multiplier: number,
  minSize = 6,
  maxSize = 120,
): Map<string, FilledRegion> {
  const next = new Map<string, FilledRegion>()
  for (const [key, region] of filled) {
    const clampedSize = Math.max(minSize, Math.min(maxSize, Math.round(region.size * multiplier)))
    next.set(key, { ...region, size: clampedSize })
  }
  return next
}

/** Subtle random glitch / dither drop (Pins 08, 10). */
export function applyGlitchDither(
  filled: Map<string, FilledRegion>,
  dropChance = 0.2,
): Map<string, FilledRegion> {
  const next = new Map<string, FilledRegion>()
  for (const [key, region] of filled) {
    if (Math.random() >= dropChance) {
      next.set(key, { ...region })
    }
  }
  return next
}
