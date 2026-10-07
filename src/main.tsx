import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Projection } from './components/Projection'
import { CinematicWall } from './components/CinematicWall'
import { StudioDesk } from './components/StudioDesk'
import { JoinLab } from './components/JoinLab'

const view = new URLSearchParams(window.location.search).get('view')

function Root() {
  if (view === 'projection') return <Projection />
  if (view === 'wall') return <CinematicWall />
  if (view === 'studio') return <StudioDesk />
  if (view === 'join-lab') return <JoinLab />
  return <App />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <Root />
    </ErrorBoundary>
  </StrictMode>,
)
