/**
 * Classic wall projection — alphabet + live cue + specimen.
 * Joins the shared live room (same room as the desks).
 */
import { useEffect, useState } from 'react'
import { LiveSessionJoin } from '@/components/LiveSessionJoin'
import { ALPHABET, FESTIVAL_KEY, latestContributions, svgImage, type FestivalSession } from '@/lib/festival'
import {
  activeLiveCues,
  isPresenceFresh,
  letterPreviewSvg,
  normalizeStation,
  readLocalSessionSafe,
  type LiveRoomState,
} from '@/lib/liveSession'
import { useLiveSession } from '@/lib/useLiveSession'

const WALL_DESKS = ['a', 'b'] as const

export function Projection() {
  const [session, setSession] = useState<FestivalSession | null>(() => readLocalSessionSafe())
  const [roomBlob, setRoomBlob] = useState<LiveRoomState | null>(null)
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
  const draftSvgs = roomBlob?.draftSvgs ?? {}
  const liveCues = activeLiveCues(roomBlob)
  const liveChars = new Set(liveCues.map((cue) => cue.char))
  const activeChar =
    liveCues[liveCues.length - 1]?.char ?? session?.active.char ?? 'a'
  const drawingLabel = liveCues.length
    ? [...new Set(liveCues.map((cue) => cue.char))].join(' · ')
    : activeChar
  const upper = activeChar !== activeChar.toLowerCase()
  const letters = ALPHABET.map((char) => (upper ? char.toUpperCase() : char))
  const complete = letters.filter((char) => published.has(char)).length
  const localLiveSvg =
    session?.liveSvg && session.active.filled.length ? session.liveSvg : ''
  // Desk A and B always have a pane; any other station that is drawing is appended.
  const cueByStation = new Map(liveCues.map((cue) => [normalizeStation(cue.station) || 'desk', cue]))
  const desks = roomBlob?.desks ?? {}
  const stations = [...new Set([...WALL_DESKS, ...cueByStation.keys()])]
  if (!roomBlob && localLiveSvg) {
    cueByStation.set('a', { char: activeChar, liveSvg: localLiveSvg, updatedAt: '', station: 'a' })
  }
  const panes = stations.map((station) => {
    const presence = desks[station]
    return {
      station,
      cue: cueByStation.get(station),
      heldChar: isPresenceFresh(presence) ? presence!.char : '',
    }
  })

  return (
    <main className="festival-wall" data-testid="festival-projection">
      <header className="festival-wall-heading">
        <div><p>BECKMANS · A TYPEFACE MADE TOGETHER</p><h1>Our letters, today.</h1></div>
        <span>{complete} / {letters.length} letters · {contributions.length} contributions</span>
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
        <section className="festival-alphabet" aria-label="Collective typeface">
          {letters.map((char) => {
            const preview = letterPreviewSvg(
              char,
              contributions,
              draftSvgs,
              roomBlob?.liveCues ?? roomBlob?.liveCue,
            )
            const isLive = liveChars.has(char)
            return (
              <div
                key={char}
                className={`festival-letter ${isLive || (liveCues.length === 0 && char === activeChar) ? 'is-active' : ''} ${preview.kind === 'draft' || preview.kind === 'live' ? 'is-draft' : ''}`}
              >
                {preview.svg ? (
                  <img src={svgImage(preview.svg)} alt={char} />
                ) : (
                  <span className="festival-placeholder">{char}</span>
                )}
                <small>
                  {char}
                  {isLive ? ' · drawing now' : ''}
                  {preview.kind === 'draft' ? ' · draft' : ''}
                </small>
              </div>
            )
          })}
        </section>
        <section className="festival-live" aria-label="Current glyph">
          <p>
            DRAWING NOW <strong>{drawingLabel}</strong>
          </p>
          <div className="festival-live-stack is-multi" data-testid="festival-live-stack">
            {panes.map(({ station, cue, heldChar }) => {
              const desk = station === 'desk' ? 'Desk' : `Desk ${station.toUpperCase()}`
              const char = cue?.char || heldChar
              return (
                <div
                  key={station}
                  className={`festival-live-pane${cue ? '' : ' is-idle'}`}
                  data-testid={`festival-live-pane-${station}`}
                  data-drawing={cue ? cue.char : undefined}
                >
                  <small>{char ? `${desk} · ${char}` : desk}</small>
                  {cue ? (
                    <img src={svgImage(cue.liveSvg)} alt={`${desk} drawing ${cue.char}`} />
                  ) : (
                    <div className="festival-waiting">
                      {heldChar ? `Starting ${heldChar}…` : 'Your letter starts here.'}
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
        {[...'vi formar tillsammans'].map((char, index) => {
          const displayed = upper ? char.toUpperCase() : char
          const contribution = published.get(displayed)
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
