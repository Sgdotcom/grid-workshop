/** Live lattice preview while configuring the grid on Shape. */
import { canvasPixelSize, cellOrigin, formatPx } from '@/lib/gridGeometry'
import type { GridConfig } from '@/lib/types'

export function GridPreview({ grid }: { grid: GridConfig }) {
  const { width, height } = canvasPixelSize(grid)
  return (
    <div
      data-testid="grid-preview"
      className="mb-3 overflow-hidden rounded-[3px] border border-ink/15 bg-paper-deep"
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mx-auto block max-h-[160px] w-full lg:max-h-[280px]"
        aria-label="Grid preview"
      >
        <rect width={width} height={height} fill="#ffffff" />
        {Array.from({ length: grid.rows }, (_, row) =>
          Array.from({ length: grid.cols }, (_, col) => {
            const { x, y } = cellOrigin(col, row, grid)
            return (
              <rect
                key={`${col}-${row}`}
                x={x}
                y={y}
                width={grid.cellSize}
                height={grid.cellSize}
                fill="none"
                stroke="#000000"
                strokeWidth={Math.max(0.35, Math.min(0.8, grid.cellSize * 0.02))}
              />
            )
          }),
        )}
      </svg>
      <p className="border-t border-line/60 px-3 py-1.5 text-center font-mono text-[10px] text-ink-muted">
        {grid.cols}×{grid.rows} · {formatPx(grid.cellSize)}px cells · gap {formatPx(grid.gap)}px
      </p>
    </div>
  )
}
