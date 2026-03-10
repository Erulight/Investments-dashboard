'use client'

import { motion } from 'framer-motion'
import { staggerContainer, staggerItem, listItemVariants } from '@/lib/animations'

interface AnimatedListProps {
  children: React.ReactNode
  className?: string
}

export function AnimatedList({ children, className = '' }: AnimatedListProps) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      exit="exit"
      variants={staggerContainer}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export function AnimatedListItem({ 
  children, 
  className = '',
  index = 0 
}: AnimatedListProps & { index?: number }) {
  return (
    <motion.div
      variants={staggerItem}
      custom={index}
      whileHover={{ 
        x: 4,
        transition: { duration: 0.2 }
      }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export function AnimatedTableRow({ 
  children, 
  className = '',
  index = 0,
  onClick
}: AnimatedListProps & { index?: number; onClick?: () => void }) {
  return (
    <motion.tr
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ 
        duration: 0.4, 
        ease: [0.22, 1, 0.36, 1],
        delay: index * 0.05
      }}
      whileHover={{ 
        backgroundColor: 'rgba(59, 130, 246, 0.05)',
        transition: { duration: 0.2 }
      }}
      onClick={onClick}
      className={className}
    >
      {children}
    </motion.tr>
  )
}
