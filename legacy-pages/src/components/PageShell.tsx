import { useEffect, type ReactNode } from 'react'
import SiteHeader from './SiteHeader'

type PageShellProps = {
  eyebrow: string
  title: string
  intro: string
  children: ReactNode
}

function PageShell({ eyebrow, title, intro, children }: PageShellProps) {
  useEffect(() => {
    document.title = `${title} — 162383.xyz`
  }, [title])

  return (
    <div className="min-h-screen bg-[#f1f1ed] text-black">
      <SiteHeader />
      <main className="mx-auto w-full max-w-[1440px] px-5 pb-16 pt-32 sm:px-8 sm:pb-24 sm:pt-40 md:px-10">
        <header className="max-w-4xl">
          <p className="mb-4 text-[14px] uppercase tracking-[0.12em] text-black/55 sm:text-[15px]">{eyebrow}</p>
          <h1
            className="max-w-3xl tracking-[-0.045em]"
            style={{ fontFamily: 'var(--font-heading)', fontSize: 'clamp(52px, 10vw, 132px)', lineHeight: 0.9 }}
          >
            {title}
          </h1>
          <p className="mt-8 max-w-2xl text-[20px] leading-[1.35] sm:mt-10 sm:text-[26px]">{intro}</p>
        </header>

        <div className="mt-16 border-t border-black/20 pt-6 sm:mt-24 sm:pt-8">{children}</div>
      </main>
    </div>
  )
}

export default PageShell
