'use client'

import { motion, MotionProps } from 'framer-motion'
import { ComponentPropsWithoutRef } from 'react'

interface AnimatedButtonProps extends Omit<ComponentPropsWithoutRef<'button'>, keyof MotionProps> {
  children: React.ReactNode
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
}

export function AnimatedButton({ 
  children, 
  variant = 'primary',
  size = 'md',
  className = '',
  disabled,
  onClick,
  type,
  ...rest
}: AnimatedButtonProps) {
  const baseClasses = 'font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2'
  
  const variantClasses = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500 dark:bg-blue-500 dark:hover:bg-blue-600',
    secondary: 'bg-slate-200 text-slate-900 hover:bg-slate-300 focus:ring-slate-500 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600',
    ghost: 'bg-transparent text-slate-700 hover:bg-slate-100 focus:ring-slate-500 dark:text-slate-200 dark:hover:bg-white/10',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 dark:bg-red-500 dark:hover:bg-red-600'
  }

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg'
  }

  const disabledClasses = disabled 
    ? 'opacity-50 cursor-not-allowed' 
    : ''

  return (
    <motion.button
      whileHover={!disabled ? { scale: 1.05 } : undefined}
      whileTap={!disabled ? { scale: 0.95 } : undefined}
      transition={{ duration: 0.2 }}
      disabled={disabled}
      onClick={onClick}
      type={type}
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${disabledClasses} ${className}`}
      {...rest}
    >
      {children}
    </motion.button>
  )
}
