'use client'

import { motion, useSpring, useTransform } from 'framer-motion'
import { useEffect } from 'react'

interface AnimatedNumberProps {
  value: number
  className?: string
  duration?: number
  format?: (value: number) => string
}

export function AnimatedNumber({ 
  value, 
  className = '',
  duration = 1,
  format = (v) => v.toFixed(2)
}: AnimatedNumberProps) {
  const spring = useSpring(0, { 
    stiffness: 100, 
    damping: 30,
    duration: duration * 1000
  })
  
  const display = useTransform(spring, (current) => format(current))

  useEffect(() => {
    spring.set(value)
  }, [spring, value])

  return (
    <motion.span
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={className}
    >
      {display}
    </motion.span>
  )
}
