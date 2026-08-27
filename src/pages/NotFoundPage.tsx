import { Link } from 'react-router-dom'
import PageShell from '../components/PageShell'

function NotFoundPage() {
  return (
    <PageShell eyebrow="404 / 162383.xyz" title="Not found" intro="This route does not exist or has not been published yet.">
      <Link
        to="/"
        className="inline-flex rounded-full border border-black bg-black px-5 py-2 text-[15px] text-white transition-colors hover:bg-transparent hover:text-black"
      >
        Return home
      </Link>
    </PageShell>
  )
}

export default NotFoundPage
