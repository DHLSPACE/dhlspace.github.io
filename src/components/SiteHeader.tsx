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
  const baseClassName = mobile
    ? 'rounded-full px-4 py-2 transition-colors duration-200 hover:bg-black hover:text-white'
    : 'rounded-full px-3 py-1.5 transition-colors duration-200 hover:bg-black/10 focus-visible:bg-black/10'

  if (item.external) {
    return (
      <a
        href={item.href}
        target="_blank"
        rel="noreferrer"
        className={baseClassName}
        tabIndex={mobile && !menuOpen ? -1 : undefined}
        onClick={onNavigate}
      >
        {item.label}<span aria-hidden="true" className="ml-1 text-[0.7em]">↗</span>
      </a>
    )
  }

  return (
    <NavLink
      to={item.href}
      end
      className={({ isActive }) =>
        `${baseClassName} ${isActive ? 'bg-black text-white hover:bg-black' : ''}`
      }
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
      <header className="fixed inset-x-0 top-0 z-30 p-3 sm:p-4">
        <div className="liquid-glass-nav grid w-full grid-cols-[1fr_auto] items-center rounded-full px-4 py-2.5 sm:px-5 lg:grid-cols-[1fr_auto_1fr]">
          <Link to="/" className="relative z-30 flex items-center gap-2.5 text-black" aria-label="162383.xyz home">
            <span
              className="whitespace-nowrap text-[20px] tracking-tight sm:text-[23px]"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              162383.xyz
            </span>
            <span
              aria-hidden="true"
              className="select-none text-[23px] leading-none tracking-[-0.02em] sm:text-[27px]"
            >
              ✳︎
            </span>
          </Link>

          <nav
            className="hidden items-center gap-0.5 text-[16px] text-black lg:flex xl:text-[18px]"
            aria-label="Primary navigation"
          >
            {NAV_ITEMS.map((item) => (
              <NavigationLink key={item.label} item={item} />
            ))}
          </nav>

          <button
            ref={menuButtonRef}
            type="button"
            className="relative z-30 flex flex-col justify-self-end gap-[5px] rounded-full p-2 lg:hidden"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen((isOpen) => !isOpen)}
          >
            <span className={`h-[2px] w-6 bg-black transition-all duration-300 ${menuOpen ? 'translate-y-[7px] rotate-45' : ''}`} />
            <span className={`h-[2px] w-6 bg-black transition-opacity duration-300 ${menuOpen ? 'opacity-0' : 'opacity-100'}`} />
            <span className={`h-[2px] w-6 bg-black transition-all duration-300 ${menuOpen ? '-translate-y-[7px] -rotate-45' : ''}`} />
          </button>
        </div>
      </header>

      <nav
        id="mobile-menu"
        className={`mobile-glass-menu fixed inset-0 z-20 flex flex-col items-start justify-center gap-3 px-8 text-[30px] font-medium text-black transition-opacity duration-300 sm:px-12 sm:text-[34px] lg:hidden ${
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
