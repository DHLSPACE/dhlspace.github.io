import LinkCard from '../components/LinkCard'
import PageShell from '../components/PageShell'

function AboutPage() {
  return (
    <PageShell
      eyebrow="About / 162383.xyz"
      title="About"
      intro="A concise place for an introduction, current interests, and ways to connect. Personal details can be added when they are ready."
    >
      <div className="grid gap-3 md:grid-cols-3">
        <LinkCard title="Profile" description="A short, factual introduction will live here." />
        <LinkCard title="Now" description="Current interests and areas of focus will live here." />
        <LinkCard title="Contact" description="Preferred contact details can be added here." />
      </div>
    </PageShell>
  )
}

export default AboutPage
