import LinkCard from '../components/LinkCard'
import PageShell from '../components/PageShell'
import { GITHUB_URL } from '../site'

function LinksPage() {
  return (
    <PageShell
      eyebrow="Links / 162383.xyz"
      title="Links"
      intro="A single place for the sites, profiles, and resources connected to 162383.xyz. More links can be added later."
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <LinkCard title="Blog" description="Technical notes, AI, investing, and essays." href="https://blog.162383.xyz" external />
        <LinkCard title="Lab" description="AI agents, tools, demos, and experiments." href="https://lab.162383.xyz" external />
        <LinkCard title="HM" description="Interactive projects and web experiments." href="https://hm.162383.xyz" external />
        <LinkCard title="GitHub" description="Public repositories and source code." href={GITHUB_URL} external />
      </div>
    </PageShell>
  )
}

export default LinksPage
