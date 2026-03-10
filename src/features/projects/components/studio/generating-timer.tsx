import { useEffect, useRef, useState } from 'react'

/**
 * Counts up from 0.0s in 0.1s increments while mounted.
 * Displays as "X.Xs" with one decimal place.
 */
export function GeneratingTimer() {
  const [elapsed, setElapsed] = useState(0)
  const ref = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    ref.current = setInterval(() => {
      setElapsed((prev) => Math.round((prev + 0.1) * 10) / 10)
    }, 100)
    return () => {
      if (ref.current) clearInterval(ref.current)
    }
  }, [])

  return (
    <span className="text-sm font-mono font-medium text-foreground/70 tabular-nums">
      {elapsed.toFixed(1)}s
    </span>
  )
}
