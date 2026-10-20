import { useEffect, useRef } from 'react'

export const POLL_MS = 5000

/** Llama a `callback` cada `ms` mientras `active` sea true (p. ej. mientras el run está en curso). */
export function usePolling(callback: () => void, active: boolean, ms = POLL_MS) {
  const ref = useRef(callback)
  ref.current = callback
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => ref.current(), ms)
    return () => clearInterval(timer)
  }, [active, ms])
}
