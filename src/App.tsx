import { Route, Routes } from 'react-router-dom'
import AboutPage from './pages/AboutPage'
import { InsectCursor } from './components/InsectCursor'
import HomePage from './pages/HomePage'
import LinksPage from './pages/LinksPage'
import NotFoundPage from './pages/NotFoundPage'
import ProjectsPage from './pages/ProjectsPage'
import { PointerTrackerProvider } from './pointer/PointerTracker'

function App() {
  return (
    <PointerTrackerProvider>
      <div className="custom-cursor-zone min-h-screen">
        <Routes>
          <Route path="/" element={<HomePage />} />
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
