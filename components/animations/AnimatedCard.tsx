'use client'

import { motion } from 'framer-motion'
import { statsCardVariants, cardHover } from '@/lib/animations'

interface AnimatedCardProps {
  children: React.ReactNode
  className?: string
  delay?: number
  hover?: boolean
  onClick?: () => void
}

export function AnimatedCard({ 
  children, 
  className = '', 
  delay = 0,
  hover = true,
  onClick
}: AnimatedCardProps) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={statsCardVariants}
      transition={{ delay }}
      whileHover={hover ? { scale: 1.02 } : undefined}
      whileTap={onClick ? { scale: 0.98 } : undefined}
      onClick={onClick}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export function AnimatedStatCard({ 
  children, 
  className = '', 
  index = 0 
}: AnimatedCardProps & { index?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ 
        duration: 0.25, 
        ease: [0.22, 1, 0.36, 1],
        delay: Math.min(index * 0.04, 0.2)
      }}
      whileHover={{ 
        scale: 1.02,
        transition: { duration: 0.2 }
      }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
