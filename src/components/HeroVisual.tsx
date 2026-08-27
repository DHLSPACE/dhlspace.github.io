import { ChameleonSequence } from './ChameleonSequence'
import { usePointerScrubVideo } from '../hooks/usePointerScrubVideo'
import { usePointerTracker } from '../pointer/PointerTracker'

const VIDEO_URL = '/chameleon-head-scrub.mp4'
const POSTER_URL = '/chameleon-video-poster.webp'

function PointerScrubVideo() {
  const videoRef = usePointerScrubVideo()

  return (
    <video
      ref={videoRef}
      className="fixed inset-0 z-0 h-full w-full object-cover object-[70%_center]"
      src={VIDEO_URL}
      poster={POSTER_URL}
      muted
      playsInline
      preload="auto"
      aria-hidden="true"
    />
  )
}

export function HeroVisual() {
  const { isFinePointer } = usePointerTracker()

  // Coarse pointers never mount a video element, so the MP4 is not requested on mobile.
  return isFinePointer ? <PointerScrubVideo /> : <ChameleonSequence />
}
