import { Component, type ErrorInfo, type ReactNode } from 'react'
import { FESTIVAL_KEY } from '@/lib/festival'
import { downloadBlob } from '@/lib/utils'

interface State {
  error: Error | null
}

/**
 * Last line of defence at a live event: if rendering throws, visitors see a
 * calm recovery screen instead of a blank page, and the saved work can still
 * be downloaded before anything is reloaded.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('grid workshop crashed', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    let saved: string | null = null
    try {
      saved = window.localStorage.getItem(FESTIVAL_KEY)
    } catch {
      saved = null
    }
    return (
      <main className="crash-screen" role="alert" data-testid="crash-screen">
        <p className="specimen-rule">grid workshop</p>
        <h1>Something went wrong.</h1>
        <p>
          Your letters are still saved on this computer. Download a backup first, then reload the
          workshop.
        </p>
        <div className="crash-actions">
          <button
            type="button"
            disabled={!saved}
            onClick={() =>
              saved &&
              downloadBlob(
                new Blob([saved], { type: 'application/json' }),
                `workshop-recovery-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
              )
            }
          >
            Download backup
          </button>
          <button type="button" onClick={() => window.location.reload()}>
            Reload workshop
          </button>
        </div>
        <pre>{this.state.error.message}</pre>
      </main>
    )
  }
}
