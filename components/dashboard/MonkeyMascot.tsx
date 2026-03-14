'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect } from 'react'

type MonkeyComment = {
  greeting: string
  notificationComments: Record<string, string[]>
}

const monkeyComments: MonkeyComment = {
  greeting: "Hi! 👋",
  notificationComments: {
    maturity: [
      "Ooh ooh! Money's coming! 🍌",
      "Time to collect those bananas! 💰",
      "Maturity alert! Get ready! 🎯"
    ],
    commission: [
      "Commission time! Cha-ching! 💵",
      "Someone's earning well! 🤑",
      "Sweet commission vibes! ✨"
    ],
    zakat: [
      "Zakat season approaching! 📅",
      "Time to give back! 🤲",
      "Charity calculations ahead! 💫"
    ],
    partner: [
      "Partner activity detected! 👥",
      "Team updates incoming! 🔔",
      "Your partners are busy! 🚀"
    ],
    default: [
      "Check this out! 👀",
      "Important stuff here! ⚡",
      "Don't miss this! 🎯"
    ]
  }
}

export function MonkeyMascot({ 
  isOpen, 
  hoveredType 
}: { 
  isOpen: boolean
  hoveredType: string | null 
}) {
  const [currentComment, setCurrentComment] = useState<string>(monkeyComments.greeting)
  const [isSwinging, setIsSwinging] = useState(false)

  useEffect(() => {
    if (isOpen && !hoveredType) {
      setCurrentComment(monkeyComments.greeting)
      setIsSwinging(true)
    } else if (hoveredType) {
      const comments = monkeyComments.notificationComments[hoveredType] || monkeyComments.notificationComments.default
      const randomComment = comments[Math.floor(Math.random() * comments.length)]
      setCurrentComment(randomComment)
      setIsSwinging(false)
    }
  }, [isOpen, hoveredType])

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* String/rope */}
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 60, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="absolute top-0 right-16 w-0.5 bg-gradient-to-b from-slate-600 to-slate-400 origin-top"
            style={{ transformOrigin: 'top center' }}
          />

          {/* Monkey character */}
          <motion.div
            initial={{ y: -100, opacity: 0, rotate: 0 }}
            animate={{ 
              y: 0, 
              opacity: 1,
              rotate: isSwinging ? [0, 5, -5, 0] : 0
            }}
            exit={{ 
              y: -100, 
              opacity: 0,
              scale: 0.5,
              rotate: -20
            }}
            transition={{ 
              y: { type: "spring", damping: 10, stiffness: 100 },
              opacity: { duration: 0.3 },
              rotate: isSwinging ? { 
                duration: 2, 
                repeat: Infinity, 
                ease: "easeInOut" 
              } : { duration: 0.2 }
            }}
            className="absolute top-12 right-10 z-50"
          >
            {/* Speech bubble */}
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.5, type: "spring", damping: 15 }}
              className="absolute -left-24 top-0 bg-white dark:bg-slate-800 rounded-2xl px-3 py-2 shadow-xl border-2 border-cyan-400 whitespace-nowrap"
            >
              <div className="text-xs font-bold text-slate-800 dark:text-white">
                {currentComment}
              </div>
              {/* Speech bubble tail */}
              <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-full">
                <div className="w-0 h-0 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-l-[8px] border-l-cyan-400" />
                <div className="absolute top-1/2 -translate-y-1/2 right-[2px] w-0 h-0 border-t-[5px] border-t-transparent border-b-[5px] border-b-transparent border-l-[7px] border-l-white dark:border-l-slate-800" />
              </div>
            </motion.div>

            {/* Monkey SVG */}
            <svg width="48" height="48" viewBox="0 0 100 100" className="drop-shadow-2xl">
              <defs>
                <linearGradient id="monkeyBody" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#8B4513" />
                  <stop offset="100%" stopColor="#654321" />
                </linearGradient>
                <linearGradient id="monkeyFace" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#D2691E" />
                  <stop offset="100%" stopColor="#A0522D" />
                </linearGradient>
              </defs>

              {/* Head */}
              <ellipse cx="50" cy="45" rx="28" ry="30" fill="url(#monkeyBody)" />
              
              {/* Ears */}
              <ellipse cx="25" cy="35" rx="12" ry="14" fill="url(#monkeyBody)" />
              <ellipse cx="75" cy="35" rx="12" ry="14" fill="url(#monkeyBody)" />
              <ellipse cx="25" cy="36" rx="8" ry="9" fill="url(#monkeyFace)" />
              <ellipse cx="75" cy="36" rx="8" ry="9" fill="url(#monkeyFace)" />

              {/* Face */}
              <ellipse cx="50" cy="50" rx="20" ry="18" fill="url(#monkeyFace)" />

              {/* Eyes */}
              <motion.g
                animate={{ scaleY: [1, 0.1, 1] }}
                transition={{ duration: 3, repeat: Infinity, repeatDelay: 2 }}
              >
                <ellipse cx="42" cy="45" rx="4" ry="5" fill="#2D1B00" />
                <ellipse cx="58" cy="45" rx="4" ry="5" fill="#2D1B00" />
                <ellipse cx="43" cy="43" rx="1.5" ry="2" fill="white" opacity="0.8" />
                <ellipse cx="59" cy="43" rx="1.5" ry="2" fill="white" opacity="0.8" />
              </motion.g>

              {/* Nose */}
              <ellipse cx="50" cy="52" rx="3" ry="2.5" fill="#8B4513" />

              {/* Mouth */}
              <motion.path
                d="M 45 58 Q 50 62 55 58"
                stroke="#2D1B00"
                strokeWidth="1.5"
                fill="none"
                strokeLinecap="round"
                animate={{ d: hoveredType ? "M 45 58 Q 50 64 55 58" : "M 45 58 Q 50 62 55 58" }}
                transition={{ duration: 0.2 }}
              />

              {/* Arms hanging up */}
              <g>
                <motion.rect
                  x="48"
                  y="8"
                  width="4"
                  height="20"
                  rx="2"
                  fill="url(#monkeyBody)"
                  animate={{ rotate: isSwinging ? [-5, 5, -5] : 0 }}
                  transition={{ duration: 2, repeat: Infinity }}
                  style={{ transformOrigin: '50px 10px' }}
                />
                <circle cx="50" cy="10" r="5" fill="url(#monkeyFace)" />
                <circle cx="48" cy="9" r="1.5" fill="#654321" />
                <circle cx="52" cy="9" r="1.5" fill="#654321" />
                <circle cx="50" cy="11" r="1.5" fill="#654321" />
              </g>

              {/* Tail */}
              <motion.path
                d="M 70 60 Q 85 55 90 45 Q 92 40 88 38"
                stroke="url(#monkeyBody)"
                strokeWidth="5"
                fill="none"
                strokeLinecap="round"
                animate={{ 
                  d: [
                    "M 70 60 Q 85 55 90 45 Q 92 40 88 38",
                    "M 70 60 Q 85 50 92 42 Q 95 38 90 35",
                    "M 70 60 Q 85 55 90 45 Q 92 40 88 38"
                  ]
                }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
              />
            </svg>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
