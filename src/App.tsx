import { Route, Routes } from 'react-router-dom'
import AboutPage from './pages/AboutPage'
import HomePage from './pages/HomePage'
import LinksPage from './pages/LinksPage'
import NotFoundPage from './pages/NotFoundPage'
import ProjectsPage from './pages/ProjectsPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/projects" element={<ProjectsPage />} />
      <Route path="/links" element={<LinksPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default App
