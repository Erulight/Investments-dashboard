'use client'

import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface NexusGuardMascotProps {
  emailFocused: boolean
  passwordFocused: boolean
  loginError: boolean
  onLoginAttempt?: boolean
}

export function NexusGuardMascot({ 
  emailFocused, 
  passwordFocused, 
  loginError,
  onLoginAttempt 
}: NexusGuardMascotProps) {
  const [position, setPosition] = useState({ x: 80, y: 100 })
  const [velocity, setVelocity] = useState({ x: 0, y: 0 })
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [robotState, setRobotState] = useState<'patrolling' | 'tracking' | 'alerting' | 'scanning' | 'guarding'>('patrolling')
  const [roamTarget, setRoamTarget] = useState({ x: 200, y: 300 })
  const [bubbleText, setBubbleText] = useState('')
  const [showBubble, setShowBubble] = useState(false)
  const [walkCycle, setWalkCycle] = useState(0)
  const [idleTime, setIdleTime] = useState(0)
  const [laserActive, setLaserActive] = useState(false)
  const [eyeColor, setEyeColor] = useState('#00F5FF')
  const bubbleTimerRef = useRef<NodeJS.Timeout | null>(null)

  const patrolComments = [
    "Unauthorized cursor detected. Logging.",
    "Area clear. Suspiciously clear.",
    "I have logged your IP. Just so you know.",
    "My patrol route is optimized. Yours is chaotic.",
    "Nothing to report. Everything to suspect.",
    "Perimeter check: complete. Trust level: zero.",
  ]

  const trackComments = [
    "I see you, cursor.",
    "Target acquired. Threat level: medium.",
    "Don't move. I said DON'T— okay fine, move.",
    "My eye resolution is 8K. Yours isn't.",
    "Tracking initiated. You can't escape.",
  ]

  const alertComments = [
    "INTRUDER ALERT. Just kidding. Or am I.",
    "You came TOO CLOSE to a security unit!!",
    "PROXIMITY BREACH. Stepping back NOW.",
    "DANGER ZONE ACTIVATED.",
  ]

  const passwordComments = [
    "Encryption mode: enabled. I see nothing. 😐",
    "Password hidden from my visual sensors. Allegedly.",
    "I am definitely NOT reading your keystrokes.",
    "1-2-3-4-5? That's the combination to my luggage!",
  ]

  const emailComments = [
    "ID verification: scanning...",
    "Cross-referencing with the naughty list...",
    "Hmm. This email seems... sus.",
    "Processing identity. Please do not flee.",
  ]

  const idleComments = [
    "..............still waiting................",
    "ERROR: Human taking too long. Rebooting patience.",
    "My battery is running on impatience.",
    "Do you need a manual? I can print one.",
    "I could be guarding a missile silo. But here I am.",
  ]

  const showBubbleMessage = (text: string, duration = 3200) => {
    if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current)
    setBubbleText(text)
    setShowBubble(true)
    bubbleTimerRef.current = setTimeout(() => setShowBubble(false), duration)
  }

  const randOf = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)]

  useEffect(() => {
    if (passwordFocused) {
      setRobotState('guarding')
      setEyeColor('#FF4444')
      setLaserActive(false)
      showBubbleMessage(randOf(passwordComments), 3500)
    } else if (emailFocused) {
      setRobotState('scanning')
      setLaserActive(true)
      showBubbleMessage(randOf(emailComments), 3000)
    } else if (!loginError) {
      setRobotState('patrolling')
      setLaserActive(false)
      setEyeColor('#00F5FF')
    }
  }, [emailFocused, passwordFocused])

  useEffect(() => {
    if (loginError) {
      showBubbleMessage('AUTHENTICATION INITIATED. Do not panic. Probably.', 3500)
    }
  }, [loginError])

  useEffect(() => {
    if (onLoginAttempt) {
      showBubbleMessage('WARNING: Login attempt imminent. Bracing.', 3000)
      setEyeColor('#FFD700')
      setTimeout(() => setEyeColor('#00F5FF'), 3000)
    }
  }, [onLoginAttempt])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY })
      setIdleTime(0)
    }
    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

  useEffect(() => {
    const newPatrolTarget = () => {
      const margin = 100
      setRoamTarget({
        x: margin + Math.random() * (window.innerWidth - margin * 2),
        y: margin + Math.random() * (window.innerHeight - margin * 2)
      })
    }
    newPatrolTarget()

    const updateLoop = setInterval(() => {
      setPosition(prev => {
        const dist = Math.hypot(mousePos.x - prev.x, mousePos.y - prev.y)
        setIdleTime(t => t + 1)

        if (robotState !== 'guarding' && robotState !== 'scanning') {
          if (dist < 80) {
            if (robotState !== 'alerting') {
              setRobotState('alerting')
              setLaserActive(false)
              showBubbleMessage(randOf(alertComments), 2500)
              setEyeColor('#FF4444')
              setTimeout(() => {
                setRobotState('patrolling')
                setEyeColor('#00F5FF')
              }, 2500)
            }
          } else if (dist < 300 && robotState !== 'alerting') {
            if (robotState !== 'tracking') {
              setRobotState('tracking')
              setLaserActive(true)
              if (Math.random() < 0.5) showBubbleMessage(randOf(trackComments), 2500)
            }
          } else if (dist >= 300 && robotState === 'tracking') {
            setRobotState('patrolling')
            setLaserActive(false)
          }

          if (idleTime > 350 && Math.random() < 0.003) {
            showBubbleMessage(randOf(idleComments), 3500)
            setIdleTime(0)
          }

          if (robotState === 'patrolling' && Math.random() < 0.001) {
            showBubbleMessage(randOf(patrolComments), 3000)
          }
        }

        let tx = prev.x, ty = prev.y, speed = 0

        if (robotState === 'alerting') {
          tx = prev.x + (prev.x - mousePos.x) * 3
          ty = prev.y + (prev.y - mousePos.y) * 3
          speed = 5
        } else if (robotState === 'tracking') {
          const angle = Math.atan2(prev.y - mousePos.y, prev.x - mousePos.x) + 0.015
          const orbitR = 200
          tx = mousePos.x + Math.cos(angle) * orbitR
          ty = mousePos.y + Math.sin(angle) * orbitR
          speed = 2.5
        } else if (robotState === 'patrolling') {
          tx = roamTarget.x
          ty = roamTarget.y
          speed = 1.5
          const d = Math.hypot(roamTarget.x - prev.x, roamTarget.y - prev.y)
          if (d < 25) newPatrolTarget()
        } else {
          speed = 0.3
        }

        const toAngle = Math.atan2(ty - prev.y, tx - prev.x)
        const dist2 = Math.hypot(tx - prev.x, ty - prev.y)
        const accel = Math.min(speed, dist2 * 0.07)
        
        setVelocity(v => {
          const newVx = (v.x + Math.cos(toAngle) * accel) * 0.8
          const newVy = (v.y + Math.sin(toAngle) * accel) * 0.8
          
          const spd = Math.hypot(newVx, newVy)
          setWalkCycle(w => w + spd * 0.15)
          
          const newX = Math.max(10, Math.min(window.innerWidth - 90, prev.x + newVx))
          const newY = Math.max(10, Math.min(window.innerHeight - 160, prev.y + newVy))
          
          return { x: newVx, y: newVy }
        })

        const newX = Math.max(10, Math.min(window.innerWidth - 90, prev.x + velocity.x))
        const newY = Math.max(10, Math.min(window.innerHeight - 160, prev.y + velocity.y))
        
        return { x: newX, y: newY }
      })
    }, 50)

    return () => clearInterval(updateLoop)
  }, [mousePos, robotState, roamTarget, velocity, idleTime])

  const legSwing = Math.sin(walkCycle) * 12
  const flip = velocity.x < -0.3
  const tilt = Math.max(-10, Math.min(10, velocity.x * 2))

  const eyeCenterX = position.x + 50
  const eyeCenterY = position.y + 30
  const laserAngle = Math.atan2(mousePos.y - eyeCenterY, mousePos.x - eyeCenterX)
  const laserLength = Math.min(Math.hypot(mousePos.x - eyeCenterX, mousePos.y - eyeCenterY), 300)

  const headCX = position.x + 50
  const headCY = position.y + 38
  const pupilAngle = Math.atan2(mousePos.y - headCY, mousePos.x - headCX)
  const pupilEx = Math.cos(pupilAngle) * 4
  const pupilEy = Math.sin(pupilAngle) * 3

  const barT = Date.now() * 0.002

  return (
    <>
      <AnimatePresence>
        {showBubble && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            className="fixed z-[101] bg-[#0D1A2D] border-[1.5px] border-[#00F5FF] rounded-[10px] px-[14px] py-[9px] font-mono text-[11px] text-[#00F5FF] max-w-[200px] leading-[1.5] pointer-events-none"
            style={{
              left: position.x + 90,
              top: position.y - 20,
              boxShadow: '0 0 20px rgba(0,245,255,0.2)',
            }}
          >
            {bubbleText}
            <div className="absolute bottom-[-9px] left-[12px] border-[5px] border-transparent border-t-[#00F5FF]" />
          </motion.div>
        )}
      </AnimatePresence>

      {laserActive && (
        <div
          className="fixed h-[2px] bg-gradient-to-r from-[#00F5FF] to-transparent z-[99] pointer-events-none transition-opacity duration-100"
          style={{
            left: eyeCenterX,
            top: eyeCenterY,
            width: laserLength,
            transform: `rotate(${laserAngle}rad)`,
            transformOrigin: 'left center',
            opacity: 0.4,
            boxShadow: '0 0 8px #00F5FF',
          }}
        />
      )}

      <div
        className="fixed z-[100] pointer-events-none"
        style={{
          left: position.x,
          top: position.y,
          width: 80,
          transform: `${flip ? 'scaleX(-1)' : ''} rotate(${tilt}deg)`,
          transition: 'transform 0.1s ease-out',
        }}
      >
        <svg viewBox="0 0 100 160" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', overflow: 'visible' }}>
          <ellipse cx="50" cy="158" rx="28" ry="6" fill="rgba(0,245,255,0.1)" />
          
          <g id="leg-l" style={{ transform: `rotate(${legSwing}deg)`, transformOrigin: '36px 112px' }}>
            <rect x="28" y="112" width="16" height="28" rx="5" fill="#0D2040" stroke="#1A4070" strokeWidth="1.5" />
            <rect x="26" y="136" width="20" height="8" rx="4" fill="#00B8BF" />
          </g>
          
          <g id="leg-r" style={{ transform: `rotate(${-legSwing}deg)`, transformOrigin: '64px 112px' }}>
            <rect x="56" y="112" width="16" height="28" rx="5" fill="#0D2040" stroke="#1A4070" strokeWidth="1.5" />
            <rect x="54" y="136" width="20" height="8" rx="4" fill="#00B8BF" />
          </g>
          
          <g id="arm-l" style={{ transform: `rotate(${-legSwing * 0.8}deg)`, transformOrigin: '20px 68px' }}>
            <rect x="8" y="62" width="14" height="36" rx="6" fill="#0D2040" stroke="#1A4070" strokeWidth="1.5" />
            <circle cx="15" cy="100" r="7" fill="#00B8BF" />
          </g>
          
          <g id="arm-r" style={{ transform: `rotate(${legSwing * 0.8}deg)`, transformOrigin: '80px 68px' }}>
            <rect x="78" y="62" width="14" height="36" rx="6" fill="#0D2040" stroke="#1A4070" strokeWidth="1.5" />
            <circle cx="85" cy="100" r="7" fill="#00B8BF" />
          </g>
          
          <rect x="20" y="58" width="60" height="58" rx="12" fill="#0D2040" stroke="#00F5FF" strokeWidth="1.5" />
          
          <rect x="30" y="68" width="40" height="28" rx="6" fill="rgba(0,245,255,0.05)" stroke="rgba(0,245,255,0.2)" strokeWidth="1" />
          <rect x="34" y="73" width={28 + Math.sin(barT) * 8} height="3" rx="2" fill="#00F5FF" />
          <rect x="34" y="80" width={18 + Math.sin(barT + 1) * 8} height="3" rx="2" fill="#00F5FF" opacity="0.7" />
          <rect x="34" y="87" width={24 + Math.sin(barT + 2) * 7} height="3" rx="2" fill="#00F5FF" opacity="0.5" />
          
          <circle cx="50" cy="104" r="5" fill="none" stroke="#00F5FF" strokeWidth="1.5" />
          <line x1="50" y1="100" x2="50" y2="97" stroke="#00F5FF" strokeWidth="1.5" />
          
          <rect x="40" y="48" width="20" height="12" rx="4" fill="#0A1D35" stroke="#1A3050" strokeWidth="1" />
          
          <rect x="15" y="10" width="70" height="42" rx="14" fill="#0D2040" stroke="#00F5FF" strokeWidth="2" />
          
          <line x1="50" y1="10" x2="50" y2="-4" stroke="#00F5FF" strokeWidth="2" />
          <circle cx="50" cy="-8" r="5" fill="#00F5FF" opacity={0.4 + 0.6 * ((Math.sin(barT * 2) + 1) / 2)} />
          
          <rect x="22" y="22" width="22" height="14" rx="4" fill={eyeColor} />
          <rect x="56" y="22" width="22" height="14" rx="4" fill={eyeColor} />
          
          <rect 
            x={Math.max(22, Math.min(36, 29 + pupilEx))} 
            y={Math.max(22, Math.min(30, 26 + pupilEy))} 
            width="8" 
            height="6" 
            rx="2" 
            fill="#060A12" 
          />
          <rect 
            x={Math.max(56, Math.min(70, 63 + pupilEx))} 
            y={Math.max(22, Math.min(30, 26 + pupilEy))} 
            width="8" 
            height="6" 
            rx="2" 
            fill="#060A12" 
          />
          
          <rect x="30" y="42" width="40" height="6" rx="3" fill="rgba(0,245,255,0.15)" stroke="rgba(0,245,255,0.3)" strokeWidth="1" />
          <g>
            <rect x="34" y="43" width="4" height="4" rx="1" fill="#00F5FF" opacity="0.8" />
            <rect x="40" y="43" width="4" height="4" rx="1" fill="#00F5FF" opacity="0.8" />
            <rect x="46" y="43" width="4" height="4" rx="1" fill="#00F5FF" opacity="0.8" />
            <rect x="52" y="43" width="4" height="4" rx="1" fill="#00F5FF" opacity="0.8" />
            <rect x="58" y="43" width="4" height="4" rx="1" fill="#00F5FF" opacity="0.8" />
          </g>
        </svg>
      </div>
    </>
  )
}
