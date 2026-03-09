'use client'

import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'

interface TradingBullMascotProps {
  emailFocused: boolean
  passwordFocused: boolean
  emailRef: React.RefObject<HTMLInputElement | null>
  passwordRef: React.RefObject<HTMLInputElement | null>
}

export function TradingBullMascot({ emailFocused, passwordFocused, emailRef, passwordRef }: TradingBullMascotProps) {
  const mascotRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ x: 100, y: 100 })
  const [targetPosition, setTargetPosition] = useState({ x: 100, y: 100 })
  const [isWalking, setIsWalking] = useState(false)
  const [direction, setDirection] = useState<'left' | 'right'>('right')
  
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)
  
  const eyeX = useSpring(useTransform(mouseX, [-300, 300], [-6, 6]), { stiffness: 200, damping: 20 })
  const eyeY = useSpring(useTransform(mouseY, [-300, 300], [-4, 4]), { stiffness: 200, damping: 20 })

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!mascotRef.current) return
      const rect = mascotRef.current.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2
      mouseX.set(e.clientX - centerX)
      mouseY.set(e.clientY - centerY)
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [mouseX, mouseY])

  useEffect(() => {
    if (emailFocused && emailRef.current) {
      const rect = emailRef.current.getBoundingClientRect()
      setTargetPosition({ x: rect.left - 150, y: rect.top + 20 })
      setIsWalking(true)
    } else if (passwordFocused && passwordRef.current) {
      const rect = passwordRef.current.getBoundingClientRect()
      setTargetPosition({ x: rect.left - 150, y: rect.top + 20 })
      setIsWalking(true)
    } else {
      const randomWalk = () => {
        const newX = Math.random() * (window.innerWidth - 300) + 50
        const newY = Math.random() * (window.innerHeight - 300) + 50
        setTargetPosition({ x: newX, y: newY })
        setIsWalking(true)
      }
      
      const interval = setInterval(randomWalk, 6000)
      randomWalk()
      return () => clearInterval(interval)
    }
  }, [emailFocused, passwordFocused, emailRef, passwordRef])

  useEffect(() => {
    if (!isWalking) return
    
    const animate = () => {
      setPosition((prev) => {
        const dx = targetPosition.x - prev.x
        const dy = targetPosition.y - prev.y
        const distance = Math.sqrt(dx * dx + dy * dy)
        
        if (distance < 5) {
          setIsWalking(false)
          return prev
        }
        
        const speed = 2.5
        const moveX = (dx / distance) * speed
        const moveY = (dy / distance) * speed
        
        setDirection(moveX > 0 ? 'right' : 'left')
        
        return {
          x: prev.x + moveX,
          y: prev.y + moveY,
        }
      })
    }
    
    const animationFrame = requestAnimationFrame(function step() {
      animate()
      if (isWalking) requestAnimationFrame(step)
    })
    
    return () => cancelAnimationFrame(animationFrame)
  }, [isWalking, targetPosition])

  const lookingAtField = emailFocused || passwordFocused

  return (
    <motion.div
      ref={mascotRef}
      className="fixed pointer-events-none z-50"
      style={{
        left: position.x,
        top: position.y,
        transform: direction === 'left' ? 'scaleX(-1)' : 'scaleX(1)',
      }}
      initial={{ opacity: 0, scale: 0 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.8, type: 'spring' }}
    >
      <div className="relative" style={{ width: '120px', height: '140px' }}>
        {/* Bull Head */}
        <motion.div
          className="absolute top-0 left-1/2 -translate-x-1/2"
          animate={{
            y: isWalking ? [0, -6, 0] : 0,
            rotate: isWalking ? [0, 2, 0, -2, 0] : 0,
          }}
          transition={{
            duration: 0.6,
            repeat: isWalking ? Infinity : 0,
            ease: 'easeInOut',
          }}
        >
          {/* Horns */}
          <div className="absolute -top-6 left-1/2 -translate-x-1/2 flex gap-8">
            <motion.div
              className="w-3 h-10 bg-gradient-to-t from-amber-600 to-amber-300 rounded-t-full"
              style={{
                transformOrigin: 'bottom center',
                transform: 'rotate(-25deg)',
              }}
              animate={{
                rotate: lookingAtField ? -30 : -25,
              }}
            >
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 bg-amber-200 rounded-full" />
            </motion.div>
            <motion.div
              className="w-3 h-10 bg-gradient-to-t from-amber-600 to-amber-300 rounded-t-full"
              style={{
                transformOrigin: 'bottom center',
                transform: 'rotate(25deg)',
              }}
              animate={{
                rotate: lookingAtField ? 30 : 25,
              }}
            >
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 bg-amber-200 rounded-full" />
            </motion.div>
          </div>

          {/* Head */}
          <div className="relative w-24 h-20 bg-gradient-to-br from-amber-700 via-amber-600 to-amber-800 rounded-3xl shadow-2xl">
            {/* Snout */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-10 bg-gradient-to-b from-amber-600 to-amber-700 rounded-2xl">
              {/* Nostrils */}
              <div className="absolute bottom-2 left-3 w-2 h-3 bg-amber-900 rounded-full" />
              <div className="absolute bottom-2 right-3 w-2 h-3 bg-amber-900 rounded-full" />
            </div>

            {/* Eyes */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 flex gap-6">
              {/* Left eye */}
              <div className="relative w-7 h-8 bg-white rounded-full shadow-inner overflow-hidden">
                <motion.div
                  className="absolute w-4 h-4 bg-slate-900 rounded-full top-1/2 left-1/2"
                  style={{
                    x: lookingAtField ? (direction === 'left' ? -5 : 5) : eyeX,
                    y: lookingAtField ? -2 : eyeY,
                    translateX: '-50%',
                    translateY: '-50%',
                  }}
                >
                  <div className="absolute w-1.5 h-1.5 bg-white rounded-full top-1 left-1" />
                  <div className="absolute w-1 h-1 bg-white/50 rounded-full bottom-1 right-1" />
                </motion.div>
              </div>
              
              {/* Right eye */}
              <div className="relative w-7 h-8 bg-white rounded-full shadow-inner overflow-hidden">
                <motion.div
                  className="absolute w-4 h-4 bg-slate-900 rounded-full top-1/2 left-1/2"
                  style={{
                    x: lookingAtField ? (direction === 'left' ? -5 : 5) : eyeX,
                    y: lookingAtField ? -2 : eyeY,
                    translateX: '-50%',
                    translateY: '-50%',
                  }}
                >
                  <div className="absolute w-1.5 h-1.5 bg-white rounded-full top-1 left-1" />
                  <div className="absolute w-1 h-1 bg-white/50 rounded-full bottom-1 right-1" />
                </motion.div>
              </div>
            </div>

            {/* Ears */}
            <div className="absolute -left-2 top-3 w-4 h-6 bg-amber-700 rounded-full rotate-12" />
            <div className="absolute -right-2 top-3 w-4 h-6 bg-amber-700 rounded-full -rotate-12" />
          </div>
        </motion.div>

        {/* Body */}
        <motion.div
          className="absolute top-16 left-1/2 -translate-x-1/2 w-20 h-24 bg-gradient-to-br from-amber-600 to-amber-800 rounded-3xl shadow-xl"
          animate={{
            scaleY: isWalking ? [1, 0.96, 1] : 1,
          }}
          transition={{
            duration: 0.6,
            repeat: isWalking ? Infinity : 0,
            ease: 'easeInOut',
          }}
        >
          {/* Chest muscles */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 w-14 h-10 bg-amber-700/40 rounded-2xl" />
          
          {/* Stock chart on chest */}
          <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-end gap-0.5">
            <div className="w-1 h-3 bg-emerald-400 rounded-t" />
            <div className="w-1 h-5 bg-emerald-400 rounded-t" />
            <div className="w-1 h-4 bg-emerald-400 rounded-t" />
            <div className="w-1 h-6 bg-emerald-400 rounded-t" />
            <div className="w-1 h-7 bg-emerald-400 rounded-t" />
          </div>
        </motion.div>

        {/* Arms */}
        <motion.div
          className="absolute top-20 left-2 w-4 h-14 bg-gradient-to-b from-amber-600 to-amber-700 rounded-full shadow-md"
          animate={{
            rotate: isWalking ? [0, -15, 0, 15, 0] : 0,
          }}
          transition={{
            duration: 0.6,
            repeat: isWalking ? Infinity : 0,
            ease: 'easeInOut',
          }}
        />
        <motion.div
          className="absolute top-20 right-2 w-4 h-14 bg-gradient-to-b from-amber-600 to-amber-700 rounded-full shadow-md"
          animate={{
            rotate: isWalking ? [0, 15, 0, -15, 0] : 0,
          }}
          transition={{
            duration: 0.6,
            repeat: isWalking ? Infinity : 0,
            ease: 'easeInOut',
          }}
        />

        {/* Legs */}
        <motion.div
          className="absolute top-36 left-6 w-5 h-16 bg-gradient-to-b from-amber-700 to-amber-900 rounded-full shadow-lg"
          animate={{
            rotate: isWalking ? [0, 20, 0, -10, 0] : 0,
          }}
          transition={{
            duration: 0.8,
            repeat: isWalking ? Infinity : 0,
            ease: 'easeInOut',
          }}
        >
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-3 bg-amber-900 rounded-full" />
        </motion.div>
        <motion.div
          className="absolute top-36 right-6 w-5 h-16 bg-gradient-to-b from-amber-700 to-amber-900 rounded-full shadow-lg"
          animate={{
            rotate: isWalking ? [0, -10, 0, 20, 0] : 0,
          }}
          transition={{
            duration: 0.8,
            repeat: isWalking ? Infinity : 0,
            ease: 'easeInOut',
          }}
        >
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-3 bg-amber-900 rounded-full" />
        </motion.div>

        {/* Tail */}
        <motion.div
          className="absolute top-32 -right-2 w-2 h-12 bg-gradient-to-b from-amber-700 to-amber-600 rounded-full"
          animate={{
            rotate: isWalking ? [10, 25, 10] : [10, 20, 10],
          }}
          transition={{
            duration: isWalking ? 0.6 : 1.5,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          style={{ transformOrigin: 'top center' }}
        >
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3 h-3 bg-amber-500 rounded-full" />
        </motion.div>

        {/* Thought bubble */}
        {lookingAtField && (
          <motion.div
            className="absolute -top-12 -right-28 bg-white rounded-2xl px-4 py-3 shadow-2xl border-2 border-emerald-500"
            initial={{ opacity: 0, scale: 0, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0 }}
          >
            <div className="text-sm font-bold text-slate-800 flex items-center gap-2">
              {emailFocused ? '📊 Bullish on login!' : '🔐 Secure entry!'}
            </div>
            <div className="absolute -bottom-3 left-6 w-4 h-4 bg-white border-b-2 border-r-2 border-emerald-500 transform rotate-45" />
            <div className="absolute -bottom-5 left-4 w-2 h-2 bg-white rounded-full border-2 border-emerald-500" />
          </motion.div>
        )}

        {/* Market ticker on body when idle */}
        {!lookingAtField && !isWalking && (
          <motion.div
            className="absolute top-28 left-1/2 -translate-x-1/2 text-[8px] font-mono text-emerald-400 font-bold"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            ↑ +2.5%
          </motion.div>
        )}
      </div>
    </motion.div>
  )
}
