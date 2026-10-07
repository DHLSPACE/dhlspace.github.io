import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { usePointerTracker } from '../pointer/PointerTracker'

type CardSpec = {
  rank: string
  digit: string
  suit: string
  label: string
  note: string
  red?: boolean
}

type Pose = {
  x: number
  y: number
  rotation: number
  scale: number
}

const CARDS: CardSpec[] = [
  { rank: 'A', digit: '1', suit: '♥', label: 'BEGIN', note: 'Every story needs a first move.', red: true },
  { rank: '6', digit: '6', suit: '♠', label: 'ROUTE', note: 'Six small signs point to this place.' },
  { rank: '2', digit: '2', suit: '♦', label: 'CHOICE', note: 'Two doors are better than one.', red: true },
  { rank: '3', digit: '3', suit: '♣', label: 'PLAY', note: 'A little chance keeps things alive.' },
  { rank: '8', digit: '8', suit: '♥', label: 'LOOP', note: 'Turn it sideways and it never ends.', red: true },
  { rank: '3', digit: '3', suit: '♠', label: 'RETURN', note: 'The last card points back to the start.' },
]

const BEATS = [
  { index: '01', title: 'A hand appears.', copy: 'Six cards carry one address: 162383.' },
  { index: '02', title: 'Chance enters.', copy: 'Scroll turns order into motion.' },
  { index: '03', title: 'The pattern lands.', copy: 'Tap any card to read what it keeps.' },
  { index: '04', title: 'A door opens.', copy: 'The invitation is waiting on the other side.' },
]

const clamp = (value: number) => Math.min(1, Math.max(0, value))
const ease = (value: number) => {
  const t = clamp(value)
  return t * t * (3 - 2 * t)
}
const mix = (start: number, end: number, amount: number) => start + (end - start) * amount

function mixPose(start: Pose, end: Pose, amount: number): Pose {
  return {
    x: mix(start.x, end.x, amount),
    y: mix(start.y, end.y, amount),
    rotation: mix(start.rotation, end.rotation, amount),
    scale: mix(start.scale, end.scale, amount),
  }
}

function cardPoses(index: number, width: number, height: number, mobile: boolean) {
  const offset = index - (CARDS.length - 1) / 2
  const fanGap = mobile ? Math.min(42, width * 0.105) : Math.min(78, width * 0.06)
  const fan: Pose = {
    x: offset * fanGap,
    y: Math.abs(offset) * (mobile ? 11 : 16),
    rotation: offset * (mobile ? 7.5 : 8.5),
    scale: mobile ? 0.88 : 1,
  }

  const desktopScatter = [
    [-0.34, -0.2, -18],
    [-0.22, 0.19, 11],
    [-0.07, -0.13, -8],
    [0.1, 0.16, 9],
    [0.25, -0.2, 15],
    [0.36, 0.13, -13],
  ]
  const mobileScatter = [
    [-0.27, -0.25, -14],
    [0, -0.3, 7],
    [0.27, -0.2, 13],
    [-0.25, 0.17, 9],
    [0.02, 0.27, -7],
    [0.27, 0.13, -12],
  ]
  const scatterSource = mobile ? mobileScatter : desktopScatter
  const scatterPoint = scatterSource[index]
  const scatter: Pose = {
    x: scatterPoint[0] * width,
    y: scatterPoint[1] * height,
    rotation: scatterPoint[2],
    scale: mobile ? 0.82 : 0.94,
  }

  const column = index % 3
  const row = Math.floor(index / 3)
  const hand: Pose = mobile
    ? {
        x: (column - 1) * Math.min(112, width * 0.285),
        y: (row - 0.5) * Math.min(190, height * 0.24),
        rotation: 0,
        scale: 0.78,
      }
    : {
        x: offset * Math.min(155, width * 0.115),
        y: 0,
        rotation: 0,
        scale: 0.92,
      }

  const doorSide = index < 3 ? -1 : 1
  const doorRow = index % 3
  const doorway: Pose = {
    x: doorSide * (mobile ? width * 0.27 : width * 0.29) + doorSide * doorRow * (mobile ? -10 : -24),
    y: (doorRow - 1) * (mobile ? Math.min(160, height * 0.2) : Math.min(190, height * 0.23)),
    rotation: doorSide * (mobile ? 4 : 7),
    scale: mobile ? 0.72 : 0.82,
  }

  return { fan, scatter, hand, doorway }
}

function poseAtProgress(index: number, progress: number, width: number, height: number, mobile: boolean) {
  const poses = cardPoses(index, width, height, mobile)
  if (progress < 0.3) return mixPose(poses.fan, poses.scatter, ease(progress / 0.3))
  if (progress < 0.64) return mixPose(poses.scatter, poses.hand, ease((progress - 0.3) / 0.34))
  return mixPose(poses.hand, poses.doorway, ease((progress - 0.64) / 0.36))
}

function FrameCorners() {
  return (
    <div className="hm-frame" aria-hidden="true">
      <span className="hm-corner hm-corner-tl" />
      <span className="hm-corner hm-corner-tr" />
      <span className="hm-corner hm-corner-bl" />
      <span className="hm-corner hm-corner-br" />
    </div>
  )
}

function HmPage() {
  const trackRef = useRef<HTMLElement>(null)
  const sceneRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<Array<HTMLDivElement | null>>([])
  const [activeBeat, setActiveBeat] = useState(0)
  const [revealedCards, setRevealedCards] = useState<Set<number>>(() => new Set())
  const { isFinePointer, subscribe } = usePointerTracker()

  useEffect(() => {
    document.title = 'HM — 162383.xyz'
    document.documentElement.dataset.page = 'hm'
    return () => {
      delete document.documentElement.dataset.page
    }
  }, [])

  useEffect(() => {
    const scene = sceneRef.current
    if (!scene || !isFinePointer) return

    return subscribe((frame) => {
      scene.style.setProperty('--pointer-x', `${(frame.normalizedX - 0.5) * 2}`)
      scene.style.setProperty('--pointer-y', `${(frame.normalizedY - 0.5) * 2}`)
    })
  }, [isFinePointer, subscribe])

  useEffect(() => {
    const track = trackRef.current
    const scene = sceneRef.current
    if (!track || !scene) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let animationFrame = 0
    let previousBeat = -1

    const update = () => {
      animationFrame = 0
      const rect = track.getBoundingClientRect()
      const scrollableDistance = Math.max(1, track.offsetHeight - window.innerHeight)
      const progress = reducedMotion.matches ? 0.64 : clamp(-rect.top / scrollableDistance)
      const mobile = window.innerWidth < 720

      scene.style.setProperty('--hm-progress', progress.toFixed(4))

      const beat = Math.min(BEATS.length - 1, Math.floor(progress * BEATS.length + 0.001))
      if (beat !== previousBeat) {
        previousBeat = beat
        setActiveBeat(beat)
      }

      cardRefs.current.forEach((card, index) => {
        if (!card) return
        const pose = poseAtProgress(index, progress, window.innerWidth, window.innerHeight, mobile)
        card.style.transform = `translate3d(calc(-50% + ${pose.x.toFixed(2)}px), calc(-50% + ${pose.y.toFixed(2)}px), 0) rotate(${pose.rotation.toFixed(2)}deg) scale(${pose.scale.toFixed(3)})`
      })
    }

    const requestUpdate = () => {
      if (!animationFrame) animationFrame = window.requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', requestUpdate, { passive: true })
    window.addEventListener('resize', requestUpdate)
    reducedMotion.addEventListener('change', requestUpdate)

    return () => {
      window.removeEventListener('scroll', requestUpdate)
      window.removeEventListener('resize', requestUpdate)
      reducedMotion.removeEventListener('change', requestUpdate)
      if (animationFrame) window.cancelAnimationFrame(animationFrame)
    }
  }, [])

  const toggleCard = (index: number) => {
    setRevealedCards((current) => {
      const next = new Set(current)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  return (
    <main className="hm-page">
      <FrameCorners />

      <header className="hm-nav">
        <Link to="/" className="hm-wordmark" aria-label="162383.xyz home">
          <span>162383</span>
          <span className="hm-wordmark-slash">/</span>
          <span>HM</span>
        </Link>
        <nav className="hm-nav-links" aria-label="HM navigation">
          <Link to="/">HOME</Link>
          <a href="/date-invite/">INVITATION ↗</a>
        </nav>
      </header>

      <section className="hm-hero" aria-labelledby="hm-title">
        <div className="hm-hero-copy">
          <p className="hm-kicker">AN INTERACTIVE PRELUDE / 01</p>
          <h1 id="hm-title">
            Deal the
            <br />
            <em>unexpected.</em>
          </h1>
        </div>

        <div className="hm-teaser-deck" aria-hidden="true">
          {[-2, -1, 0, 1, 2].map((position) => (
            <span key={position} style={{ '--teaser-index': position } as CSSProperties} />
          ))}
          <b>162383</b>
        </div>

        <div className="hm-hero-note">
          <p>把偶然，洗成一副牌。</p>
          <span>A scroll-led experiment before the invitation.</span>
        </div>

        <a className="hm-scroll-cue" href="#deal">
          <span>SCROLL TO DEAL</span>
          <i aria-hidden="true">↓</i>
        </a>
      </section>

      <section ref={trackRef} id="deal" className="hm-scroll-track" aria-label="Scroll-driven card story">
        <div ref={sceneRef} className="hm-sticky-scene">
          <div className="hm-scene-meta" aria-live="polite">
            <span>{BEATS[activeBeat].index} / 04</span>
            <strong>{BEATS[activeBeat].title}</strong>
            <p>{BEATS[activeBeat].copy}</p>
          </div>

          <div className="hm-card-stage">
            {CARDS.map((card, index) => {
              const revealed = revealedCards.has(index)
              return (
                <div
                  key={`${card.digit}-${index}`}
                  ref={(element) => {
                    cardRefs.current[index] = element
                  }}
                  className="hm-card-shell"
                >
                  <button
                    type="button"
                    className={`hm-playing-card${card.red ? ' is-red' : ''}${revealed ? ' is-revealed' : ''}`}
                    aria-label={`${card.rank} of ${card.suit}; digit ${card.digit}. ${revealed ? 'Hide' : 'Reveal'} its note.`}
                    aria-pressed={revealed}
                    onClick={() => toggleCard(index)}
                  >
                    <span className="hm-card-face hm-card-front">
                      <span className="hm-card-rank">
                        <b>{card.rank}</b>
                        <i>{card.suit}</i>
                      </span>
                      <span className="hm-card-center">
                        <small>NO.</small>
                        <b>{card.digit}</b>
                        <i>{card.suit}</i>
                      </span>
                      <span className="hm-card-rank hm-card-rank-bottom">
                        <b>{card.rank}</b>
                        <i>{card.suit}</i>
                      </span>
                    </span>
                    <span className="hm-card-face hm-card-back">
                      <small>{card.label}</small>
                      <b>{card.digit}</b>
                      <p>{card.note}</p>
                      <span>✦</span>
                    </span>
                  </button>
                </div>
              )
            })}
          </div>

          <p className="hm-tap-note">TAP A CARD / FLIP THE MEANING</p>
          <div className="hm-progress-line" aria-hidden="true">
            <span />
          </div>
        </div>
      </section>

      <section className="hm-statement">
        <p className="hm-kicker">THE HAND / 162383</p>
        <h2>
          Six marks become a path.
          <br />
          <em>One path becomes a moment.</em>
        </h2>
        <p className="hm-statement-copy">
          No borrowed artwork, no ordinary project cards — just type, light, motion, and a deck made for this address.
        </p>
      </section>

      <section className="hm-gateway" aria-labelledby="gateway-title">
        <p className="hm-kicker">CHOOSE THE NEXT PAGE</p>
        <h2 id="gateway-title">Where should the last card lead?</h2>

        <div className="hm-gateway-links">
          <a className="hm-gateway-link hm-gateway-primary" href="/date-invite/">
            <span>
              <small>01 / THE MAIN EVENT</small>
              <strong>Open the invitation</strong>
            </span>
            <b aria-hidden="true">↗</b>
          </a>
          <Link className="hm-gateway-link" to="/">
            <span>
              <small>02 / RESET THE DECK</small>
              <strong>Return home</strong>
            </span>
            <b aria-hidden="true">←</b>
          </Link>
        </div>
      </section>

      <footer className="hm-footer">
        <span>162383.XYZ / HM</span>
        <span>SCROLL · FLIP · CHOOSE</span>
        <span>© 2026</span>
      </footer>
    </main>
  )
}

export default HmPage
