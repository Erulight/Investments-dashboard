'use client'

import { motion, useMotionValue, useTransform, animate, AnimatePresence } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { AreaChart, Area, ResponsiveContainer } from 'recharts'
import { TrendingUp, TrendingDown } from 'lucide-react'

interface PremiumStatsCardProps {
  title: string
  value: number
  subtitle?: string
  trend?: number
  trendLabel?: string
  sparklineData?: number[]
  accentColor: 'gold' | 'sky' | 'purple' | 'green'
  index: number
  prefix?: string
  showProgress?: boolean
  progressValue?: number
  progressMax?: number
  isHidden?: boolean
  onToggleHide?: () => void
}

const accentColors = {
  gold: {
    primary: '#fbbf24',
    gradient: 'from-amber-400/30 to-yellow-500/30',
    glow: 'rgba(251, 191, 36, 0.5)',
    sparkline: '#fbbf24',
    border: 'border-amber-400/40',
    shadow: 'shadow-amber-500/30',
  },
  sky: {
    primary: '#22d3ee',
    gradient: 'from-cyan-400/30 to-sky-500/30',
    glow: 'rgba(34, 211, 238, 0.5)',
    sparkline: '#22d3ee',
    border: 'border-cyan-400/40',
    shadow: 'shadow-cyan-500/30',
  },
  purple: {
    primary: '#c084fc',
    gradient: 'from-purple-400/30 to-violet-500/30',
    glow: 'rgba(192, 132, 252, 0.5)',
    sparkline: '#c084fc',
    border: 'border-purple-400/40',
    shadow: 'shadow-purple-500/30',
  },
  green: {
    primary: '#4ade80',
    gradient: 'from-emerald-400/30 to-green-500/30',
    glow: 'rgba(74, 222, 128, 0.5)',
    sparkline: '#4ade80',
    border: 'border-emerald-400/40',
    shadow: 'shadow-emerald-500/30',
  },
}

export function PremiumStatsCard({
  title,
  value,
  subtitle,
  trend,
  trendLabel,
  sparklineData,
  accentColor,
  index,
  prefix = 'SAR',
  showProgress = false,
  progressValue = 0,
  progressMax = 100,
  isHidden = false,
  onToggleHide,
}: PremiumStatsCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
  const [isHovered, setIsHovered] = useState(false)
  const [localHidden, setLocalHidden] = useState(false)
  
  const hidden = onToggleHide ? isHidden : localHidden
  const toggleHidden = onToggleHide || (() => setLocalHidden(!localHidden))
  
  const displayValue = useMotionValue(0)
  const rounded = useTransform(displayValue, (latest) => Math.round(latest))
  
  const colors = accentColors[accentColor]

  useEffect(() => {
    const controls = animate(displayValue, value, {
      duration: 2,
      ease: 'easeOut',
      delay: index * 0.1,
    })
    return controls.stop
  }, [value, displayValue, index])

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    setMousePosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    })
  }

  const chartData = sparklineData?.map((val, idx) => ({ value: val, index: idx })) || []

  const progressPercentage = progressMax > 0 ? (progressValue / progressMax) * 100 : 0

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 50, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      whileHover={{ scale: 1.02, y: -4 }}
      transition={{
        duration: 0.6,
        delay: index * 0.15,
        ease: [0.22, 1, 0.36, 1],
      }}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="relative group cursor-pointer"
      style={{
        transformStyle: 'preserve-3d',
      }}
    >
      {/* Neon glassmorphism card */}
      <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 backdrop-blur-xl border-2 ${colors.border} shadow-2xl ${colors.shadow} hover:shadow-3xl transition-all duration-500`}>
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-purple-500/5 pointer-events-none" />
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
        {/* Shimmer line on top edge */}
        <motion.div
          className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${colors.gradient}`}
          initial={{ x: '-100%' }}
          animate={{ x: '100%' }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: 'linear',
            delay: index * 0.2,
          }}
        />

        {/* Mouse tracking spotlight glow */}
        {isHovered && (
          <motion.div
            className="absolute pointer-events-none"
            style={{
              left: mousePosition.x,
              top: mousePosition.y,
              width: 300,
              height: 300,
              background: `radial-gradient(circle, ${colors.glow} 0%, transparent 70%)`,
              transform: 'translate(-50%, -50%)',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
          />
        )}

        {/* Card content */}
        <div className="relative p-6 space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-xs font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent uppercase tracking-wider drop-shadow-lg">
                {title}
              </p>
            </div>
            <motion.button
              onClick={toggleHidden}
              className="group relative p-1.5 rounded-lg bg-slate-800/50 border border-cyan-500/30 hover:border-cyan-400/60 transition-all duration-300 ml-2"
              whileTap={{ scale: 0.95 }}
              whileHover={{ scale: 1.05 }}
            >
              <motion.div
                animate={{ rotate: hidden ? 0 : 360 }}
                transition={{ duration: 0.5, ease: "easeInOut" }}
              >
                {hidden ? (
                  <svg className="w-4 h-4 text-cyan-400 drop-shadow-[0_0_6px_rgba(34,211,238,0.6)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-cyan-400 drop-shadow-[0_0_6px_rgba(34,211,238,0.6)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </motion.div>
              <div className="absolute inset-0 rounded-lg bg-cyan-400/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </motion.button>
            {trend !== undefined && (
              <div
                className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${
                  trend >= 0
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-red-500/20 text-red-400'
                }`}
              >
                {trend >= 0 ? (
                  <TrendingUp className="w-3 h-3" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
                {Math.abs(trend).toFixed(1)}%
              </div>
            )}
          </div>

          {/* Value with count-up animation */}
          <div className="space-y-1">
            <AnimatePresence mode="wait">
              {hidden ? (
                <motion.div
                  key="hidden"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.3 }}
                  className="text-3xl font-bold tabular-nums"
                  style={{ color: colors.primary }}
                >
                  •••••••
                </motion.div>
              ) : (
                <motion.div
                  key="visible"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.3 }}
                  className="text-3xl font-bold text-white tabular-nums drop-shadow-[0_0_10px_rgba(34,211,238,0.3)]"
                  style={{ color: colors.primary }}
                >
                  <motion.span>{rounded}</motion.span>{' '}
                  {prefix}
                </motion.div>
              )}
            </AnimatePresence>
            {subtitle && (
              <p className="text-xs text-slate-500">{subtitle}</p>
            )}
            {trendLabel && (
              <p className="text-xs text-slate-400 font-medium">{trendLabel}</p>
            )}
          </div>

          {/* Progress bar */}
          {showProgress && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-400">
                <span>Utilization</span>
                <span>{progressPercentage.toFixed(0)}%</span>
              </div>
              <div className="h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: colors.primary }}
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPercentage}%` }}
                  transition={{ duration: 1.5, delay: index * 0.1, ease: 'easeOut' }}
                />
              </div>
            </div>
          )}

          {/* Mini sparkline chart */}
          {chartData.length > 0 && (
            <div className="h-12 -mx-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id={`gradient-${accentColor}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={colors.sparkline} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={colors.sparkline} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke={colors.sparkline}
                    strokeWidth={2}
                    fill={`url(#gradient-${accentColor})`}
                    isAnimationActive={true}
                    animationDuration={1500}
                    animationBegin={index * 100}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Hover glow effect on border */}
        <motion.div
          className="absolute inset-0 rounded-2xl pointer-events-none"
          style={{
            boxShadow: isHovered
              ? `0 0 30px ${colors.glow}, inset 0 0 20px ${colors.glow}`
              : 'none',
          }}
          animate={{
            opacity: isHovered ? 1 : 0,
          }}
          transition={{ duration: 0.3 }}
        />
      </div>
    </motion.div>
  )
}
