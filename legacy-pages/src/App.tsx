import { useEffect } from 'react'
import { Route, Routes } from 'react-router-dom'
import AboutPage from './pages/AboutPage'
import { InsectCursor } from './components/InsectCursor'
import HmPage from './pages/HmPage'
import LinksPage from './pages/LinksPage'
import NotFoundPage from './pages/NotFoundPage'
import ProjectsPage from './pages/ProjectsPage'
import { PointerTrackerProvider } from './pointer/PointerTracker'

function ReturnToHomepage() {
  useEffect(() => {
    window.location.replace('/')
  }, [])

  return <p role="status">Returning to the homepage…</p>
}

function App() {
  return (
    <PointerTrackerProvider>
      <div className="custom-cursor-zone min-h-screen">
        <Routes>
          <Route path="/" element={<ReturnToHomepage />} />
          <Route path="/hm" element={<HmPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/links" element={<LinksPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        <InsectCursor />
      </div>
    </PointerTrackerProvider>
  )
}

export default App
