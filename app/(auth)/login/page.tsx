'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { NexusGuardMascot } from '@/components/auth/NexusGuardMascot'
import { LoginLaserEffect } from '@/components/effects/LoginLaserEffect'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [emailFocused, setEmailFocused] = useState(false)
  const [passwordFocused, setPasswordFocused] = useState(false)
  const [showLaser, setShowLaser] = useState(false)
  const [hasLoginError, setHasLoginError] = useState(false)
  const [onLoginAttempt, setOnLoginAttempt] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setHasLoginError(false)
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Login failed')
        setHasLoginError(true)
        return
      }

      setShowLaser(true)
      setTimeout(() => {
        router.push('/dashboard')
        router.refresh()
      }, 2000)
    } catch (err) {
      setError('An error occurred. Please try again.')
      setHasLoginError(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#060A12] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 overflow-hidden relative" style={{ cursor: 'crosshair' }}>
      {showLaser && <LoginLaserEffect />}
      <NexusGuardMascot
        emailFocused={emailFocused}
        passwordFocused={passwordFocused}
        loginError={hasLoginError}
        onLoginAttempt={onLoginAttempt}
      />
      
      {/* Animated grid background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{
        backgroundImage: 'linear-gradient(rgba(0,245,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,245,255,0.04) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
        animation: 'gridShift 20s linear infinite'
      }} />
      
      {/* Scan line effect */}
      <div className="absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#00F5FF] to-transparent opacity-20 pointer-events-none" style={{
        animation: 'scanLine 7s linear infinite'
      }} />
      
      <style jsx>{`
        @keyframes gridShift {
          from { background-position: 0 0; }
          to { background-position: 40px 40px; }
        }
        @keyframes scanLine {
          from { top: -2px; }
          to { top: 100vh; }
        }
      `}</style>
      
      <div className="max-w-md w-full space-y-8 relative z-10">
        <div className="text-center">
          <div className="flex flex-col items-center mb-8">
            <h1 className="text-[28px] font-[800] text-[#00F5FF] tracking-[3px] uppercase mb-1" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>NEXUS</h1>
            <p className="text-[10px] text-[#4A7A9B] tracking-[2px] uppercase mb-7">Secure Access Terminal</p>
            <div className="flex items-center gap-2 text-[10px] text-[#22C55E] tracking-[1px]">
              <div className="w-[6px] h-[6px] bg-[#22C55E] rounded-full" style={{ boxShadow: '0 0 8px #22C55E', animation: 'dotBlink 1.5s ease-in-out infinite' }} />
              Guard Unit Online
            </div>
          </div>
        </div>
        
        <style jsx>{`
          @keyframes dotBlink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
          }
        `}</style>
        
        <div className="p-11 w-full max-w-md bg-[#0D1420] rounded-[24px] border border-[#1A3050]" style={{ boxShadow: '0 0 0 1px rgba(0,245,255,0.08), 0 30px 80px rgba(0,0,0,0.6)' }}>
          <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="rounded-xl bg-red-50 p-4 border border-red-200">
                <div className="flex items-center">
                  <span className="text-xl mr-2">⚠️</span>
                  <p className="text-sm text-red-800 font-medium">{error}</p>
                </div>
              </div>
            )}
            
            <div className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-[10px] tracking-[2px] uppercase text-[#00F5FF] mb-2" style={{ fontFamily: 'monospace' }}>
                  Operator ID
                </label>
                <input
                  ref={emailRef}
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="appearance-none relative block w-full px-4 py-3 rounded-[10px] focus:outline-none transition-all duration-200 text-[#E8F4FF] placeholder-[#4A7A9B] bg-[rgba(0,245,255,0.04)] border border-[#1A3050] focus:border-[#00F5FF] focus:shadow-[0_0_0_3px_rgba(0,245,255,0.1)]" style={{ fontFamily: 'monospace', fontSize: '14px' }}
                  placeholder="id@nexus.net"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setEmailFocused(true)}
                  onBlur={() => setEmailFocused(false)}
                />
              </div>
              
              <div>
                <label htmlFor="password" className="block text-[10px] tracking-[2px] uppercase text-[#00F5FF] mb-2" style={{ fontFamily: 'monospace' }}>
                  Auth Key
                </label>
                <input
                  ref={passwordRef}
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className="appearance-none relative block w-full px-4 py-3 rounded-[10px] focus:outline-none transition-all duration-200 text-[#E8F4FF] placeholder-[#4A7A9B] bg-[rgba(0,245,255,0.04)] border border-[#1A3050] focus:border-[#00F5FF] focus:shadow-[0_0_0_3px_rgba(0,245,255,0.1)]" style={{ fontFamily: 'monospace', fontSize: '14px' }}
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setPasswordFocused(true)}
                  onBlur={() => setPasswordFocused(false)}
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                onMouseEnter={() => setOnLoginAttempt(true)}
                onMouseLeave={() => setOnLoginAttempt(false)}
                className="group relative w-full flex justify-center py-[14px] px-4 border-none text-[13px] font-[800] tracking-[2px] uppercase rounded-[12px] text-black bg-gradient-to-br from-[#00F5FF] to-[#0A6EFF] hover:shadow-[0_0_35px_rgba(0,245,255,0.5)] focus:outline-none disabled:opacity-50 transition-all duration-150 hover:-translate-y-0.5" style={{ fontFamily: 'system-ui, -apple-system, sans-serif', boxShadow: '0 0 20px rgba(0,245,255,0.3)' }}
              >
                {loading ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-black" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Initializing...
                  </span>
                ) : (
                  <span>Initialize Access</span>
                )}
              </button>
            </div>

            <div className="text-center mt-5">
              <span className="text-[11px] text-[#4A7A9B]" style={{ fontFamily: 'monospace' }}>
                No credentials? <a href="#" className="text-[#00F5FF] no-underline">Request Access →</a>
              </span>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
