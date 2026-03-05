"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"

export default function AutoRefresher() {
  const router = useRouter()
  const refreshTimeout = useRef<number | null>(null)
  const patched = useRef(false)

  useEffect(() => {
    const schedule = () => {
      if (refreshTimeout.current != null) return
      refreshTimeout.current = window.setTimeout(() => {
        try { router.refresh() } finally { refreshTimeout.current = null }
      }, 250)
    }

    const onFocus = () => schedule()
    const onVisible = () => { if (document.visibilityState === "visible") schedule() }
    const onOnline = () => schedule()

    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("online", onOnline)

    // Minimal fetch patch: refresh after successful non-GET requests
    if (!patched.current && typeof window !== "undefined" && typeof window.fetch === "function") {
      const orig = window.fetch.bind(window)
      window.fetch = async (...args: Parameters<typeof fetch>) => {
        const res = await orig(...args)
        try {
          const input = args[0] as Request | string
          const init = (args[1] || {}) as RequestInit
          const method = (init.method
            || (typeof input === "object" && "method" in input ? (input as Request).method : "GET")
          )?.toString().toUpperCase()
          if (method && method !== "GET" && res?.ok) schedule()
        } catch {}
        return res
      }
      patched.current = true
    }

    const onCustom = () => schedule()
    window.addEventListener("app:mutated", onCustom as EventListener)
    window.addEventListener("app:refresh", onCustom as EventListener)

    return () => {
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("online", onOnline)
      window.removeEventListener("app:mutated", onCustom as EventListener)
      window.removeEventListener("app:refresh", onCustom as EventListener)
    }
  }, [router])

  return null
}
