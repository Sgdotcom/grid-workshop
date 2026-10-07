/** Archived Softness helpers — not used by the live app. */

/** Edge key for neighbor pair (order-independent). */
export function softEdgeKey(c1: number, r1: number, c2: number, r2: number) {
  if (c1 < c2 || (c1 === c2 && r1 < r2)) return `${c1}:${r1}|${c2}:${r2}`
  return `${c2}:${r2}|${c1}:${r1}`
}

/** @deprecated */
export function softnessMergePaths(stamps: SoftStamp[], softness: number): string[] {
  return softnessFinishPathList(stamps, softness)
}
