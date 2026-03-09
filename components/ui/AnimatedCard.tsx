'use client'

import { motion } from 'framer-motion'
import { ReactNode } from 'react'

interface AnimatedCardProps {
  children: ReactNode
  index?: number
  className?: string
  hover?: boolean
}

export function AnimatedCard({ children, index = 0, className = '', hover = true }: AnimatedCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.5,
        delay: index * 0.1,
        ease: [0.22, 1, 0.36, 1],
      }}
      whileHover={hover ? { scale: 1.02, y: -4 } : undefined}
      className={`premium-card ${className}`}
    >
      {children}
    </motion.div>
  )
}

export function AnimatedTableRow({ children, index = 0, className = '' }: AnimatedCardProps) {
  return (
    <motion.tr
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        duration: 0.4,
        delay: index * 0.05,
        ease: 'easeOut',
      }}
      whileHover={{ backgroundColor: 'rgba(148, 163, 184, 0.05)' }}
      className={className}
    >
      {children}
    </motion.tr>
  )
}

export function AnimatedButton({ children, className = '', onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className={className}
      onClick={onClick}
    >
      {children}
    </motion.button>
  )
}
