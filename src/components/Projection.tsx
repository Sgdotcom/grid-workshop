/**
 * Classic wall projection — alphabet + live cue + specimen.
 * Joins the shared live room (same room as the desks).
 */
import { useEffect, useState } from 'react'
import { LiveSessionJoin } from '@/components/LiveSessionJoin'
import { FESTIVAL_KEY, latestContributions, svgImage, type FestivalSession } from '@/lib/festival'
import { projectionLetters } from '@/lib/projectionAlphabet'
import { STANDARD_CHARACTERS } from '@/lib/fontDesign'
import {
  projectionLiveCues,
  getLiveConfig,
  isPresenceFresh,
  normalizeStation,
  readLocalSessionSafe,
  type LiveRoomState,
} from '@/lib/liveSession'
import { useLiveSession } from '@/lib/useLiveSession'

const WALL_DESKS = ['a', 'b'] as const

export function Projection() {
  const [session, setSession] = useState<FestivalSession | null>(() => readLocalSessionSafe())
  const [roomBlob, setRoomBlob] = useState<LiveRoomState | null>(null)
  const [now, setNow] = useState(Date.now)
  const [canFullscreen] = useState(() => typeof document.documentElement.requestFullscreen === 'function')

  const live = useLiveSession({
    wallMode: true,
    getSession: () => readLocalSessionSafe(),
    onRemoteSession: (nextSession, liveRoom) => {
      setRoomBlob(liveRoom)
      setSession(nextSession)
    },
  })

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    document.title = 'Wall projection · grid workshop'
    const applyLocal = () => {
      const next = readLocalSessionSafe()
      setSession((previous) =>
        next && previous && next.updatedAt === previous.updatedAt ? previous : (next ?? previous),
      )
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === FESTIVAL_KEY) applyLocal()
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', applyLocal)
    document.addEventListener('visibilitychange', applyLocal)

    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('focus', applyLocal)
      document.removeEventListener('visibilitychange', applyLocal)
    }
  }, [])

  const contributions = session?.contributions ?? []
  const published = latestContributions(contributions)
  const symbolNames = new Map((session?.customSymbols ?? []).filter(symbol => !symbol.deleted).map(symbol => [symbol.char, symbol.name]))
  const knownCharacters = new Set([...STANDARD_CHARACTERS, ...symbolNames.keys()])
  const liveCues = projectionLiveCues(roomBlob, now).filter(cue => knownCharacters.has(cue.char))
  const labelFor = (char: string) => symbolNames.get(char) || char
  const liveChars = new Set(liveCues.map((cue) => cue.char))
  const activeChar =
    liveCues[liveCues.length - 1]?.char ?? session?.active.char ?? 'a'
  const drawingLabel = [...new Set(liveCues.map((cue) => labelFor(cue.char)))].join(' · ')
  const upper = activeChar !== activeChar.toLowerCase()
  const letters = projectionLetters(published.keys(), upper, session?.customSymbols)
  const station = getLiveConfig().station
  const navigationSuffix = `&room=${encodeURIComponent(live.room)}${station ? `&station=${encodeURIComponent(station)}` : ''}`
  const complete = letters.filter((char) => published.has(char)).length
  const localLiveSvg =
    session?.liveSvg && session.active.filled.length ? session.liveSvg : ''
  // The public wall always shows exactly the two installation desks.
  const cueByStation = new Map(liveCues.map((cue) => [normalizeStation(cue.station) || 'desk', cue]))
  const desks = roomBlob?.desks ?? {}
  const stations = WALL_DESKS
  if (!roomBlob && localLiveSvg) {
    cueByStation.set('a', { char: activeChar, liveSvg: localLiveSvg, updatedAt: '', station: 'a' })
  }
  const panes = stations.map((station) => {
    const presence = desks[station]
    return {
      station,
      cue: cueByStation.get(station),
      heldChar: isPresenceFresh(presence, now) && knownCharacters.has(presence!.char) ? presence!.char : '',
    }
  })

  return (
    <main className="festival-wall" data-testid="festival-projection">
      <header className="festival-wall-heading">
        <div><p>BECKMANS · A TYPEFACE MADE TOGETHER</p><h1>Our letters, today.</h1></div>
        <span>{complete} / {letters.length} letters · {contributions.length} contributions</span>
        <nav aria-label="App views" style={{ display: 'flex', gap: '1rem' }}>
          <a href={`?view=studio${navigationSuffix}`}>Studio</a>
          <a href={`?view=workshop${navigationSuffix}`}>Workshop</a>
        </nav>
      </header>
      <LiveSessionJoin
        compact
        className="festival-live-join"
        room={live.room}
        enabled={live.enabled}
        joined={live.joined}
        statusMessage={live.status.message}
        onJoin={live.joinSession}
      />
      <div className="festival-wall-split">
        <section className={`festival-alphabet${letters.length > 30 ? ' has-extras' : ''}`} aria-label="Collective typeface"
          style={{ gridTemplateRows: `repeat(${Math.max(5, Math.ceil(letters.length / 6))}, minmax(${letters.length > 30 ? '64px' : '0'}, 1fr))` }}>
          {letters.map((char) => {
            const preview = published.get(char)
            const isLive = liveChars.has(char)
            return (
              <div
                key={char}
                className={`festival-letter ${isLive ? 'is-active' : ''}`}
              >
                {preview?.svg ? (
                  <img src={svgImage(preview.svg)} alt={labelFor(char)} />
                ) : (
                  <span className="festival-placeholder">{labelFor(char)}</span>
                )}
                <small>
                  {labelFor(char)}
                  {isLive ? ' · drawing now' : ''}
                </small>
              </div>
            )
          })}
        </section>
        <section className="festival-live" aria-label="Current glyph">
          <p>
            {drawingLabel ? <>DRAWING NOW <strong>{drawingLabel}</strong></> : 'READY TO DRAW'}
          </p>
          <div className="festival-live-stack is-multi" data-testid="festival-live-stack">
            {panes.map(({ station, cue, heldChar }) => {
              const desk = `Desk ${station.toUpperCase()}`
              const char = cue?.char || heldChar
              return (
                <div
                  key={station}
                  className={`festival-live-pane${cue ? '' : ' is-idle'}`}
                  data-testid={`festival-live-pane-${station}`}
                  data-drawing={cue ? cue.char : undefined}
                >
                  <small>{char ? `${desk} · ${labelFor(char)}` : desk}</small>
                  {cue ? (
                    <img src={svgImage(cue.liveSvg)} alt={`${desk} drawing ${labelFor(cue.char)}`} />
                  ) : (
                    <div className="festival-waiting">
                      {heldChar ? `Starting ${labelFor(heldChar)}…` : 'Your letter starts here.'}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <p>Choose a letter. Make your mark.<br />Add it to our typeface.</p>
        </section>
      </div>
      <footer className="festival-phrase" aria-label="Collective lettering specimen">
        {[...'Beckmans New Fonts Festival 2026'].map((char, index) => {
          const displayed = char
          const oppositeCase = char === char.toLowerCase() ? char.toUpperCase() : char.toLowerCase()
          const contribution = published.get(displayed) ?? published.get(oppositeCase)
          return char === ' ' ? <span key={index} className="festival-space" /> : contribution ?
            <img key={index} src={svgImage(contribution.svg)} alt={displayed} /> :
            <span key={index} className="festival-missing">{displayed}</span>
        })}
      </footer>
      {canFullscreen && (
        <button
          type="button"
          className="festival-fullscreen"
          onClick={() => {
            document.documentElement.requestFullscreen().catch(() => {
              /* The browser refused (no user gesture, or not allowed); the wall still works windowed. */
            })
          }}
        >
          Full screen
        </button>
      )}
    </main>
  )
}
