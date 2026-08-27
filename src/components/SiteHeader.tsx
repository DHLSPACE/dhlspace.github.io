import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { NAV_ITEMS, type NavigationItem } from '../site'

type NavigationLinkProps = {
  item: NavigationItem
  mobile?: boolean
  menuOpen?: boolean
  onNavigate?: () => void
}

function NavigationLink({ item, mobile = false, menuOpen = false, onNavigate }: NavigationLinkProps) {
  const className = 'transition-opacity hover:opacity-60 focus-visible:opacity-60'

  if (item.external) {
    return (
      <a
        href={item.href}
        target="_blank"
        rel="noreferrer"
        className={className}
        tabIndex={mobile && !menuOpen ? -1 : undefined}
        onClick={onNavigate}
      >
        {item.label}
      </a>
    )
  }

  return (
    <NavLink
      to={item.href}
      end
      className={({ isActive }) => `${className} ${isActive ? 'underline underline-offset-2' : ''}`}
      tabIndex={mobile && !menuOpen ? -1 : undefined}
      onClick={onNavigate}
    >
      {item.label}
    </NavLink>
  )
}

function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const location = useLocation()

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!menuOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        menuButtonRef.current?.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [menuOpen])

  return (
    <>
      <header className="fixed top-0 z-20 grid w-full grid-cols-[1fr_auto] items-center px-5 py-4 sm:px-8 sm:py-5 md:grid-cols-[1fr_auto_1fr]">
        <Link to="/" className="relative z-20 flex items-center gap-3 text-black" aria-label="162383.xyz home">
          <span
            className="whitespace-nowrap text-[21px] tracking-tight sm:text-[26px]"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            162383.xyz
          </span>
          <span
            aria-hidden="true"
            className="select-none text-[25px] leading-none tracking-[-0.02em] sm:text-[30px]"
          >
            ✳︎
          </span>
        </Link>

        <nav className="hidden items-center text-[23px] text-black md:flex" aria-label="Primary navigation">
          {NAV_ITEMS.map((item, index) => (
            <span key={item.label}>
              <NavigationLink item={item} />
              {index < NAV_ITEMS.length - 1 && ',\u00a0'}
            </span>
          ))}
        </nav>

        <button
          ref={menuButtonRef}
          type="button"
          className="relative z-20 flex flex-col justify-self-end gap-[5px] p-1 md:hidden"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          onClick={() => setMenuOpen((isOpen) => !isOpen)}
        >
          <span className={`h-[2px] w-6 bg-black transition-all duration-300 ${menuOpen ? 'translate-y-[7px] rotate-45' : ''}`} />
          <span className={`h-[2px] w-6 bg-black transition-opacity duration-300 ${menuOpen ? 'opacity-0' : 'opacity-100'}`} />
          <span className={`h-[2px] w-6 bg-black transition-all duration-300 ${menuOpen ? '-translate-y-[7px] -rotate-45' : ''}`} />
        </button>
      </header>

      <nav
        id="mobile-menu"
        className={`fixed inset-0 z-10 flex flex-col items-start justify-center gap-8 bg-white/95 px-8 text-[32px] font-medium text-black backdrop-blur-sm transition-opacity duration-300 md:hidden ${
          menuOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        aria-label="Mobile navigation"
        aria-hidden={!menuOpen}
      >
        {NAV_ITEMS.map((item) => (
          <NavigationLink
            key={item.label}
            item={item}
            mobile
            menuOpen={menuOpen}
            onNavigate={() => setMenuOpen(false)}
          />
        ))}
      </nav>
    </>
  )
}

export default SiteHeader
