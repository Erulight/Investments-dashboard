'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, useMotionValue, useSpring, useTransform, AnimatePresence } from 'framer-motion'

export function CatMascot() {
  const [hoveredCard, setHoveredCard] = useState<string | null>(null)
  const [catPosition, setCatPosition] = useState({ x: 0, y: 0 })
  const [isJumping, setIsJumping] = useState(false)
  const [isFalling, setIsFalling] = useState(false)
  const [currentExpression, setCurrentExpression] = useState('😺')
  const scrollY = useMotionValue(0)
  const lastScrollY = useRef(0)

  // Smooth spring animations
  const catX = useSpring(catPosition.x, { stiffness: 200, damping: 20 })
  const catY = useSpring(catPosition.y, { stiffness: 150, damping: 15 })

  // Cat expressions for different states
  const expressions = {
    idle: '😺',
    jumping: '😸',
    falling: '🙀',
    landing: '😹',
    excited: '😻',
  }

  useEffect(() => {
    const handleScroll = () => {
      const currentScroll = window.scrollY
      scrollY.set(currentScroll)

      // Detect scrolling down
      if (currentScroll > lastScrollY.current + 50) {
        setIsFalling(true)
        setCurrentExpression(expressions.falling)
        
        // Find nearest card to catch onto
        const cards = document.querySelectorAll('[data-cat-target="true"]')
        if (cards.length > 0) {
          const viewportMiddle = window.innerHeight / 2
          let nearestCard: Element | null = null
          let minDistance = Infinity

          cards.forEach(card => {
            const rect = card.getBoundingClientRect()
            const cardMiddle = rect.top + rect.height / 2
            const distance = Math.abs(cardMiddle - viewportMiddle)
            
            if (distance < minDistance && rect.top > 0 && rect.top < window.innerHeight) {
              minDistance = distance
              nearestCard = card
            }
          })

          if (nearestCard) {
            const rect = (nearestCard as Element).getBoundingClientRect()
            setCatPosition({
              x: rect.right - 60,
              y: rect.top - 40
            })
            setTimeout(() => {
              setIsFalling(false)
              setCurrentExpression(expressions.landing)
              setTimeout(() => setCurrentExpression(expressions.idle), 1000)
            }, 600)
          }
        }
      }
      
      lastScrollY.current = currentScroll
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    if (!hoveredCard) return

    const handleMouseMove = (e: MouseEvent) => {
      if (hoveredCard) {
        const card = document.querySelector(`[data-card-id="${hoveredCard}"]`)
        if (card) {
          const rect = card.getBoundingClientRect()
          
          // Jump to the hovered card position
          setCatPosition({
            x: rect.right - 60,
            y: rect.top - 40
          })
          
          if (!isJumping) {
            setIsJumping(true)
            setCurrentExpression(expressions.jumping)
            setTimeout(() => {
              setIsJumping(false)
              setCurrentExpression(expressions.excited)
              setTimeout(() => setCurrentExpression(expressions.idle), 800)
            }, 400)
          }
        }
      }
    }

    const handleCardHover = (e: Event) => {
      const target = e.currentTarget as HTMLElement
      const cardId = target.getAttribute('data-card-id')
      if (cardId) {
        setHoveredCard(cardId)
      }
    }

    const handleCardLeave = () => {
      setTimeout(() => setHoveredCard(null), 300)
    }

    // Attach hover listeners to all stat cards
    const cards = document.querySelectorAll('[data-card-id]')
    cards.forEach(card => {
      card.addEventListener('mouseenter', handleCardHover)
      card.addEventListener('mouseleave', handleCardLeave)
    })

    window.addEventListener('mousemove', handleMouseMove)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      cards.forEach(card => {
        card.removeEventListener('mouseenter', handleCardHover)
        card.removeEventListener('mouseleave', handleCardLeave)
      })
    }
  }, [hoveredCard, isJumping])

  // Initial position - top right
  useEffect(() => {
    setCatPosition({ x: window.innerWidth - 120, y: 20 })
  }, [])

  return (
    <AnimatePresence>
      <motion.div
        style={{
          position: 'fixed',
          left: 0,
          top: 0,
          x: catX,
          y: catY,
          zIndex: 9999,
          pointerEvents: 'none',
        }}
        initial={{ opacity: 0, scale: 0 }}
        animate={{ 
          opacity: 1, 
          scale: 1,
          rotate: isFalling ? [0, -10, 10, -5, 0] : isJumping ? [0, -15, 0] : 0,
        }}
        transition={{ 
          duration: isFalling ? 0.6 : isJumping ? 0.4 : 0.3,
          rotate: {
            repeat: isFalling ? 2 : 0,
            duration: 0.3,
          }
        }}
        className="select-none"
      >
        {/* Cat body with bounce effect */}
        <motion.div
          animate={isJumping ? {
            y: [-20, -40, -20, 0],
            scale: [1, 1.1, 1.05, 1],
          } : isFalling ? {
            y: [0, 100, 50, 0],
            rotate: [0, 180, 360],
          } : {
            y: [0, -5, 0],
          }}
          transition={{
            duration: isFalling ? 0.8 : isJumping ? 0.6 : 2,
            repeat: !isJumping && !isFalling ? Infinity : 0,
            ease: isFalling ? "easeIn" : "easeInOut",
          }}
          className="relative"
        >
          {/* Shadow */}
          <motion.div
            className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-3 bg-black/20 rounded-full blur-sm"
            animate={{
              scale: isJumping ? [1, 0.5, 1] : [1, 1.1, 1],
              opacity: isJumping ? [0.3, 0.1, 0.3] : [0.2, 0.3, 0.2],
            }}
            transition={{ duration: 2, repeat: Infinity }}
          />

          {/* Main cat emoji with paws */}
          <div className="relative">
            <motion.div
              className="text-5xl filter drop-shadow-lg"
              animate={{
                scale: hoveredCard ? [1, 1.2, 1.1] : [1, 1.05, 1],
              }}
              transition={{ duration: 0.5, repeat: hoveredCard ? Infinity : 0 }}
            >
              {currentExpression}
            </motion.div>

            {/* Paws when jumping */}
            {isJumping && (
              <motion.div
                className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-xl"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 1, 0], y: [0, 5, 10] }}
                transition={{ duration: 0.4 }}
              >
                🐾
              </motion.div>
            )}

            {/* Sparkles when excited */}
            {currentExpression === expressions.excited && (
              <>
                <motion.span
                  className="absolute -top-2 -left-2 text-xl"
                  animate={{ 
                    scale: [0, 1, 0],
                    rotate: [0, 180, 360],
                  }}
                  transition={{ duration: 0.6 }}
                >
                  ✨
                </motion.span>
                <motion.span
                  className="absolute -top-2 -right-2 text-xl"
                  animate={{ 
                    scale: [0, 1, 0],
                    rotate: [0, -180, -360],
                  }}
                  transition={{ duration: 0.6, delay: 0.1 }}
                >
                  ✨
                </motion.span>
              </>
            )}

            {/* Hearts when landing */}
            {currentExpression === expressions.landing && (
              <motion.div
                className="absolute -top-4 left-1/2 -translate-x-1/2 text-2xl"
                initial={{ y: 0, opacity: 1 }}
                animate={{ y: -20, opacity: 0 }}
                transition={{ duration: 1 }}
              >
                💕
              </motion.div>
            )}
          </div>

          {/* Tail wagging */}
          <motion.div
            className="absolute -right-6 top-2 text-3xl origin-left"
            animate={{
              rotate: hoveredCard ? [-20, 20] : [-10, 10],
            }}
            transition={{
              duration: hoveredCard ? 0.3 : 0.8,
              repeat: Infinity,
              repeatType: "reverse",
            }}
          >
            🦴
          </motion.div>
        </motion.div>

        {/* Speech bubble on hover */}
        <AnimatePresence>
          {hoveredCard && !isJumping && (
            <motion.div
              initial={{ opacity: 0, scale: 0, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0 }}
              className="absolute -top-12 left-1/2 -translate-x-1/2 bg-white text-slate-800 px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap shadow-lg"
            >
              Meow! 📊
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-white" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  )
}
