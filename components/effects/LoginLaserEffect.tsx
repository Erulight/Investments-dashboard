'use client'

import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'

export function LoginLaserEffect({ onComplete }: { onComplete?: () => void }) {
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number; angle: number }>>([])

  useEffect(() => {
    const particleArray = Array.from({ length: 20 }, (_, i) => ({
      id: i,
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
      angle: (Math.PI * 2 * i) / 20,
    }))
    setParticles(particleArray)

    const timer = setTimeout(() => {
      onComplete?.()
    }, 1200)

    return () => clearTimeout(timer)
  }, [onComplete])

  return (
    <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden">
      {/* Center glow */}
      <motion.div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        initial={{ scale: 0, opacity: 1 }}
        animate={{ scale: 3, opacity: 0 }}
        transition={{ duration: 1, ease: 'easeOut' }}
      >
        <div className="w-32 h-32 bg-gradient-radial from-cyan-400 via-blue-500 to-transparent rounded-full blur-xl" />
      </motion.div>

      {/* Laser beams */}
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          className="absolute left-1/2 top-1/2"
          initial={{ x: 0, y: 0, opacity: 1 }}
          animate={{
            x: Math.cos(particle.angle) * 1000,
            y: Math.sin(particle.angle) * 1000,
            opacity: 0,
          }}
          transition={{
            duration: 1,
            ease: 'easeOut',
            delay: particle.id * 0.01,
          }}
        >
          <div className="w-1 h-1 bg-cyan-400 rounded-full shadow-[0_0_10px_#22d3ee]" />
        </motion.div>
      ))}

      {/* Circular waves */}
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 border-2 border-cyan-400 rounded-full"
          initial={{ width: 0, height: 0, opacity: 0.8 }}
          animate={{ width: 800, height: 800, opacity: 0 }}
          transition={{
            duration: 1.2,
            ease: 'easeOut',
            delay: i * 0.15,
          }}
        />
      ))}

      {/* Grid lines */}
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.3, 0] }}
        transition={{ duration: 1 }}
      >
        <svg className="w-full h-full">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(34, 211, 238, 0.3)" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </motion.div>

      {/* Text effect */}
      <motion.div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: [0, 1, 0], scale: [0.5, 1.2, 1] }}
        transition={{ duration: 1 }}
      >
        <div className="text-4xl font-bold text-cyan-400 tracking-wider" style={{ textShadow: '0 0 20px #22d3ee' }}>
          AUTHENTICATED
        </div>
      </motion.div>
    </div>
  )
}
