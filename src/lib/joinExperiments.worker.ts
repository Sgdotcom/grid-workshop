import { compareJoin, JOIN_CASES, JOIN_METHODS, type ExperimentSettings } from './joinExperiments'
import type { ShapeDef } from './types'

self.onmessage = (event: MessageEvent<{ shape: ShapeDef; settings: ExperimentSettings }>) => {
  const { shape, settings } = event.data
  const results = JOIN_CASES.map(test => JOIN_METHODS.map(method => {
    try { return { ...compareJoin(shape, test.cells, settings, method.id), error: '' } }
    catch (error) { return { paths: [], outlines: [], error: error instanceof Error ? error.message : 'Could not render this candidate.' } }
  }))
  self.postMessage(results)
}
