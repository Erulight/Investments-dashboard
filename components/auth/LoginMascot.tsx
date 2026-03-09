'use client'

import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'

interface LoginMascotProps {
  emailFocused: boolean
  passwordFocused: boolean
  emailRef: React.RefObject<HTMLInputElement | null>
  passwordRef: React.RefObject<HTMLInputElement | null>
}

export function LoginMascot({ emailFocused, passwordFocused, emailRef, passwordRef }: LoginMascotProps) {
  const mascotRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [targetPosition, setTargetPosition] = useState({ x: 0, y: 0 })
  const [isWalking, setIsWalking] = useState(false)
  const [direction, setDirection] = useState<'left' | 'right'>('right')
  
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)
  
  const eyeX = useSpring(useTransform(mouseX, [-300, 300], [-8, 8]), { stiffness: 150, damping: 15 })
  const eyeY = useSpring(useTransform(mouseY, [-300, 300], [-6, 6]), { stiffness: 150, damping: 15 })

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
      setTargetPosition({ x: rect.left - 100, y: rect.top - 50 })
      setIsWalking(true)
    } else if (passwordFocused && passwordRef.current) {
      const rect = passwordRef.current.getBoundingClientRect()
      setTargetPosition({ x: rect.left - 100, y: rect.top - 50 })
      setIsWalking(true)
    } else {
      const randomWalk = () => {
        const newX = Math.random() * (window.innerWidth - 200)
        const newY = Math.random() * (window.innerHeight - 200)
        setTargetPosition({ x: newX, y: newY })
        setIsWalking(true)
      }
      
      const interval = setInterval(randomWalk, 5000)
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
        
        const speed = 2
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
      transition={{ duration: 0.5 }}
    >
      {/* Character body */}
      <div className="relative">
        {/* Head */}
        <motion.div
          className="relative w-20 h-20 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full shadow-lg"
          animate={{
            y: isWalking ? [0, -4, 0] : 0,
          }}
          transition={{
            duration: 0.4,
            repeat: isWalking ? Infinity : 0,
            ease: 'easeInOut',
          }}
        >
          {/* Eyes container */}
          <div className="absolute inset-0 flex items-center justify-center gap-3 mt-2">
            {/* Left eye */}
            <div className="relative w-6 h-7 bg-white rounded-full overflow-hidden shadow-inner">
              <motion.div
                className="absolute w-3 h-3 bg-slate-900 rounded-full top-1/2 left-1/2"
                style={{
                  x: lookingAtField ? (direction === 'left' ? -4 : 4) : eyeX,
                  y: lookingAtField ? -2 : eyeY,
                  translateX: '-50%',
                  translateY: '-50%',
                }}
              >
                <div className="absolute w-1 h-1 bg-white rounded-full top-1 left-1" />
              </motion.div>
            </div>
            
            {/* Right eye */}
            <div className="relative w-6 h-7 bg-white rounded-full overflow-hidden shadow-inner">
              <motion.div
                className="absolute w-3 h-3 bg-slate-900 rounded-full top-1/2 left-1/2"
                style={{
                  x: lookingAtField ? (direction === 'left' ? -4 : 4) : eyeX,
                  y: lookingAtField ? -2 : eyeY,
                  translateX: '-50%',
                  translateY: '-50%',
                }}
              >
                <div className="absolute w-1 h-1 bg-white rounded-full top-1 left-1" />
              </motion.div>
            </div>
          </div>

          {/* Mouth */}
          <motion.div
            className="absolute bottom-4 left-1/2 transform -translate-x-1/2"
            animate={{
              scaleX: lookingAtField ? 1.2 : 1,
            }}
          >
            <div className="w-8 h-3 border-b-2 border-slate-800 rounded-b-full" />
          </motion.div>

          {/* Blush */}
          {lookingAtField && (
            <>
              <motion.div
                className="absolute w-4 h-3 bg-pink-400/60 rounded-full left-2 top-12"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              />
              <motion.div
                className="absolute w-4 h-3 bg-pink-400/60 rounded-full right-2 top-12"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              />
            </>
          )}
        </motion.div>

        {/* Body */}
        <motion.div
          className="w-14 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl mx-auto mt-1 shadow-md"
          animate={{
            scaleY: isWalking ? [1, 0.95, 1] : 1,
          }}
          transition={{
            duration: 0.4,
            repeat: isWalking ? Infinity : 0,
            ease: 'easeInOut',
          }}
        />

        {/* Arms */}
        <motion.div
          className="absolute top-20 -left-2 w-3 h-10 bg-gradient-to-b from-blue-500 to-blue-600 rounded-full"
          animate={{
            rotate: isWalking ? [0, -20, 0] : 0,
          }}
          transition={{
            duration: 0.4,
            repeat: isWalking ? Infinity : 0,
            ease: 'easeInOut',
          }}
        />
        <motion.div
          className="absolute top-20 -right-2 w-3 h-10 bg-gradient-to-b from-blue-500 to-blue-600 rounded-full"
          animate={{
            rotate: isWalking ? [0, 20, 0] : 0,
          }}
          transition={{
            duration: 0.4,
            repeat: isWalking ? Infinity : 0,
            ease: 'easeInOut',
            delay: 0.2,
          }}
        />

        {/* Legs */}
        <motion.div
          className="absolute top-32 left-3 w-4 h-12 bg-gradient-to-b from-slate-700 to-slate-800 rounded-full"
          animate={{
            rotate: isWalking ? [0, 15, 0, -15, 0] : 0,
          }}
          transition={{
            duration: 0.8,
            repeat: isWalking ? Infinity : 0,
            ease: 'easeInOut',
          }}
        />
        <motion.div
          className="absolute top-32 right-3 w-4 h-12 bg-gradient-to-b from-slate-700 to-slate-800 rounded-full"
          animate={{
            rotate: isWalking ? [0, -15, 0, 15, 0] : 0,
          }}
          transition={{
            duration: 0.8,
            repeat: isWalking ? Infinity : 0,
            ease: 'easeInOut',
          }}
        />

        {/* Thought bubble when looking at fields */}
        {lookingAtField && (
          <motion.div
            className="absolute -top-16 -right-20 bg-white rounded-2xl px-4 py-2 shadow-lg"
            initial={{ opacity: 0, scale: 0, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0 }}
          >
            <div className="text-xs font-medium text-slate-700">
              {emailFocused ? '📧 Email?' : '🔒 Password?'}
            </div>
            <div className="absolute -bottom-2 left-4 w-3 h-3 bg-white transform rotate-45" />
          </motion.div>
        )}
      </div>
    </motion.div>
  )
}
