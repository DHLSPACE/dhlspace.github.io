import LinkCard from '../components/LinkCard'
import PageShell from '../components/PageShell'
import { GITHUB_URL } from '../site'

function ProjectsPage() {
  return (
    <PageShell
      eyebrow="Projects / 162383.xyz"
      title="Projects"
      intro="A growing index for selected work, experiments, and interactive projects. Individual project entries can be added over time."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <LinkCard title="Lab" description="AI agents, tools, demos, and experiments." href="https://lab.162383.xyz" external />
        <LinkCard title="HM" description="A scroll-led poker experiment and prelude." href="/hm" />
        <LinkCard title="Invitation" description="Continue from HM into the interactive invitation." href="/date-invite/" document />
        <LinkCard title="GitHub" description="Public repositories and source code." href={GITHUB_URL} external />
        <LinkCard title="Selected work" description="A placeholder for future highlighted projects." />
      </div>
    </PageShell>
  )
}

export default ProjectsPage
