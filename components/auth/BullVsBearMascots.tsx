'use client'

import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'

interface BullVsBearMascotsProps {
  emailFocused: boolean
  passwordFocused: boolean
  loginError: boolean
}

export function BullVsBearMascots({ emailFocused, passwordFocused, loginError }: BullVsBearMascotsProps) {
  const [bullMood, setBullMood] = useState<'angry' | 'laughing' | 'fighting'>('angry')
  const [bearMood, setBearMood] = useState<'angry' | 'laughing' | 'fighting'>('angry')
  const [isFighting, setIsFighting] = useState(true)

  useEffect(() => {
    if (loginError) {
      setBullMood('laughing')
      setBearMood('laughing')
      setTimeout(() => {
        setBullMood('angry')
        setBearMood('angry')
      }, 3000)
    } else if (emailFocused || passwordFocused) {
      setBullMood('angry')
      setBearMood('angry')
      setIsFighting(false)
    } else {
      setIsFighting(true)
      const interval = setInterval(() => {
        setBullMood(prev => prev === 'fighting' ? 'angry' : 'fighting')
        setBearMood(prev => prev === 'fighting' ? 'angry' : 'fighting')
      }, 4000)
      return () => clearInterval(interval)
    }
  }, [loginError, emailFocused, passwordFocused])

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {/* Bull (Left) */}
      <motion.div
        className="absolute left-[15%] top-1/2 -translate-y-1/2"
        animate={{
          x: isFighting ? [0, 30, 0] : 0,
          rotate: isFighting ? [0, -5, 0] : 0,
        }}
        transition={{
          duration: 1.5,
          repeat: isFighting ? Infinity : 0,
          ease: 'easeInOut',
        }}
      >
        <svg width="180" height="180" viewBox="0 0 180 180" className="drop-shadow-2xl">
          {/* Bull Body */}
          <defs>
            <linearGradient id="bullGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#d97706" />
              <stop offset="100%" stopColor="#92400e" />
            </linearGradient>
            <filter id="bullShadow">
              <feDropShadow dx="0" dy="4" stdDeviation="4" floodOpacity="0.3"/>
            </filter>
          </defs>
          
          {/* Head */}
          <ellipse cx="90" cy="70" rx="45" ry="40" fill="url(#bullGradient)" filter="url(#bullShadow)"/>
          
          {/* Horns */}
          <path d="M 60 50 Q 55 35 50 30 L 55 32 Q 58 40 60 50" fill="#fbbf24" stroke="#d97706" strokeWidth="2"/>
          <path d="M 120 50 Q 125 35 130 30 L 125 32 Q 122 40 120 50" fill="#fbbf24" stroke="#d97706" strokeWidth="2"/>
          
          {/* Ears */}
          <ellipse cx="55" cy="60" rx="12" ry="18" fill="#b45309"/>
          <ellipse cx="125" cy="60" rx="12" ry="18" fill="#b45309"/>
          
          {/* Eyes */}
          <g>
            {bullMood === 'laughing' ? (
              <>
                <path d="M 70 65 Q 75 70 80 65" stroke="#000" strokeWidth="3" fill="none" strokeLinecap="round"/>
                <path d="M 100 65 Q 105 70 110 65" stroke="#000" strokeWidth="3" fill="none" strokeLinecap="round"/>
              </>
            ) : (
              <>
                <ellipse cx="75" cy="65" rx="8" ry="10" fill="#fff"/>
                <ellipse cx="75" cy="67" rx="5" ry="6" fill="#000"/>
                <ellipse cx="105" cy="65" rx="8" ry="10" fill="#fff"/>
                <ellipse cx="105" cy="67" rx="5" ry="6" fill="#000"/>
                {bullMood === 'angry' && (
                  <>
                    <path d="M 65 58 L 80 62" stroke="#000" strokeWidth="3" strokeLinecap="round"/>
                    <path d="M 115 58 L 100 62" stroke="#000" strokeWidth="3" strokeLinecap="round"/>
                  </>
                )}
              </>
            )}
          </g>
          
          {/* Snout */}
          <ellipse cx="90" cy="85" rx="25" ry="20" fill="#d97706"/>
          <ellipse cx="85" cy="88" rx="4" ry="5" fill="#78350f"/>
          <ellipse cx="95" cy="88" rx="4" ry="5" fill="#78350f"/>
          
          {/* Mouth */}
          {bullMood === 'laughing' ? (
            <path d="M 75 95 Q 90 105 105 95" stroke="#000" strokeWidth="3" fill="none" strokeLinecap="round"/>
          ) : (
            <path d="M 75 98 Q 90 95 105 98" stroke="#000" strokeWidth="3" fill="none" strokeLinecap="round"/>
          )}
          
          {/* Body */}
          <ellipse cx="90" cy="130" rx="50" ry="45" fill="url(#bullGradient)" filter="url(#bullShadow)"/>
          
          {/* Legs */}
          <rect x="65" y="160" width="15" height="35" rx="7" fill="#b45309"/>
          <rect x="100" y="160" width="15" height="35" rx="7" fill="#b45309"/>
          
          {/* Hooves */}
          <ellipse cx="72" cy="195" rx="10" ry="6" fill="#78350f"/>
          <ellipse cx="107" cy="195" rx="10" ry="6" fill="#78350f"/>
          
          {/* Arms - Fists */}
          <motion.g
            animate={{
              rotate: isFighting ? [0, -20, 0] : 0,
            }}
            transition={{
              duration: 0.4,
              repeat: isFighting ? Infinity : 0,
            }}
            style={{ transformOrigin: '50px 120px' }}
          >
            <ellipse cx="50" cy="120" rx="12" ry="18" fill="#d97706"/>
            <circle cx="45" cy="135" r="10" fill="#b45309"/>
          </motion.g>
          
          <motion.g
            animate={{
              rotate: isFighting ? [0, 20, 0] : 0,
            }}
            transition={{
              duration: 0.4,
              repeat: isFighting ? Infinity : 0,
              delay: 0.2,
            }}
            style={{ transformOrigin: '130px 120px' }}
          >
            <ellipse cx="130" cy="120" rx="12" ry="18" fill="#d97706"/>
            <circle cx="135" cy="135" r="10" fill="#b45309"/>
          </motion.g>
          
          {/* Angry steam */}
          {bullMood === 'angry' && (
            <>
              <motion.circle
                cx="60"
                cy="45"
                r="3"
                fill="#ef4444"
                animate={{ y: [-5, -15], opacity: [1, 0] }}
                transition={{ duration: 1, repeat: Infinity }}
              />
              <motion.circle
                cx="120"
                cy="45"
                r="3"
                fill="#ef4444"
                animate={{ y: [-5, -15], opacity: [1, 0] }}
                transition={{ duration: 1, repeat: Infinity, delay: 0.5 }}
              />
            </>
          )}
        </svg>
        
        {/* Speech bubble */}
        {(emailFocused || passwordFocused) && (
          <motion.div
            className="absolute -top-16 left-1/2 -translate-x-1/2 bg-red-500 text-white px-4 py-2 rounded-lg font-bold text-sm whitespace-nowrap"
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            GET LOST! 🐂
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-8 border-r-8 border-t-8 border-transparent border-t-red-500" />
          </motion.div>
        )}
        
        {loginError && (
          <motion.div
            className="absolute -top-16 left-1/2 -translate-x-1/2 bg-yellow-500 text-black px-4 py-2 rounded-lg font-bold text-sm"
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            HAHA! WRONG! 😂
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-8 border-r-8 border-t-8 border-transparent border-t-yellow-500" />
          </motion.div>
        )}
      </motion.div>

      {/* Bear (Right) */}
      <motion.div
        className="absolute right-[15%] top-1/2 -translate-y-1/2"
        animate={{
          x: isFighting ? [0, -30, 0] : 0,
          rotate: isFighting ? [0, 5, 0] : 0,
        }}
        transition={{
          duration: 0.8,
          repeat: isFighting ? Infinity : 0,
          ease: 'easeInOut',
        }}
      >
        <svg width="180" height="180" viewBox="0 0 180 180" className="drop-shadow-2xl">
          {/* Bear Body */}
          <defs>
            <linearGradient id="bearGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#7c2d12" />
              <stop offset="100%" stopColor="#431407" />
            </linearGradient>
            <filter id="bearShadow">
              <feDropShadow dx="0" dy="4" stdDeviation="4" floodOpacity="0.3"/>
            </filter>
          </defs>
          
          {/* Head */}
          <ellipse cx="90" cy="70" rx="48" ry="42" fill="url(#bearGradient)" filter="url(#bearShadow)"/>
          
          {/* Ears */}
          <circle cx="55" cy="45" r="18" fill="#7c2d12"/>
          <circle cx="55" cy="45" r="12" fill="#9a3412"/>
          <circle cx="125" cy="45" r="18" fill="#7c2d12"/>
          <circle cx="125" cy="45" r="12" fill="#9a3412"/>
          
          {/* Eyes */}
          <g>
            {bearMood === 'laughing' ? (
              <>
                <path d="M 70 65 Q 75 70 80 65" stroke="#000" strokeWidth="3" fill="none" strokeLinecap="round"/>
                <path d="M 100 65 Q 105 70 110 65" stroke="#000" strokeWidth="3" fill="none" strokeLinecap="round"/>
              </>
            ) : (
              <>
                <ellipse cx="75" cy="65" rx="7" ry="9" fill="#fff"/>
                <ellipse cx="75" cy="67" rx="4" ry="5" fill="#000"/>
                <ellipse cx="105" cy="65" rx="7" ry="9" fill="#fff"/>
                <ellipse cx="105" cy="67" rx="4" ry="5" fill="#000"/>
                {bearMood === 'angry' && (
                  <>
                    <path d="M 65 58 L 80 62" stroke="#000" strokeWidth="3" strokeLinecap="round"/>
                    <path d="M 115 58 L 100 62" stroke="#000" strokeWidth="3" strokeLinecap="round"/>
                  </>
                )}
              </>
            )}
          </g>
          
          {/* Snout */}
          <ellipse cx="90" cy="85" rx="22" ry="18" fill="#9a3412"/>
          <ellipse cx="90" cy="83" rx="8" ry="10" fill="#000"/>
          
          {/* Mouth */}
          {bearMood === 'laughing' ? (
            <path d="M 75 95 Q 90 105 105 95" stroke="#000" strokeWidth="3" fill="none" strokeLinecap="round"/>
          ) : (
            <>
              <path d="M 75 95 L 90 90 L 105 95" stroke="#000" strokeWidth="3" fill="none" strokeLinecap="round"/>
              <path d="M 85 92 L 85 98" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
              <path d="M 95 92 L 95 98" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
            </>
          )}
          
          {/* Body */}
          <ellipse cx="90" cy="135" rx="55" ry="48" fill="url(#bearGradient)" filter="url(#bearShadow)"/>
          
          {/* Legs */}
          <rect x="60" y="165" width="18" height="38" rx="9" fill="#7c2d12"/>
          <rect x="102" y="165" width="18" height="38" rx="9" fill="#7c2d12"/>
          
          {/* Paws */}
          <ellipse cx="69" cy="203" rx="12" ry="7" fill="#431407"/>
          <ellipse cx="111" cy="203" rx="12" ry="7" fill="#431407"/>
          
          {/* Arms - Claws */}
          <motion.g
            animate={{
              rotate: isFighting ? [0, 20, 0] : 0,
            }}
            transition={{
              duration: 0.4,
              repeat: isFighting ? Infinity : 0,
            }}
            style={{ transformOrigin: '45px 125px' }}
          >
            <ellipse cx="45" cy="125" rx="14" ry="20" fill="#7c2d12"/>
            <g>
              <path d="M 38 140 L 35 145" stroke="#000" strokeWidth="2" strokeLinecap="round"/>
              <path d="M 42 142 L 40 147" stroke="#000" strokeWidth="2" strokeLinecap="round"/>
              <path d="M 46 142 L 45 147" stroke="#000" strokeWidth="2" strokeLinecap="round"/>
            </g>
          </motion.g>
          
          <motion.g
            animate={{
              rotate: isFighting ? [0, -20, 0] : 0,
            }}
            transition={{
              duration: 0.4,
              repeat: isFighting ? Infinity : 0,
              delay: 0.2,
            }}
            style={{ transformOrigin: '135px 125px' }}
          >
            <ellipse cx="135" cy="125" rx="14" ry="20" fill="#7c2d12"/>
            <g>
              <path d="M 142 140 L 145 145" stroke="#000" strokeWidth="2" strokeLinecap="round"/>
              <path d="M 138 142 L 140 147" stroke="#000" strokeWidth="2" strokeLinecap="round"/>
              <path d="M 134 142 L 135 147" stroke="#000" strokeWidth="2" strokeLinecap="round"/>
            </g>
          </motion.g>
          
          {/* Angry steam */}
          {bearMood === 'angry' && (
            <>
              <motion.circle
                cx="55"
                cy="40"
                r="3"
                fill="#dc2626"
                animate={{ y: [-5, -15], opacity: [1, 0] }}
                transition={{ duration: 1, repeat: Infinity }}
              />
              <motion.circle
                cx="125"
                cy="40"
                r="3"
                fill="#dc2626"
                animate={{ y: [-5, -15], opacity: [1, 0] }}
                transition={{ duration: 1, repeat: Infinity, delay: 0.5 }}
              />
            </>
          )}
        </svg>
        
        {/* Speech bubble */}
        {(emailFocused || passwordFocused) && (
          <motion.div
            className="absolute -top-16 left-1/2 -translate-x-1/2 bg-red-600 text-white px-4 py-2 rounded-lg font-bold text-sm whitespace-nowrap"
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            NO ENTRY! 🐻
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-8 border-r-8 border-t-8 border-transparent border-t-red-600" />
          </motion.div>
        )}
        
        {loginError && (
          <motion.div
            className="absolute -top-16 left-1/2 -translate-x-1/2 bg-yellow-500 text-black px-4 py-2 rounded-lg font-bold text-sm"
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            LOSER! 🤣
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-8 border-r-8 border-t-8 border-transparent border-t-yellow-500" />
          </motion.div>
        )}
      </motion.div>

      {/* Fighting effects */}
      {isFighting && (
        <motion.div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.5, 1, 0.5],
          }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
          }}
        >
          <div className="text-6xl">💥</div>
        </motion.div>
      )}
    </div>
  )
}
