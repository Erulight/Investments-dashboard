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
        window.location.href = '/dashboard'
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
            <img src="/legacy-loop-logo.png" alt="Legacy Loop" className="h-20 w-20 mb-4" />
            <h1 className="text-2xl font-bold text-white">Legacy Loop</h1>
            <p className="text-sm text-slate-400">Smart Investment Platform</p>
          </div>
        </div>
        
        <div className="premium-card p-8 w-full max-w-md">
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
                <label htmlFor="email" className="block text-sm font-semibold text-slate-300 mb-2">
                  Email Address
                </label>
                <input
                  ref={emailRef}
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="premium-input appearance-none relative block w-full px-4 py-3 rounded-xl focus:outline-none transition-all duration-200 text-white placeholder-slate-500"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setEmailFocused(true)}
                  onBlur={() => setEmailFocused(false)}
                />
              </div>
              
              <div>
                <label htmlFor="password" className="block text-sm font-semibold text-slate-300 mb-2">
                  Password
                </label>
                <input
                  ref={passwordRef}
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className="premium-input appearance-none relative block w-full px-4 py-3 rounded-xl focus:outline-none transition-all duration-200 text-white placeholder-slate-500"
                  placeholder="Enter your password"
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
                className="group relative w-full flex justify-center py-3.5 px-4 border border-transparent text-sm font-semibold rounded-xl text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500 disabled:opacity-50 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200"
              >
                {loading ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Signing in...
                  </span>
                ) : (
                  <span className="flex items-center">
                    <span>Sign in to your account</span>
                    <span className="ml-2">→</span>
                  </span>
                )}
              </button>
            </div>

            <div className="text-center">
              <span className="text-sm font-medium text-gray-600">
                Don&apos;t have an account? Contact the owner.
              </span>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
