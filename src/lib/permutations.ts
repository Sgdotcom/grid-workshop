import type { FilledRegion } from '@/lib/types'

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
