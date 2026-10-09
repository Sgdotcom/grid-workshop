import { glyphPolygons, stampsFromFills, type ExportPayload } from './export'
import { softnessFinishPolygons } from './softness'
import { stepSize } from './gridGeometry'

let storage: Record<string, string | null> = {}
// The registry's browser preferences are captured per job; a worker has no DOM storage.
Object.defineProperty(globalThis, 'window', { value: { localStorage: { getItem: (key: string) => storage[key] ?? null } } })
self.onmessage = (event: MessageEvent<{ id: number; payload: ExportPayload; storage: Record<string, string | null> }>) => {
  const { id, payload } = event.data
  storage = event.data.storage
  try {
    const stamps = stampsFromFills(payload.filledRegions.filter(r => r.mode !== 'cutout' && r.col<payload.grid.cols && r.row<payload.grid.rows), payload.grid, payload.library, payload.cornerRadius)
    const finish = softnessFinishPolygons(stamps, { softness: payload.softness, brokenJoins: payload.brokenJoins, holeMode: payload.holeMode, maxGapArea: stepSize(payload.grid) ** 2 * 0.6 })
    self.postMessage({ id, finish, polygons: glyphPolygons(payload) })
  } catch (error) {
    self.postMessage({ id, error: String(error) })
  }
}
