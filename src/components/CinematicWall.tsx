/**
 * Installation cinematic wall — specimen-first layout.
 * Same localStorage session as the workshop / studio desk (same browser profile).
 * Cross-machine sync is deferred.
 */
import { useEffect, useState } from 'react'
import { ALPHABET, FESTIVAL_KEY, latestContributions, readSession, svgImage } from '@/lib/festival'

const SPECIMEN = 'vi formar tillsammans'

function loadSession() {
  try {
    return readSession()
  } catch {
    return null
  }
}

export function CinematicWall() {
  const [session, setSession] = useState(loadSession)
  const [canFullscreen] = useState(
    () => typeof document.documentElement.requestFullscreen === 'function',
  )

  useEffect(() => {
    document.title = 'Wall · grid workshop'
    document.documentElement.classList.add('install-view')
    document.body.classList.add('install-view')
    const refresh = () =>
      setSession((previous) => {
        const next = loadSession()
        return next && previous && next.updatedAt === previous.updatedAt
          ? previous
          : (next ?? previous)
      })
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === FESTIVAL_KEY) refresh()
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    const poll = window.setInterval(refresh, 2000)
    return () => {
      document.documentElement.classList.remove('install-view')
      document.body.classList.remove('install-view')
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
      window.clearInterval(poll)
    }
  }, [])

  const published = latestContributions(session?.contributions ?? [])
  const activeChar = session?.active.char ?? 'a'
  const upper = activeChar !== activeChar.toLowerCase()
  const letters = ALPHABET.map((char) => (upper ? char.toUpperCase() : char))
  const complete = letters.filter((char) => published.has(char)).length
  const liveReady = !!(session?.liveSvg && session.active.filled.length)

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
              · drawing <strong>{activeChar}</strong>
            </>
          ) : null}
        </span>
      </header>

      <section className="cinematic-ribbon" aria-label="Alphabet">
        {letters.map((char) => {
          const contribution = published.get(char)
          const isActive = char === activeChar
          return (
            <div
              key={char}
              className={`cinematic-ribbon-letter${isActive ? ' is-active' : ''}${contribution ? ' is-done' : ''}`}
            >
              {contribution ? (
                <img src={svgImage(contribution.svg)} alt={char} />
              ) : (
                <span>{char}</span>
              )}
              {isActive && liveReady ? <i className="cinematic-live-dot" aria-hidden /> : null}
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
