'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { tabSwitch } from '@/lib/animations'

interface Tab {
  id: string
  label: string
  content: React.ReactNode
}

interface AnimatedTabsProps {
  tabs: Tab[]
  activeTab: string
  onTabChange: (tabId: string) => void
  className?: string
}

export function AnimatedTabs({ tabs, activeTab, onTabChange, className = '' }: AnimatedTabsProps) {
  return (
    <div className={className}>
      <div className="flex gap-2 border-b border-slate-200 dark:border-white/10 mb-6">
        {tabs.map((tab) => (
          <motion.button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`relative px-4 py-2 font-semibold text-sm transition-colors ${
              activeTab === tab.id
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {tab.label}
            {activeTab === tab.id && (
              <motion.div
                layoutId="activeTab"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400"
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              />
            )}
          </motion.button>
        ))}
      </div>
      <AnimatePresence mode="wait">
        {tabs.map((tab) => (
          tab.id === activeTab && (
            <motion.div
              key={tab.id}
              initial="hidden"
              animate="visible"
              exit="exit"
              variants={tabSwitch}
            >
              {tab.content}
            </motion.div>
          )
        ))}
      </AnimatePresence>
    </div>
  )
}
