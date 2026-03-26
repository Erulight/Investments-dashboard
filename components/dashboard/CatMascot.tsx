'use client'

import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { motion, useSpring, AnimatePresence } from 'framer-motion'

type CatState = 'idle' | 'walking' | 'jumping' | 'falling' | 'landing' | 'sitting'

function CatSVG({ state, direction }: { state: CatState; direction: 1 | -1 }) {
  const legPhase = state === 'walking' || state === 'idle'
  const isSitting = state === 'sitting' || state === 'landing'
  const isJumping = state === 'jumping'

  return (
    <svg
      viewBox="0 0 110 90"
      width="66"
      height="54"
      style={{ transform: direction === -1 ? 'scaleX(-1)' : 'none', overflow: 'visible' }}
    >
      {/* Tail */}
      <motion.path
        d={isSitting
          ? 'M20,72 Q8,68 10,55 Q12,42 22,45'
          : 'M18,65 Q2,55 4,38 Q6,22 18,28'}
        stroke="#b08860"
        strokeWidth="7"
        strokeLinecap="round"
        fill="none"
        animate={{ rotate: [0, 12, -8, 12, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        style={{ transformOrigin: '18px 65px' }}
      />

      {/* Body */}
      <ellipse
        cx="55"
        cy={isSitting ? 63 : 58}
        rx="28"
        ry={isSitting ? 20 : 16}
        fill="#c49a6c"
        stroke="#a07848"
        strokeWidth="1.2"
      />

      {/* Belly patch */}
      <ellipse
        cx="58"
        cy={isSitting ? 66 : 61}
        rx="16"
        ry={isSitting ? 13 : 9}
        fill="#e8c99a"
      />

      {/* Back legs (isSitting = tucked) */}
      {!isSitting && (
        <>
          <motion.rect
            x="25" y="68" width="11" height="20" rx="5"
            fill="#b08860"
            stroke="#a07848" strokeWidth="1"
            animate={legPhase ? { rotate: [6, -6, 6] } : { rotate: 0 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            style={{ transformOrigin: '30px 68px' }}
          />
          <motion.rect
            x="40" y="68" width="11" height="20" rx="5"
            fill="#b08860"
            stroke="#a07848" strokeWidth="1"
            animate={legPhase ? { rotate: [-6, 6, -6] } : { rotate: 0 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            style={{ transformOrigin: '45px 68px' }}
          />
        </>
      )}

      {/* Front legs */}
      {isSitting ? (
        <>
          <rect x="62" y="74" width="11" height="14" rx="5" fill="#c49a6c" stroke="#a07848" strokeWidth="1" />
          <rect x="76" y="74" width="11" height="14" rx="5" fill="#c49a6c" stroke="#a07848" strokeWidth="1" />
          <ellipse cx="67" cy="88" rx="8" ry="4" fill="#b08860" />
          <ellipse cx="81" cy="88" rx="8" ry="4" fill="#b08860" />
        </>
      ) : (
        <>
          <motion.rect
            x="62" y="67" width="11" height="22" rx="5"
            fill="#c49a6c"
            stroke="#a07848" strokeWidth="1"
            animate={legPhase ? { rotate: [-6, 6, -6] } : { rotate: 0 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            style={{ transformOrigin: '67px 67px' }}
          />
          <motion.rect
            x="76" y="67" width="11" height="22" rx="5"
            fill="#c49a6c"
            stroke="#a07848" strokeWidth="1"
            animate={legPhase ? { rotate: [6, -6, 6] } : { rotate: 0 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            style={{ transformOrigin: '81px 67px' }}
          />
        </>
      )}

      {/* Head */}
      <circle
        cx="82"
        cy={isSitting ? 44 : 38}
        r="20"
        fill="#c49a6c"
        stroke="#a07848"
        strokeWidth="1.2"
      />

      {/* Left ear */}
      <polygon
        points="68,28 70,12 80,26"
        fill="#c49a6c"
        stroke="#a07848"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <polygon points="70,26 72,14 78,25" fill="#e8a0a0" />

      {/* Right ear */}
      <polygon
        points="88,26 96,12 100,28"
        fill="#c49a6c"
        stroke="#a07848"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <polygon points="90,25 95,14 98,26" fill="#e8a0a0" />

      {/* Eyes */}
      <motion.ellipse
        cx="76"
        cy={isSitting ? 42 : 36}
        rx="4"
        ry={isJumping ? 5 : 3.5}
        fill="#2a1a0e"
        animate={{ scaleY: [1, 0.15, 1, 1, 1] }}
        transition={{ duration: 8, repeat: Infinity, times: [0, 0.03, 0.06, 0.5, 1] }}
      />
      <motion.ellipse
        cx="89"
        cy={isSitting ? 42 : 36}
        rx="4"
        ry={isJumping ? 5 : 3.5}
        fill="#2a1a0e"
        animate={{ scaleY: [1, 0.15, 1, 1, 1] }}
        transition={{ duration: 8, repeat: Infinity, times: [0, 0.03, 0.06, 0.5, 1] }}
      />
      {/* Eye shine */}
      <circle cx="78" cy={isSitting ? 40 : 34} r="1.5" fill="white" />
      <circle cx="91" cy={isSitting ? 40 : 34} r="1.5" fill="white" />

      {/* Nose */}
      <polygon
        points={`82,${isSitting ? 48 : 42} 85,${isSitting ? 46 : 40} 85,${isSitting ? 49 : 43}`}
        fill="#d47070"
      />

      {/* Mouth */}
      <path
        d={`M82,${isSitting ? 49 : 43} Q79,${isSitting ? 52 : 46} 76,${isSitting ? 50 : 44}`}
        stroke="#a07848" fill="none" strokeWidth="1" strokeLinecap="round"
      />
      <path
        d={`M85,${isSitting ? 49 : 43} Q88,${isSitting ? 52 : 46} 90,${isSitting ? 50 : 44}`}
        stroke="#a07848" fill="none" strokeWidth="1" strokeLinecap="round"
      />

      {/* Whiskers left */}
      <line x1="82" y1={isSitting ? 47 : 41} x2="64" y2={isSitting ? 44 : 38} stroke="#88664a" strokeWidth="0.9" />
      <line x1="82" y1={isSitting ? 49 : 43} x2="64" y2={isSitting ? 49 : 43} stroke="#88664a" strokeWidth="0.9" />
      <line x1="82" y1={isSitting ? 47 : 41} x2="64" y2={isSitting ? 52 : 46} stroke="#88664a" strokeWidth="0.9" />

      {/* Whiskers right */}
      <line x1="85" y1={isSitting ? 47 : 41} x2="106" y2={isSitting ? 44 : 38} stroke="#88664a" strokeWidth="0.9" />
      <line x1="85" y1={isSitting ? 49 : 43} x2="106" y2={isSitting ? 49 : 43} stroke="#88664a" strokeWidth="0.9" />
      <line x1="85" y1={isSitting ? 47 : 41} x2="106" y2={isSitting ? 52 : 46} stroke="#88664a" strokeWidth="0.9" />

      {/* Tabby stripes on body */}
      <path d="M45,50 Q55,46 65,50" stroke="#a07848" fill="none" strokeWidth="1.8" strokeLinecap="round" opacity="0.5" />
      <path d="M42,58 Q55,53 68,58" stroke="#a07848" fill="none" strokeWidth="1.8" strokeLinecap="round" opacity="0.4" />
    </svg>
  )
}

const sarcasticComments = [
  "Oh great, another card to visit... 🙄",
  "Yawn... this again?",
  "Do I HAVE to?",
  "Fine, I'll go... *sigh*",
  "You're really into this, huh?",
  "Can't a cat get some rest?",
  "This better be worth it...",
  "Ugh, exercise... 😒",
  "I was napping, you know.",
  "Another day, another card..."
]

export function CatMascot() {
  const [catState, setCatState] = useState<CatState>('sitting')
  const [direction, setDirection] = useState<1 | -1>(1)
  const [targetPos, setTargetPos] = useState<{ x: number; y: number } | null>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [comment, setComment] = useState<string | null>(null)
  const [mousePos, setMousePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const lastScrollY = useRef(0)
  const scrollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeCardId = useRef<string | null>(null)
  const cursorFollowTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const springX = useSpring(pos?.x ?? 0, { stiffness: 120, damping: 18 })
  const springY = useSpring(pos?.y ?? 0, { stiffness: 120, damping: 18 })

  // Initial bottom-right placement (below navbar)
  useLayoutEffect(() => {
    const navbarHeight = 60
    const startX = window.innerWidth - 150
    const startY = window.innerHeight - 110
    setPos({ x: startX, y: startY })
    springX.set(startX)
    springY.set(startY)
  }, [])

  // Apply target position changes
  useEffect(() => {
    if (!targetPos) return
    setPos(targetPos)
    springX.set(targetPos.x)
    springY.set(targetPos.y)
  }, [targetPos])

  // Card hover tracking
  useEffect(() => {
    const cards = document.querySelectorAll('[data-cat-target="true"]')

    const onEnter = (e: Event) => {
      const el = e.currentTarget as HTMLElement
      const cardId = el.getAttribute('data-card-id') || el.id
      activeCardId.current = cardId

      const rect = el.getBoundingClientRect()
      const navbarHeight = 60
      const newX = rect.left + rect.width / 2 - 33
      const newY = Math.max(rect.bottom - 60, navbarHeight + 10)

      const prevX = springX.get()
      setDirection(newX > prevX ? 1 : -1)
      setCatState('jumping')
      setTargetPos({ x: newX, y: newY })
      
      // Show sarcastic comment
      const randomComment = sarcasticComments[Math.floor(Math.random() * sarcasticComments.length)]
      setComment(randomComment)
      setTimeout(() => setComment(null), 3000)

      setTimeout(() => setCatState('sitting'), 600)
    }

    const onLeave = () => {
      activeCardId.current = null
      setTimeout(() => {
        if (!activeCardId.current) setCatState('sitting')
      }, 300)
    }

    cards.forEach(card => {
      card.addEventListener('mouseenter', onEnter)
      card.addEventListener('mouseleave', onLeave)
    })

    return () => {
      cards.forEach(card => {
        card.removeEventListener('mouseenter', onEnter)
        card.removeEventListener('mouseleave', onLeave)
      })
    }
  }, [])

  // Scroll follow
  useEffect(() => {
    const onScroll = () => {
      const currentY = window.scrollY
      const delta = currentY - lastScrollY.current
      lastScrollY.current = currentY

      if (Math.abs(delta) < 10) return

      setCatState('walking')
      if (scrollTimeout.current) clearTimeout(scrollTimeout.current)

      // Walk toward nearest visible card
      const cards = Array.from(document.querySelectorAll('[data-cat-target="true"]'))
      let nearestCard: Element | null = null
      let minDist = Infinity

      for (const card of cards) {
        const rect = (card as Element).getBoundingClientRect()
        if (rect.top < 0 || rect.bottom > window.innerHeight) continue
        const mid = rect.top + rect.height / 2
        const dist = Math.abs(mid - window.innerHeight / 2)
        if (dist < minDist) {
          minDist = dist
          nearestCard = card
        }
      }

      if (nearestCard) {
        const rect = (nearestCard as Element).getBoundingClientRect()
        const navbarHeight = 60
        const newX = rect.left + rect.width / 2 - 33
        const newY = Math.max(rect.bottom - 60 + window.scrollY, navbarHeight + 10)
        const prevX = springX.get()
        setDirection(newX > prevX ? 1 : -1)
        setTargetPos({ x: newX, y: newY })
      }

      scrollTimeout.current = setTimeout(() => {
        setCatState('sitting')
      }, 800)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Cursor following from distance
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY })
      
      // Only follow cursor if not on a card
      if (activeCardId.current) return
      
      if (cursorFollowTimeout.current) clearTimeout(cursorFollowTimeout.current)
      
      cursorFollowTimeout.current = setTimeout(() => {
        const navbarHeight = 60
        const currentX = springX.get()
        const currentY = springY.get()
        
        // Calculate distance from cursor
        const dx = e.clientX - currentX
        const dy = e.clientY - currentY
        const distance = Math.sqrt(dx * dx + dy * dy)
        
        // Follow from a distance (150-300px range)
        if (distance > 300) {
          const angle = Math.atan2(dy, dx)
          const followDistance = 200
          const newX = e.clientX - Math.cos(angle) * followDistance
          const newY = Math.max(e.clientY - Math.sin(angle) * followDistance, navbarHeight + 10)
          
          const prevX = springX.get()
          setDirection(newX > prevX ? 1 : -1)
          setCatState('walking')
          setTargetPos({ x: newX, y: newY })
          
          setTimeout(() => setCatState('sitting'), 800)
        }
      }, 100)
    }
    
    window.addEventListener('mousemove', onMouseMove)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      if (cursorFollowTimeout.current) clearTimeout(cursorFollowTimeout.current)
    }
  }, [])

  if (!pos) return null

  return (
    <>
    <motion.div
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        x: springX,
        y: springY,
        zIndex: 999999,
        pointerEvents: 'none',
        willChange: 'transform',
      }}
      animate={
        catState === 'jumping'
          ? { y: [0, -30, 0], scaleY: [1, 1.15, 0.9, 1] }
          : catState === 'walking'
          ? { scaleX: [1, 1.04, 1] }
          : { scaleY: [1, 1.02, 1] }
      }
      transition={
        catState === 'jumping'
          ? { duration: 0.5, ease: 'easeOut' }
          : catState === 'walking'
          ? { duration: 0.4, repeat: Infinity }
          : { duration: 2.5, repeat: Infinity, ease: 'easeInOut' }
      }
    >
      <CatSVG state={catState} direction={direction} />
    </motion.div>
    
    {/* Sarcastic speech bubble */}
    <AnimatePresence>
      {comment && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 10 }}
          transition={{ duration: 0.2 }}
          style={{
            position: 'fixed',
            left: springX.get() + 35,
            top: springY.get() - 30,
            zIndex: 1000000,
            pointerEvents: 'none',
          }}
        >
          <div className="relative">
            <div className="bg-white/40 backdrop-blur-md border border-gray-200/50 rounded-xl px-2 py-1.5 shadow-md max-w-[120px]">
              <p className="text-[10px] font-medium text-gray-800 leading-tight">{comment}</p>
            </div>
            {/* Speech bubble tail */}
            <div className="absolute left-3 -bottom-1.5 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-white/40" />
            <div className="absolute left-[13px] -bottom-[7px] w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[5px] border-t-gray-200/50" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
    </>
  )
}
