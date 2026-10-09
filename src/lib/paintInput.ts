export interface PaintCell { col: number; row: number }

/** Bresenham cells after the start, inclusive of the end. */
export function strokeCells(from: PaintCell, to: PaintCell): PaintCell[] {
  const cells: PaintCell[] = []
  let col = from.col, row = from.row
  const dc = Math.abs(to.col - col), dr = Math.abs(to.row - row)
  const sc = col < to.col ? 1 : -1, sr = row < to.row ? 1 : -1
  let err = dc - dr
  const limit = Math.max(dc, dr)
  for (let i = 0; i < limit; i++) {
    const e2 = err * 2
    if (e2 > -dr) { err -= dr; col += sc }
    if (e2 < dc) { err += dc; row += sr }
    cells.push({ col, row })
  }
  return cells
}
