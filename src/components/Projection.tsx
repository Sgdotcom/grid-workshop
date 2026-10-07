/**
 * Classic wall projection — alphabet + live cue + specimen.
 * Polls the Cloudflare live room when configured; falls back to localStorage.
 */
import { useEffect, useState } from 'react'
import { ALPHABET, FESTIVAL_KEY, latestContributions, svgImage, type FestivalSession } from '@/lib/festival'
import {
  createLiveSyncController,
  letterPreviewSvg,
  readLocalSessionSafe,
  type LiveRoomState,
} from '@/lib/liveSession'

export function Projection() {
  const [session, setSession] = useState<FestivalSession | null>(() => readLocalSessionSafe())
  const [room, setRoom] = useState<LiveRoomState | null>(null)
  const [canFullscreen] = useState(() => typeof document.documentElement.requestFullscreen === 'function')

  useEffect(() => {
    document.title = 'Wall projection · grid workshop'
    const applyLocal = () => {
      const next = readLocalSessionSafe()
      setSession((previous) =>
        next && previous && next.updatedAt === previous.updatedAt ? previous : (next ?? previous),
      )
    }

    const controller = createLiveSyncController({
      getSession: () => readLocalSessionSafe(),
      onRoom: (liveRoom, nextSession) => {
        setRoom(liveRoom)
        setSession(nextSession)
      },
    })
    controller.start(1500)

    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === FESTIVAL_KEY) applyLocal()
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', applyLocal)
    document.addEventListener('visibilitychange', applyLocal)

    return () => {
      controller.stop()
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('focus', applyLocal)
      document.removeEventListener('visibilitychange', applyLocal)
    }
  }, [])

  const contributions = session?.contributions ?? []
  const published = latestContributions(contributions)
  const draftSvgs = room?.draftSvgs ?? {}
  const liveCue = room?.liveCue
  const activeChar = liveCue?.char ?? session?.active.char ?? 'a'
  const upper = activeChar !== activeChar.toLowerCase()
  const letters = ALPHABET.map((char) => (upper ? char.toUpperCase() : char))
  const complete = letters.filter((char) => published.has(char)).length
  const liveSvg = liveCue?.liveSvg || (session?.liveSvg && session.active.filled.length ? session.liveSvg : '')

  return (
    <main className="festival-wall">
      <header className="festival-wall-heading">
        <div><p>BECKMANS · A TYPEFACE MADE TOGETHER</p><h1>Our letters, today.</h1></div>
        <span>{complete} / {letters.length} letters · {contributions.length} contributions</span>
      </header>
      <div className="festival-wall-split">
        <section className="festival-alphabet" aria-label="Collective typeface">
          {letters.map((char) => {
            const preview = letterPreviewSvg(char, contributions, draftSvgs, liveCue)
            return (
              <div
                key={char}
                className={`festival-letter ${char === activeChar ? 'is-active' : ''} ${preview.kind === 'draft' || preview.kind === 'live' ? 'is-draft' : ''}`}
              >
                {preview.svg ? (
                  <img src={svgImage(preview.svg)} alt={char} />
                ) : (
                  <span className="festival-placeholder">{char}</span>
                )}
                <small>
                  {char}
                  {char === activeChar ? ' · drawing now' : ''}
                  {preview.kind === 'draft' ? ' · draft' : ''}
                </small>
              </div>
            )
          })}
        </section>
        <section className="festival-live" aria-label="Current glyph">
          <p>DRAWING NOW <strong>{activeChar}</strong></p>
          {liveSvg ? (
            <img src={svgImage(liveSvg)} alt={`Live drawing of ${activeChar}`} />
          ) : (
            <div className="festival-waiting">Your letter starts here.</div>
          )}
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
