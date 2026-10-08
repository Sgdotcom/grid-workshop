import { useEffect, useState, useRef } from 'react'
import { PRESET_SHAPES, type PresetShapeId, type ShapeDef } from '@/lib/types'
import { moduleShapeFillRule, moduleShapePath, shapeSupportsRounding } from '@/lib/shapes'
import { JOIN_CASES, JOIN_METHODS, type ExperimentSettings, type JoinMethod } from '@/lib/joinExperiments'
import {
  DEFAULT_SHAPE_METHODS,
  getJoinEngineMode,
  isShapeLockedMetaball,
  loadShapePreferences,
  saveShapePreferences,
  setJoinEngineMode,
  setShapeDirectionMethod,
  setShapePrimaryMethod,
  type JoinEngineMode,
} from '@/lib/shapeJoinRegistry'
import { downloadBlob } from '@/lib/utils'

interface Choice { shape: string; direction: string; method: JoinMethod; settings: ExperimentSettings }
const CHOICES_KEY = 'grid-workshop-join-review-v1'

function getPreset(def: ShapeDef): PresetShapeId {
  return def.kind === 'preset' ? def.preset : 'square'
}

export function JoinLab() {
  const [shapeId, setShapeId] = useState('preset-square')
  const [settings, setSettings] = useState<ExperimentSettings>({ size: 42, softness: 0.55, roundedness: 8, radius: 1, neck: 1 })
  const [settled, setSettled] = useState(settings)
  const [results, setResults] = useState<{ paths: string[]; outlines: string[]; error: string }[][]>([])
  const [rendered, setRendered] = useState<{ shapeId: string; settings: ExperimentSettings } | null>(null)
  const [renderError, setRenderError] = useState('')
  const [outlines, setOutlines] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [engineMode, setEngineMode] = useState<JoinEngineMode>(() => getJoinEngineMode())
  const [choices, setChoices] = useState<Record<string, Choice>>(() => {
    try { return JSON.parse(localStorage.getItem(CHOICES_KEY) ?? '{}') } catch { return {} }
  })
  const [status, setStatus] = useState(() =>
    getJoinEngineMode() === 'main'
      ? '★ Main Engine active: Optimal per-shape fusion is running.'
      : getJoinEngineMode() === 'fork-weld'
      ? '⑂ Fork: Pure Weld (Method B across all shapes) is running.'
      : '⑂ Fork: Legacy Workshop (Method A) is running.'
  )

  const shape = PRESET_SHAPES.find(candidate => candidate.id === shapeId)!
  const presetKey = getPreset(shape)
  const isLocked = isShapeLockedMetaball(presetKey)

  // Determine current active method for this shape (or common method if all directions match)
  const getPrimaryMethod = (targetId: string, targetPreset: PresetShapeId): JoinMethod => {
    if (isShapeLockedMetaball(targetPreset)) return 'metaball'
    const directionMethods = JOIN_CASES.map(jc => choices[`${targetId}:${jc.id}`]?.method)
    const first = directionMethods[0]
    if (first && directionMethods.every(m => m === first)) return first
    const prefs = loadShapePreferences()
    return prefs[targetPreset]?.defaultMethod ?? DEFAULT_SHAPE_METHODS[targetPreset] ?? 'current'
  }

  const currentShapePrimaryMethod = getPrimaryMethod(shape.id, presetKey)

  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(settings), 120)
    return () => window.clearTimeout(timer)
  }, [settings])

  useEffect(() => {
    const worker = new Worker(new URL('../lib/joinExperiments.worker.ts', import.meta.url), { type: 'module' })
    setRenderError('')
    worker.onmessage = event => {
      setResults(event.data)
      setRendered({ shapeId: shape.id, settings: settled })
    }
    worker.onerror = () => setRenderError('The comparison could not be calculated. Change a setting to retry.')
    worker.postMessage({ shape, settings: settled })
    return () => worker.terminate()
  }, [shape, settled])

  const pending = rendered?.shapeId !== shape.id || rendered?.settings !== settings

  // 1-Click: Assign a method to all directions for the current shape
  const assignShapeMethod = (method: JoinMethod) => {
    if (isLocked) return
    setShapePrimaryMethod(presetKey, method)

    const updated = { ...choices }
    for (const jc of JOIN_CASES) {
      updated[`${shape.id}:${jc.id}`] = {
        shape: shape.id,
        direction: jc.id,
        method,
        settings: { ...settled },
      }
    }
    setChoices(updated)
    try {
      localStorage.setItem(CHOICES_KEY, JSON.stringify(updated))
      const methodLabel = JOIN_METHODS.find(m => m.id === method)?.label ?? method
      setStatus(`Assigned ${methodLabel} to all directions for ${shape.label}.`)
    } catch {
      setStatus('Could not save locally. Download your choices before closing.')
    }
  }

  // Fine-tune a single direction
  const chooseDirection = (direction: string, method: JoinMethod) => {
    if (isLocked) return
    const next = { ...choices, [`${shapeId}:${direction}`]: { shape: shapeId, direction, method, settings: { ...settled } } }
    setChoices(next)
    setShapeDirectionMethod(presetKey, direction, method)
    try {
      localStorage.setItem(CHOICES_KEY, JSON.stringify(next))
      setStatus(`Saved ${method.toUpperCase()} for ${shape.label} (${direction}).`)
    } catch {
      setStatus('Could not save locally. Download your choices before closing.')
    }
  }

  // Load recommended strategy across all shapes
  const loadRecommendedStrategy = () => {
    const updated = { ...choices }
    for (const s of PRESET_SHAPES) {
      const p = getPreset(s)
      if (isShapeLockedMetaball(p)) continue
      const method = DEFAULT_SHAPE_METHODS[p] ?? 'current'
      setShapePrimaryMethod(p, method)
      for (const jc of JOIN_CASES) {
        updated[`${s.id}:${jc.id}`] = {
          shape: s.id,
          direction: jc.id,
          method,
          settings: { ...settled },
        }
      }
    }
    setChoices(updated)
    try {
      localStorage.setItem(CHOICES_KEY, JSON.stringify(updated))
      setStatus('Loaded recommended weld/melt methods for all shapes.')
    } catch {}
  }

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const json = JSON.parse(e.target?.result as string)
        if (json.choices) {
          setChoices(json.choices)
          localStorage.setItem(CHOICES_KEY, JSON.stringify(json.choices))
          setStatus('Choices imported successfully.')
        }
      } catch {
        setStatus('Failed to parse uploaded JSON file.')
      }
    }
    reader.readAsText(file)
  }

  const resetAll = () => {
    if (confirm('Reset all shape join choices to defaults?')) {
      setChoices({})
      saveShapePreferences({})
      try { localStorage.removeItem(CHOICES_KEY) } catch {}
      setStatus('Reset all shape choices to defaults.')
    }
  }

  return (
    <main className="join-lab">
      <header>
        <div>
          <p>SHAPE REVIEW · WELD & MELT STUDIO</p>
          <h1>Choose the Best Method for Each Shape</h1>
          <p>Circles and rings use metaball welding. Pick the best weld or melt method for all other shapes.</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
          <a href="?view=workshop">Back to workshop ↗</a>
          <div style={{ display: 'flex', gap: 6, background: '#f1f5f9', padding: '3px 4px', borderRadius: 8, border: '1px solid #cbd5e1' }}>
            <button
              style={{
                padding: '4px 10px',
                fontSize: 11,
                fontWeight: engineMode === 'main' ? 700 : 500,
                background: engineMode === 'main' ? '#0000ee' : 'transparent',
                color: engineMode === 'main' ? '#ffffff' : '#334155',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
              }}
              onClick={() => {
                setEngineMode('main')
                setJoinEngineMode('main')
                setStatus('★ Main Engine active: Optimal per-shape joins.')
              }}
            >
              ★ Main (Optimal)
            </button>
            <button
              style={{
                padding: '4px 10px',
                fontSize: 11,
                fontWeight: engineMode === 'fork-weld' ? 700 : 500,
                background: engineMode === 'fork-weld' ? '#0000ee' : 'transparent',
                color: engineMode === 'fork-weld' ? '#ffffff' : '#334155',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
              }}
              onClick={() => {
                setEngineMode('fork-weld')
                setJoinEngineMode('fork-weld')
                setStatus('⑂ Fork: Pure Weld (Method B across all shapes) active.')
              }}
            >
              ⑂ Fork: Pure Weld (B)
            </button>
            <button
              style={{
                padding: '4px 10px',
                fontSize: 11,
                fontWeight: engineMode === 'fork-current' ? 700 : 500,
                background: engineMode === 'fork-current' ? '#0000ee' : 'transparent',
                color: engineMode === 'fork-current' ? '#ffffff' : '#334155',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
              }}
              onClick={() => {
                setEngineMode('fork-current')
                setJoinEngineMode('fork-current')
                setStatus('⑂ Fork: Legacy Workshop (Method A) active.')
              }}
            >
              ⑂ Fork: Legacy (A)
            </button>
          </div>
        </div>
      </header>

      {/* Notice Banner */}
      <div className="join-lab-banner">
        <span>
          <strong>Metaball Welding:</strong> Circles and rings are locked to standard metaball melting. Use this studio to choose and test methods for the other {PRESET_SHAPES.length - 2} shapes.
        </span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <a
            href="/docs/all-shapes-softness-lab.html"
            target="_blank"
            rel="noreferrer"
            style={{
              padding: '4px 10px',
              fontSize: 12,
              fontWeight: 600,
              border: '1px solid #6366f1',
              borderRadius: 4,
              background: '#e0e7ff',
              color: '#3730a3',
              textDecoration: 'none',
              cursor: 'pointer',
            }}
          >
            ▦ View All 16 Shapes Across Softness ↗
          </a>
          <button
            onClick={loadRecommendedStrategy}
            style={{ padding: '4px 10px', fontSize: 12, border: '1px solid #0000ee', borderRadius: 4, background: '#fff', cursor: 'pointer' }}
          >
            Load Recommended Strategy
          </button>
        </div>
      </div>

      {/* Quick Shape Navigation Bar (Pills with SVG Icons) */}
      <div className="join-shape-pills">
        {PRESET_SHAPES.map(preset => {
          const p = getPreset(preset)
          const locked = isShapeLockedMetaball(p)
          const active = preset.id === shapeId
          const primary = getPrimaryMethod(preset.id, p)
          const iconPath = moduleShapePath(preset, 0, 0, 16, 0)
          const fillRule = moduleShapeFillRule(preset)

          return (
            <button
              key={preset.id}
              className={`join-shape-pill ${active ? 'active' : ''} ${locked ? 'locked' : ''}`}
              onClick={() => setShapeId(preset.id)}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
                <path d={iconPath} fill="currentColor" fillRule={fillRule} />
              </svg>
              <span>{preset.label}</span>
              <span className="method-badge">
                {locked ? '🔒 Metaball' : primary.toUpperCase()}
              </span>
            </button>
          )
        })}
      </div>

      {/* Primary Method Quick-Assign Bar (One-Click Selection for Active Shape) */}
      <div className="join-primary-bar">
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 'bold', margin: 0 }}>
            {shape.label} · Join Strategy
          </h2>
          <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 0 0' }}>
            {isLocked
              ? 'Circles and rings are fixed to metaball welding.'
              : 'Click once to assign this method to all directions, or fine-tune individual directions below.'}
          </p>
        </div>

        {!isLocked && (
          <div className="method-button-group">
            {JOIN_METHODS.map(method => {
              const isSelected = currentShapePrimaryMethod === method.id
              return (
                <button
                  key={method.id}
                  className={`method-btn ${isSelected ? 'active' : ''}`}
                  onClick={() => assignShapeMethod(method.id)}
                >
                  {method.label}
                  {isSelected && ' ✓'}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Controls Bar */}
      <div className="join-lab-controls">
        {([
          ['size', 'Stamp size', 24, 64, 1],
          ['softness', 'Softness', 0, 1, 0.05],
          ['roundedness', 'Roundedness', 0, 18, 1],
          ['radius', 'C · Circle size', 0.6, 1.3, 0.05],
          ['neck', 'C · Neck strength', 0.6, 1.6, 0.05],
        ] as const).map(([key, label, min, max, step]) => (
          <label key={key}>
            {label} · {settings[key]}
            <input
              aria-label={label}
              type="range"
              min={min}
              max={max}
              step={step}
              disabled={key === 'roundedness' && !shapeSupportsRounding(shape)}
              value={settings[key]}
              onChange={event => setSettings(previous => ({ ...previous, [key]: Number(event.target.value) }))}
            />
          </label>
        ))}
        <label>
          <input type="checkbox" checked={outlines} onChange={event => setOutlines(event.target.checked)} /> Original outlines
        </label>
      </div>

      {!shapeSupportsRounding(shape) && (
        <p style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
          This preset has fixed curvature; roundedness does not change it.
        </p>
      )}

      <p className="join-lab-status" role="status">{status}</p>

      <p style={{ fontSize: 12, color: '#64748b' }}>
        D and E use a 0.65px contour grid. Softness drives different algorithms across methods. Blue lines show original stamps.
      </p>

      <p role="status">
        {renderError || (pending ? 'Calculating previews…' : 'Previews ready — showing all five methods under displayed settings.')}
      </p>

      {/* Comparison Matrix */}
      <div className="join-lab-matrix" aria-busy={pending} style={{ gridTemplateColumns: `110px repeat(${JOIN_METHODS.length}, minmax(180px, 1fr))` }}>
        <div />
        <>
          {JOIN_METHODS.map(method => (
            <div className="join-method" key={method.id}>
              <h2>{method.label}</h2>
              <p>{method.description}</p>
            </div>
          ))}
        </>
        {JOIN_CASES.map((test, row) => (
          <div className="join-lab-row" key={test.id}>
            <h3>{test.label}</h3>
            {JOIN_METHODS.map((method, column) => {
              const result = results[row]?.[column]
              const choice = choices[`${shapeId}:${test.id}`]
              const selected = choice ? choice.method === method.id : currentShapePrimaryMethod === method.id
              const matching = selected && (!choice || JSON.stringify(choice.settings) === JSON.stringify(settled))

              return (
                <section key={method.id} className={matching ? 'chosen' : ''}>
                  <svg viewBox="-40 -40 162 162" role="img" aria-label={`${shape.label}, ${test.label}, ${method.label}`} style={{ opacity: pending ? 0.3 : 1 }}>
                    {result?.paths.map((path, index) => <path key={index} d={path} fill="black" fillRule="evenodd" />)}
                    {outlines && result?.outlines.map((path, index) => <path key={`outline-${index}`} d={path} fill="none" stroke="#0000ee" strokeWidth="0.45" />)}
                  </svg>
                  {result?.error ? (
                    <p role="alert">{result.error}</p>
                  ) : (
                    <small>{pending ? 'Updating…' : `${result?.paths.length ?? 0} SVG path groups`}</small>
                  )}
                  <button
                    disabled={isLocked || !result || !!result.error || pending || !!renderError}
                    aria-pressed={matching}
                    onClick={() => chooseDirection(test.id, method.id)}
                  >
                    {isLocked ? 'Locked (Metaball)' : matching ? 'Selected ✓' : selected ? 'Update saved' : 'Prefer this'}
                  </button>
                  {selected && !matching && choice && (
                    <small>Saved at softness {choice.settings.softness}.</small>
                  )}
                </section>
              )
            })}
          </div>
        ))}
      </div>

      {/* Footer */}
      <footer>
        <p>
          {Object.keys(choices).length} custom direction overrides saved.
          {engineMode === 'main' ? ' (Main Engine Active)' : engineMode === 'fork-weld' ? ' (Fork: Pure Weld Active)' : ' (Fork: Legacy Active)'}
        </p>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() =>
              downloadBlob(
                new Blob([JSON.stringify({ version: 2, choices, timestamp: new Date().toISOString() }, null, 2)], {
                  type: 'application/json',
                }),
                'join-review.json',
              )
            }
          >
            Download choices JSON
          </button>

          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            accept=".json"
            onChange={handleFileUpload}
          />
          <button onClick={() => fileInputRef.current?.click()}>
            Import choices JSON
          </button>

          <button onClick={resetAll} style={{ color: '#e11d48', borderColor: '#e11d48' }}>
            Reset all choices
          </button>
        </div>
      </footer>
    </main>
  )
}
