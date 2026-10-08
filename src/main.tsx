import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Projection } from './components/Projection'
import { StudioDesk } from './components/StudioDesk'
import { JoinLab } from './components/JoinLab'

const view = new URLSearchParams(window.location.search).get('view')

function Root() {
  // Legacy ?view=wall bookmarks use projection.
  if (view === 'projection' || view === 'wall') return <Projection />
  if (view === 'workshop') return <App />
  if (view === 'join-lab') return <JoinLab />
  // Studio desk is the festival default (also ?view=studio).
  return <StudioDesk />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <Root />
    </ErrorBoundary>
  </StrictMode>,
)
