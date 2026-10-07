/**
 * Installation cinematic wall — specimen-first layout.
 * Joins the shared live room (same room as the desks).
 */
import { useEffect, useState } from 'react'
import { LiveSessionJoin } from '@/components/LiveSessionJoin'
import { ALPHABET, FESTIVAL_KEY, latestContributions, svgImage, type FestivalSession } from '@/lib/festival'
import {
  activeLiveCues,
  letterPreviewSvg,
  readLocalSessionSafe,
  type LiveRoomState,
} from '@/lib/liveSession'
import { useLiveSession } from '@/lib/useLiveSession'

const SPECIMEN = 'vi formar tillsammans'

export function CinematicWall() {
  const [session, setSession] = useState<FestivalSession | null>(() => readLocalSessionSafe())
  const [roomBlob, setRoomBlob] = useState<LiveRoomState | null>(null)
  const [canFullscreen] = useState(
    () => typeof document.documentElement.requestFullscreen === 'function',
  )

  const live = useLiveSession({
    wallMode: true,
    getSession: () => readLocalSessionSafe(),
    onRemoteSession: (nextSession, liveRoom) => {
      setRoomBlob(liveRoom)
      setSession(nextSession)
    },
  })

  useEffect(() => {
    document.title = 'Wall · grid workshop'
    document.documentElement.classList.add('install-view')
    document.body.classList.add('install-view')

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
      document.documentElement.classList.remove('install-view')
      document.body.classList.remove('install-view')
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
  const liveReady =
    liveCues.length > 0 || !!(session?.liveSvg && session.active.filled.length)

  return (
    <main className="cinematic-wall" data-testid="cinematic-wall">
      <header className="cinematic-wall-heading">
        <div>
          <p>BECKMANS · A TYPEFACE MADE TOGETHER</p>
          <h1>Our letters, today.</h1>
        </div>
        <span>
          {complete} / {letters.length} letters
          {liveReady ? (
            <>
              {' '}
              · drawing <strong>{drawingLabel}</strong>
            </>
          ) : null}
        </span>
      </header>

      <LiveSessionJoin
        compact
        className="cinematic-live-join"
        room={live.room}
        enabled={live.enabled}
        joined={live.joined}
        statusMessage={live.status.message}
        onJoin={live.joinSession}
      />

      <section className="cinematic-ribbon" aria-label="Alphabet">
        {letters.map((char) => {
          const preview = letterPreviewSvg(
            char,
            contributions,
            draftSvgs,
            roomBlob?.liveCues ?? roomBlob?.liveCue,
          )
          const isActive = liveChars.has(char) || (liveCues.length === 0 && char === activeChar)
          return (
            <div
              key={char}
              className={`cinematic-ribbon-letter${isActive ? ' is-active' : ''}${preview.kind === 'published' ? ' is-done' : ''}${preview.kind === 'draft' || preview.kind === 'live' ? ' is-draft' : ''}`}
            >
              {preview.svg ? (
                <img src={svgImage(preview.svg)} alt={char} />
              ) : (
                <span>{char}</span>
              )}
              {liveChars.has(char) || (isActive && liveReady && liveCues.length === 0) ? (
                <i className="cinematic-live-dot" aria-hidden />
              ) : null}
            </div>
          )
        })}
      </section>

      <section className="cinematic-specimen" aria-label="Collective lettering specimen">
        {[...SPECIMEN].map((char, index) => {
          const displayed = upper ? char.toUpperCase() : char
          const contribution = published.get(displayed)
          if (char === ' ') return <span key={index} className="cinematic-space" />
          if (contribution) {
            return (
              <img
                key={`${index}-${contribution.id}`}
                src={svgImage(contribution.svg)}
                alt={displayed}
              />
            )
          }
          return (
            <span key={index} className="cinematic-missing">
              {displayed}
            </span>
          )
        })}
      </section>

      {canFullscreen && (
        <button
          type="button"
          className="festival-fullscreen"
          onClick={() => {
            document.documentElement.requestFullscreen().catch(() => {
              /* Gesture / policy may block fullscreen; wall still works windowed. */
            })
          }}
        >
          Full screen
        </button>
      )}
    </main>
  )
}
