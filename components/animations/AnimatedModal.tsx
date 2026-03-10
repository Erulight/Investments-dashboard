'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { modalBackdrop, modalContent } from '@/lib/animations'
import { X } from 'lucide-react'

interface AnimatedModalProps {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
  title?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

export function AnimatedModal({ 
  isOpen, 
  onClose, 
  children, 
  title,
  size = 'md'
}: AnimatedModalProps) {
  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
    xl: 'max-w-6xl'
  }

  return (
    <AnimatePresence mode="wait">
      {isOpen && (
        <>
          <motion.div
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={modalBackdrop}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial="hidden"
              animate="visible"
              exit="exit"
              variants={modalContent}
              className={`${sizeClasses[size]} w-full pointer-events-auto`}
            >
              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden">
                {title && (
                  <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-white/10">
                    <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                      {title}
                    </h2>
                    <motion.button
                      whileHover={{ scale: 1.1, rotate: 90 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={onClose}
                      className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                    >
                      <X className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                    </motion.button>
                  </div>
                )}
                <div className="p-6">
                  {children}
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}
