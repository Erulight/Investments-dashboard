'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect } from 'react'

interface FoxMascotProps {
  profit: number
  isLoading?: boolean
}

const snarkyComments = {
  bigWin: [
    "Look at you, Warren Buffett! 🎉",
    "Someone's making it rain! 💰",
    "Fancy pants investor over here!",
    "Not bad for a human! 🦊",
    "Keep this up and I'll ask YOU for tips!",
  ],
  smallWin: [
    "Baby steps, buddy. Baby steps.",
    "It's something, I guess? 🤷‍♂️",
    "Rome wasn't built in a day!",
    "Every journey starts somewhere...",
    "Progress is progress! Sort of.",
  ],
  loss: [
    "Oof. That's... unfortunate. 😬",
    "Maybe try the other strategy?",
    "It happens to the best of us!",
    "This is fine. Everything is fine. 🔥",
    "Buy high, sell low? Bold strategy!",
  ],
  idle: [
    "Just vibing here... 🦊",
    "When moon? 🌙",
    "Wake me up when profits arrive.",
    "Watching the charts like... 👀",
    "*yawns in fox*",
  ],
}

export function FoxMascot({ profit, isLoading }: FoxMascotProps) {
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [comment, setComment] = useState('')
  const [showComment, setShowComment] = useState(false)
  const [mood, setMood] = useState<'happy' | 'neutral' | 'sad'>('neutral')
  const [isJumping, setIsJumping] = useState(false)

  useEffect(() => {
    // Determine mood based on profit
    if (profit > 1000) {
      setMood('happy')
      const comments = snarkyComments.bigWin
      setComment(comments[Math.floor(Math.random() * comments.length)])
    } else if (profit > 0) {
      setMood('neutral')
      const comments = snarkyComments.smallWin
      setComment(comments[Math.floor(Math.random() * comments.length)])
    } else if (profit < -100) {
      setMood('sad')
      const comments = snarkyComments.loss
      setComment(comments[Math.floor(Math.random() * comments.length)])
    } else {
      setMood('neutral')
      const comments = snarkyComments.idle
      setComment(comments[Math.floor(Math.random() * comments.length)])
    }
  }, [profit])

  useEffect(() => {
    // Random movement every 5-8 seconds
    const interval = setInterval(() => {
      const newX = Math.random() * 100 - 50
      const newY = Math.random() * 30 - 15
      setPosition({ x: newX, y: newY })
      
      // Occasionally show comment
      if (Math.random() > 0.6) {
        setShowComment(true)
        setTimeout(() => setShowComment(false), 3000)
      }

      // Occasionally jump
      if (Math.random() > 0.7) {
        setIsJumping(true)
        setTimeout(() => setIsJumping(false), 600)
      }
    }, Math.random() * 3000 + 5000)

    return () => clearInterval(interval)
  }, [])

  const foxColor = mood === 'happy' ? '#34d399' : mood === 'sad' ? '#f87171' : '#fbbf24'

  return (
    <motion.div
      className="fixed bottom-8 right-8 z-50 pointer-events-none"
      initial={{ opacity: 0, scale: 0 }}
      animate={{ 
        opacity: isLoading ? 0.3 : 1, 
        scale: isLoading ? 0.8 : 1,
        x: position.x,
        y: position.y,
      }}
      transition={{ 
        opacity: { duration: 0.3 },
        scale: { duration: 0.3 },
        x: { type: 'spring', stiffness: 100, damping: 15 },
        y: { type: 'spring', stiffness: 100, damping: 15 },
      }}
    >
      {/* Speech bubble */}
      <AnimatePresence>
        {showComment && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.8 }}
            className="absolute bottom-full right-0 mb-4 mr-4"
          >
            <div className="bg-slate-900/95 backdrop-blur-sm text-white px-4 py-2 rounded-2xl rounded-br-none shadow-2xl border border-white/10 max-w-xs">
              <p className="text-sm font-medium whitespace-nowrap">{comment}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fox character */}
      <motion.div
        animate={isJumping ? { y: [-20, 0] } : {}}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="relative"
      >
        {/* Glow effect */}
        <motion.div
          className="absolute inset-0 blur-xl opacity-60"
          style={{ backgroundColor: foxColor }}
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.4, 0.6, 0.4],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />

        {/* Fox SVG */}
        <svg
          width="80"
          height="80"
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="relative drop-shadow-2xl"
        >
          {/* Body */}
          <ellipse cx="50" cy="65" rx="25" ry="20" fill={foxColor} opacity="0.9" />
          
          {/* Head */}
          <circle cx="50" cy="40" r="20" fill={foxColor} />
          
          {/* Ears */}
          <motion.path
            d="M 35 30 L 30 15 L 40 25 Z"
            fill={foxColor}
            animate={{ rotate: [0, -5, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            style={{ originX: '35px', originY: '25px' }}
          />
          <motion.path
            d="M 65 30 L 70 15 L 60 25 Z"
            fill={foxColor}
            animate={{ rotate: [0, 5, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            style={{ originX: '65px', originY: '25px' }}
          />
          
          {/* Ear details */}
          <path d="M 35 28 L 33 20 L 38 26 Z" fill="#fff" opacity="0.6" />
          <path d="M 65 28 L 67 20 L 62 26 Z" fill="#fff" opacity="0.6" />
          
          {/* Eyes */}
          <motion.g
            animate={mood === 'happy' ? { scaleY: 0.6 } : mood === 'sad' ? { scaleY: 0.3 } : {}}
          >
            <circle cx="43" cy="38" r="3" fill="#1e293b" />
            <circle cx="57" cy="38" r="3" fill="#1e293b" />
            <circle cx="44" cy="37" r="1.5" fill="#fff" opacity="0.8" />
            <circle cx="58" cy="37" r="1.5" fill="#fff" opacity="0.8" />
          </motion.g>
          
          {/* Nose */}
          <circle cx="50" cy="45" r="2" fill="#1e293b" />
          
          {/* Mouth */}
          <motion.path
            d={mood === 'happy' 
              ? "M 45 48 Q 50 52 55 48" 
              : mood === 'sad'
              ? "M 45 50 Q 50 47 55 50"
              : "M 45 49 L 55 49"
            }
            stroke="#1e293b"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
          />
          
          {/* Tail */}
          <motion.path
            d="M 70 70 Q 85 65 90 55"
            stroke={foxColor}
            strokeWidth="8"
            fill="none"
            strokeLinecap="round"
            animate={{
              d: [
                "M 70 70 Q 85 65 90 55",
                "M 70 70 Q 85 60 88 50",
                "M 70 70 Q 85 65 90 55",
              ],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
          <motion.path
            d="M 70 70 Q 85 65 90 55"
            stroke="#fff"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
            opacity="0.6"
            animate={{
              d: [
                "M 70 70 Q 85 65 90 55",
                "M 70 70 Q 85 60 88 50",
                "M 70 70 Q 85 65 90 55",
              ],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
          
          {/* Paws */}
          <ellipse cx="40" cy="82" rx="6" ry="4" fill={foxColor} opacity="0.8" />
          <ellipse cx="60" cy="82" rx="6" ry="4" fill={foxColor} opacity="0.8" />
        </svg>
      </motion.div>
    </motion.div>
  )
}
