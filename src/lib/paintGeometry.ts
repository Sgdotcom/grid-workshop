import { useEffect, useState } from 'react'
import type { Polygon } from 'polygon-clipping'
import { stampsFromFills, geometryPreferences, glyphGeometryKey, rememberGlyphGeometry, type ExportPayload } from './export'
import { finishCacheKey, rememberSoftnessFinish } from './softness'
import { stepSize } from './gridGeometry'
import { multiPolygonToPathList } from './polyBool'

let worker: Worker | undefined
let nextId = 0
const pending = new Map<number, { resolve: (value: Polygon[]) => void; reject: (error: Error) => void; finishKey: string; glyphKey: string }>()
const requests = new Map<string, Promise<Polygon[]>>()
const preferences = geometryPreferences
const requestKey = glyphGeometryKey
export function preparePaintGeometry(payload: ExportPayload): Promise<Polygon[]> {
  const storage = preferences(), key = requestKey(payload, storage)
  const previous = requests.get(key)
  if (previous) return previous.then(polygons => { rememberGlyphGeometry(key, polygons); return polygons })
  if (!worker) {
    worker = new Worker(new URL('./paintGeometry.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<{ id: number; finish: Polygon[]; polygons: Polygon[]; error?: string }>) => {
      const job = pending.get(event.data.id)
      if (!job) return
      pending.delete(event.data.id)
      if (event.data.error) job.reject(new Error(event.data.error))
      else { rememberSoftnessFinish(job.finishKey, event.data.finish); rememberGlyphGeometry(job.glyphKey, event.data.polygons); job.resolve(event.data.polygons) }
    }
    worker.onerror = () => {
      for (const job of pending.values()) job.reject(new Error('Paint geometry worker failed'))
      pending.clear(); requests.clear(); worker?.terminate(); worker = undefined
    }
  }
  const stamps = stampsFromFills(payload.filledRegions.filter(r => r.mode !== 'cutout' && r.col<payload.grid.cols && r.row<payload.grid.rows), payload.grid, payload.library, payload.cornerRadius)
  const finishKey = finishCacheKey(stamps, payload.softness, payload.brokenJoins, payload.holeMode ?? 'open', stepSize(payload.grid) ** 2 * 0.6)
  const id = ++nextId
  const promise = new Promise<Polygon[]>((resolve, reject) => {
    pending.set(id, { resolve, reject, finishKey, glyphKey: key })
    worker!.postMessage({ id, payload, storage })
  })
  requests.set(key, promise)
  if (requests.size > 512) requests.delete(requests.keys().next().value!)
  void promise.catch(() => { if (requests.get(key) === promise) requests.delete(key) })
  return promise
}

export function usePaintGeometry(payload: ExportPayload, revision: number, enabled = true) {
  const key = requestKey(payload, preferences()) + revision
  const [result, setResult] = useState<{ key: string; paths: string[] }>()
  useEffect(() => {
    if (!enabled) return
    let current = true
    void preparePaintGeometry(payload).then(polygons => {
      if (current) setResult({ key, paths: multiPolygonToPathList(polygons) })
    }).catch(error => { console.error('Paint finish failed; retaining crisp stamps.', error) })
    return () => { current = false }
  // The key includes every geometry input and the captured join preferences.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled])
  return result?.key === key ? result.paths : []
}
