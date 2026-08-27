import { Link } from 'react-router-dom'

type LinkCardProps = {
  title: string
  description: string
  href?: string
  external?: boolean
}

const classes =
  'group flex min-h-44 flex-col justify-between rounded-[24px] border border-black/15 bg-white/55 p-5 transition-colors hover:bg-white focus-visible:bg-white sm:min-h-52 sm:p-6'

function CardContent({ title, description, external }: Omit<LinkCardProps, 'href'>) {
  return (
    <>
      <span className="flex items-start justify-between gap-4 text-[24px] sm:text-[30px]">
        {title}
        {external && <span aria-hidden="true" className="transition-transform group-hover:translate-x-1 group-hover:-translate-y-1">↗</span>}
      </span>
      <span className="max-w-sm text-[15px] leading-relaxed text-black/60 sm:text-[17px]">{description}</span>
    </>
  )
}

function LinkCard({ title, description, href, external = false }: LinkCardProps) {
  if (!href) {
    return (
      <article className={classes}>
        <CardContent title={title} description={description} external={false} />
      </article>
    )
  }

  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={classes}>
        <CardContent title={title} description={description} external />
      </a>
    )
  }

  return (
    <Link to={href} className={classes}>
      <CardContent title={title} description={description} external={false} />
    </Link>
  )
}

export default LinkCard
