import { useEffect, useRef, useState } from 'react'

/**
 * Counts up from the asset's createdAt timestamp (or from 0 if not provided).
 * Persists correctly across navigation and page refreshes.
 */
export function GeneratingTimer({ createdAt }: { createdAt?: string }) {
  const startMs = createdAt ? new Date(createdAt).getTime() : Date.now()
  const [elapsed, setElapsed] = useState(() => Math.max(0, (Date.now() - startMs) / 1000))
  const ref = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    ref.current = setInterval(() => {
      setElapsed(Math.max(0, (Date.now() - startMs) / 1000))
    }, 100)
    return () => {
      if (ref.current) clearInterval(ref.current)
    }
  }, [startMs])

  return (
    <span className="text-sm font-mono font-medium text-foreground/70 tabular-nums">
      {elapsed.toFixed(1)}s
    </span>
  )
}
