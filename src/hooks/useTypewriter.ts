import { useEffect, useState } from 'react'

export function useTypewriter(text: string, speed = 38, startDelay = 600) {
  const [displayed, setDisplayed] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    let intervalId: number | undefined
    let characterIndex = 0

    setDisplayed('')
    setDone(false)

    const delayId = window.setTimeout(() => {
      intervalId = window.setInterval(() => {
        characterIndex += 1
        setDisplayed(text.slice(0, characterIndex))

        if (characterIndex >= text.length) {
          if (intervalId !== undefined) window.clearInterval(intervalId)
          setDone(true)
        }
      }, speed)
    }, startDelay)

    return () => {
      window.clearTimeout(delayId)
      if (intervalId !== undefined) window.clearInterval(intervalId)
    }
  }, [text, speed, startDelay])

  return { displayed, done }
}
