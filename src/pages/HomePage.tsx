import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { HeroVisual } from '../components/HeroVisual'
import SiteHeader from '../components/SiteHeader'
import { useTypewriter } from '../hooks/useTypewriter'
import { HOME_ACTIONS } from '../site'

const TYPEWRITER_TEXT = 'A personal space for projects, notes, links, and experiments.'

function HomePage() {
  const [actionsVisible, setActionsVisible] = useState(false)
  const { displayed, done } = useTypewriter(TYPEWRITER_TEXT)

  useEffect(() => {
    document.title = '162383.xyz'
    const revealTimer = window.setTimeout(() => setActionsVisible(true), 400)
    return () => window.clearTimeout(revealTimer)
  }, [])

  return (
    <main className="relative h-screen w-full overflow-hidden bg-white">
      <HeroVisual />

      <SiteHeader />

      <section className="relative z-[1] flex h-screen flex-col justify-end overflow-hidden px-5 pb-12 sm:px-8 md:justify-center md:px-10 md:pb-0">
        <div className="relative z-10 max-w-xl">
          <p
            className="pointer-events-none mb-5 select-none font-normal text-black sm:mb-6"
            style={{ fontSize: 'clamp(18px, 4vw, 26px)', lineHeight: 1.3 }}
          >
            Welcome.
            <br />
            This is 162383.xyz.
          </p>

          <p
            className="mb-5 min-h-[54px] font-normal text-black sm:mb-6"
            style={{ fontSize: 'clamp(18px, 4vw, 26px)', lineHeight: 1.35 }}
            aria-live="polite"
          >
            {displayed}
            {!done && (
              <span className="typewriter-cursor ml-[2px] inline-block h-[1.1em] w-[2px] align-middle bg-black" />
            )}
          </p>

          <div
            className="flex flex-wrap gap-y-1"
            style={{
              opacity: actionsVisible ? 1 : 0,
              transform: actionsVisible ? 'translateY(0)' : 'translateY(8px)',
              transition: 'opacity 0.4s ease, transform 0.4s ease',
            }}
          >
            {HOME_ACTIONS.map((action) => {
              const className = `mx-[0.2em] mb-[0.4em] inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full px-4 py-[0.3em] text-[13px] transition-colors duration-200 sm:px-5 sm:text-[15px] ${
                action.tone === 'solid'
                  ? 'border border-black/10 bg-white text-black hover:bg-black hover:text-white'
                  : 'border border-black bg-transparent text-black hover:bg-black hover:text-white'
              }`

              const content = (
                <>
                  {action.label}
                  {action.external && <span aria-hidden="true" className="ml-2">↗</span>}
                </>
              )

              return action.external || action.document ? (
                <a
                  key={action.label}
                  href={action.href}
                  target={action.external ? '_blank' : undefined}
                  rel={action.external ? 'noreferrer' : undefined}
                  className={className}
                >
                  {content}
                </a>
              ) : (
                <Link key={action.label} to={action.href} className={className}>
                  {content}
                </Link>
              )
            })}
          </div>
        </div>
      </section>
    </main>
  )
}

export default HomePage
