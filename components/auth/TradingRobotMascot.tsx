'use client'

import { motion, useMotionValue, useSpring } from 'framer-motion'
import { useEffect, useState } from 'react'

interface TradingRobotMascotProps {
  emailFocused: boolean
  passwordFocused: boolean
  loginError: boolean
}

export function TradingRobotMascot({ emailFocused, passwordFocused, loginError }: TradingRobotMascotProps) {
  const [action, setAction] = useState<'idle' | 'analyzing' | 'celebrating' | 'error'>('idle')
  const [position, setPosition] = useState({ x: window.innerWidth / 2 - 100, y: 100 })
  
  const rotateY = useMotionValue(0)
  const rotateX = useMotionValue(0)
  const springRotateY = useSpring(rotateY, { stiffness: 100, damping: 15 })
  const springRotateX = useSpring(rotateX, { stiffness: 100, damping: 15 })

  useEffect(() => {
    if (loginError) {
      setAction('error')
      setTimeout(() => setAction('idle'), 3000)
    } else if (emailFocused || passwordFocused) {
      setAction('analyzing')
    } else {
      setAction('idle')
    }
  }, [loginError, emailFocused, passwordFocused])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const centerX = window.innerWidth / 2
      const centerY = window.innerHeight / 2
      const deltaX = (e.clientX - centerX) / centerX
      const deltaY = (e.clientY - centerY) / centerY
      rotateY.set(deltaX * 20)
      rotateX.set(-deltaY * 20)
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [rotateY, rotateX])

  useEffect(() => {
    const floatInterval = setInterval(() => {
      setPosition(prev => ({
        x: Math.random() * (window.innerWidth - 200),
        y: Math.random() * 200 + 50
      }))
    }, 4000)

    return () => clearInterval(floatInterval)
  }, [])

  return (
    <motion.div
      className="fixed pointer-events-none z-50"
      animate={{
        x: position.x,
        y: position.y,
      }}
      transition={{
        duration: 3,
        ease: 'easeInOut'
      }}
      style={{
        perspective: 1000,
      }}
    >
      <motion.div
        style={{
          rotateY: springRotateY,
          rotateX: springRotateX,
          transformStyle: 'preserve-3d',
        }}
        animate={{
          y: action === 'idle' ? [0, -10, 0] : 0,
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      >
        {/* 3D Robot Body */}
        <div className="relative" style={{ width: '200px', height: '250px', transformStyle: 'preserve-3d' }}>
          {/* Head */}
          <motion.div
            className="absolute left-1/2 -translate-x-1/2 top-0"
            style={{ transformStyle: 'preserve-3d' }}
            animate={{
              rotateZ: action === 'analyzing' ? [0, -5, 5, 0] : 0,
            }}
            transition={{
              duration: 0.5,
              repeat: action === 'analyzing' ? Infinity : 0,
            }}
          >
            {/* Head cube - front face */}
            <div className="relative w-20 h-20 bg-gradient-to-br from-cyan-400 to-blue-600 rounded-lg shadow-2xl border-2 border-cyan-300"
              style={{ transform: 'translateZ(10px)' }}>
              {/* Antenna */}
              <motion.div
                className="absolute -top-8 left-1/2 -translate-x-1/2 w-1 h-8 bg-gradient-to-t from-cyan-400 to-yellow-400"
                animate={{
                  scaleY: action === 'analyzing' ? [1, 1.3, 1] : 1,
                }}
                transition={{
                  duration: 0.3,
                  repeat: action === 'analyzing' ? Infinity : 0,
                }}
              />
              <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-3 h-3 bg-yellow-400 rounded-full shadow-lg"
                style={{ boxShadow: '0 0 20px #fbbf24' }} />
              
              {/* Eyes */}
              <div className="absolute top-4 left-3 flex gap-3">
                <motion.div
                  className="w-4 h-4 bg-gradient-to-br from-green-400 to-emerald-600 rounded-full"
                  animate={{
                    scale: action === 'analyzing' ? [1, 1.2, 1] : 1,
                    boxShadow: action === 'analyzing' 
                      ? ['0 0 10px #10b981', '0 0 20px #10b981', '0 0 10px #10b981']
                      : '0 0 10px #10b981',
                  }}
                  transition={{
                    duration: 0.5,
                    repeat: action === 'analyzing' ? Infinity : 0,
                  }}
                />
                <motion.div
                  className="w-4 h-4 bg-gradient-to-br from-green-400 to-emerald-600 rounded-full"
                  animate={{
                    scale: action === 'analyzing' ? [1, 1.2, 1] : 1,
                    boxShadow: action === 'analyzing' 
                      ? ['0 0 10px #10b981', '0 0 20px #10b981', '0 0 10px #10b981']
                      : '0 0 10px #10b981',
                  }}
                  transition={{
                    duration: 0.5,
                    repeat: action === 'analyzing' ? Infinity : 0,
                    delay: 0.1,
                  }}
                />
              </div>

              {/* Display screen */}
              <div className="absolute bottom-2 left-2 right-2 h-3 bg-black/50 rounded flex items-center justify-center overflow-hidden">
                <motion.div
                  className="text-[8px] font-mono text-green-400"
                  animate={{
                    opacity: action === 'analyzing' ? [0.5, 1, 0.5] : 1,
                  }}
                  transition={{
                    duration: 0.8,
                    repeat: action === 'analyzing' ? Infinity : 0,
                  }}
                >
                  {action === 'analyzing' ? 'SCANNING...' : action === 'error' ? 'ERROR!' : 'READY'}
                </motion.div>
              </div>
            </div>

            {/* Head sides for 3D effect */}
            <div className="absolute top-0 left-0 w-20 h-20 bg-gradient-to-br from-cyan-500 to-blue-700 rounded-lg opacity-60"
              style={{ transform: 'translateZ(-10px)' }} />
            <div className="absolute top-0 left-0 w-20 h-20 bg-gradient-to-r from-cyan-400 to-blue-600 opacity-70"
              style={{ transform: 'rotateY(90deg) translateZ(10px)' }} />
          </motion.div>

          {/* Body */}
          <motion.div
            className="absolute left-1/2 -translate-x-1/2 top-24"
            style={{ transformStyle: 'preserve-3d' }}
            animate={{
              scaleY: action === 'analyzing' ? [1, 0.95, 1] : 1,
            }}
            transition={{
              duration: 0.5,
              repeat: action === 'analyzing' ? Infinity : 0,
            }}
          >
            {/* Body cube - front */}
            <div className="relative w-24 h-32 bg-gradient-to-br from-slate-700 to-slate-900 rounded-xl shadow-2xl border-2 border-slate-600"
              style={{ transform: 'translateZ(12px)' }}>
              {/* Chest panel */}
              <div className="absolute top-4 left-3 right-3 h-20 bg-gradient-to-br from-slate-800 to-slate-950 rounded-lg border border-cyan-500/30 p-2">
                {/* Trading chart */}
                <svg width="100%" height="100%" viewBox="0 0 60 60">
                  <motion.path
                    d="M 5 50 L 15 40 L 25 45 L 35 30 L 45 35 L 55 20"
                    stroke="#22d3ee"
                    strokeWidth="2"
                    fill="none"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: 'linear',
                    }}
                  />
                  {/* Candlesticks */}
                  <rect x="10" y="35" width="3" height="10" fill="#10b981" />
                  <rect x="20" y="40" width="3" height="8" fill="#ef4444" />
                  <rect x="30" y="25" width="3" height="15" fill="#10b981" />
                  <rect x="40" y="30" width="3" height="12" fill="#10b981" />
                  <rect x="50" y="15" width="3" height="20" fill="#10b981" />
                </svg>
              </div>

              {/* Status lights */}
              <div className="absolute bottom-2 left-3 flex gap-1">
                <motion.div
                  className="w-2 h-2 rounded-full bg-green-500"
                  animate={{
                    opacity: [1, 0.3, 1],
                  }}
                  transition={{
                    duration: 1,
                    repeat: Infinity,
                  }}
                />
                <motion.div
                  className="w-2 h-2 rounded-full bg-blue-500"
                  animate={{
                    opacity: [1, 0.3, 1],
                  }}
                  transition={{
                    duration: 1,
                    repeat: Infinity,
                    delay: 0.3,
                  }}
                />
                <motion.div
                  className="w-2 h-2 rounded-full bg-yellow-500"
                  animate={{
                    opacity: [1, 0.3, 1],
                  }}
                  transition={{
                    duration: 1,
                    repeat: Infinity,
                    delay: 0.6,
                  }}
                />
              </div>
            </div>

            {/* Body back */}
            <div className="absolute top-0 left-0 w-24 h-32 bg-gradient-to-br from-slate-800 to-slate-950 rounded-xl opacity-60"
              style={{ transform: 'translateZ(-12px)' }} />
          </motion.div>

          {/* Arms */}
          <motion.div
            className="absolute left-0 top-28"
            animate={{
              rotateZ: action === 'analyzing' ? [0, -20, 0] : 0,
            }}
            transition={{
              duration: 0.6,
              repeat: action === 'analyzing' ? Infinity : 0,
            }}
            style={{ transformOrigin: 'right center' }}
          >
            <div className="w-6 h-16 bg-gradient-to-b from-slate-600 to-slate-800 rounded-lg shadow-lg" />
            <div className="w-5 h-5 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full mt-1 ml-0.5" />
          </motion.div>

          <motion.div
            className="absolute right-0 top-28"
            animate={{
              rotateZ: action === 'analyzing' ? [0, 20, 0] : 0,
            }}
            transition={{
              duration: 0.6,
              repeat: action === 'analyzing' ? Infinity : 0,
            }}
            style={{ transformOrigin: 'left center' }}
          >
            <div className="w-6 h-16 bg-gradient-to-b from-slate-600 to-slate-800 rounded-lg shadow-lg" />
            <div className="w-5 h-5 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full mt-1 ml-0.5" />
          </motion.div>

          {/* Legs */}
          <div className="absolute left-6 top-56 w-5 h-12 bg-gradient-to-b from-slate-700 to-slate-900 rounded-lg shadow-lg" />
          <div className="absolute right-6 top-56 w-5 h-12 bg-gradient-to-b from-slate-700 to-slate-900 rounded-lg shadow-lg" />

          {/* Particle effects */}
          {action === 'analyzing' && (
            <>
              {[...Array(8)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute w-1 h-1 bg-cyan-400 rounded-full"
                  style={{
                    left: '50%',
                    top: '50%',
                  }}
                  animate={{
                    x: [0, Math.cos(i * Math.PI / 4) * 40],
                    y: [0, Math.sin(i * Math.PI / 4) * 40],
                    opacity: [1, 0],
                  }}
                  transition={{
                    duration: 1,
                    repeat: Infinity,
                    delay: i * 0.1,
                  }}
                />
              ))}
            </>
          )}
        </div>

        {/* Speech bubble */}
        {action === 'analyzing' && (
          <motion.div
            className="absolute -top-16 left-1/2 -translate-x-1/2 bg-cyan-500 text-white px-4 py-2 rounded-lg font-bold text-sm whitespace-nowrap shadow-xl"
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            ANALYZING LOGIN...
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-8 border-r-8 border-t-8 border-transparent border-t-cyan-500" />
          </motion.div>
        )}

        {action === 'error' && (
          <motion.div
            className="absolute -top-16 left-1/2 -translate-x-1/2 bg-red-500 text-white px-4 py-2 rounded-lg font-bold text-sm whitespace-nowrap shadow-xl"
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            ACCESS DENIED! 🚫
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-8 border-r-8 border-t-8 border-transparent border-t-red-500" />
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  )
}
