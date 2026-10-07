import { useEffect, useState } from 'react'
import { ALPHABET, FESTIVAL_KEY, latestContributions, readSession, svgImage } from '@/lib/festival'

function loadSession() {
  try {
    return readSession()
  } catch {
    return null
  }
}

export function Projection() {
  const [session, setSession] = useState(loadSession)
  const [canFullscreen] = useState(() => typeof document.documentElement.requestFullscreen === 'function')

  useEffect(() => {
    document.title = 'Wall projection · grid workshop'
    const refresh = () =>
      setSession((previous) => {
        const next = loadSession()
        // Keep the same object when nothing was saved, so the wall does not re-render.
        return next && previous && next.updatedAt === previous.updatedAt ? previous : next ?? previous
      })
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === FESTIVAL_KEY) refresh()
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    // Storage events are the fast path; the slow poll covers a missed event after sleep.
    const poll = window.setInterval(refresh, 4000)
    return () => {
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
  return (
    <main className="festival-wall">
      <header className="festival-wall-heading">
        <div><p>BECKMANS · A TYPEFACE MADE TOGETHER</p><h1>Our letters, today.</h1></div>
        <span>{complete} / {letters.length} letters · {session?.contributions.length ?? 0} contributions</span>
      </header>
      <div className="festival-wall-split">
        <section className="festival-alphabet" aria-label="Collective typeface">
          {letters.map((char) => {
            const contribution = published.get(char)
            return <div key={char} className={`festival-letter ${char === activeChar ? 'is-active' : ''}`}>
              {contribution ? <img key={contribution.id} src={svgImage(contribution.svg)} alt={char} /> :
                <span className="festival-placeholder">{char}</span>}
              <small>{char}{char === activeChar ? ' · drawing now' : ''}</small>
            </div>
          })}
        </section>
        <section className="festival-live" aria-label="Current glyph">
          <p>DRAWING NOW <strong>{activeChar}</strong></p>
          {session?.liveSvg && session.active.filled.length ?
            <img src={svgImage(session.liveSvg)} alt={`Live drawing of ${activeChar}`} /> :
            <div className="festival-waiting">Your letter starts here.</div>}
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
