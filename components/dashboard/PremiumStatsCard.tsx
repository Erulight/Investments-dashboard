'use client'

import { motion, useMotionValue, useTransform, animate } from 'framer-motion'
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
}

const accentColors = {
  gold: {
    primary: '#c9a84c',
    gradient: 'from-amber-500/20 to-yellow-600/20',
    glow: 'rgba(201, 168, 76, 0.3)',
    sparkline: '#c9a84c',
  },
  sky: {
    primary: '#38bdf8',
    gradient: 'from-sky-500/20 to-cyan-600/20',
    glow: 'rgba(56, 189, 248, 0.3)',
    sparkline: '#38bdf8',
  },
  purple: {
    primary: '#a78bfa',
    gradient: 'from-purple-500/20 to-violet-600/20',
    glow: 'rgba(167, 139, 250, 0.3)',
    sparkline: '#a78bfa',
  },
  green: {
    primary: '#34d399',
    gradient: 'from-emerald-500/20 to-green-600/20',
    glow: 'rgba(52, 211, 153, 0.3)',
    sparkline: '#34d399',
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
}: PremiumStatsCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
  const [isHovered, setIsHovered] = useState(false)
  
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
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.6,
        delay: index * 0.15,
        ease: [0.22, 1, 0.36, 1],
      }}
      whileHover={{ scale: 1.02, y: -4 }}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="relative group cursor-pointer"
      style={{
        transformStyle: 'preserve-3d',
      }}
    >
      {/* Glassmorphism card */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800/40 to-slate-900/60 backdrop-blur-xl border border-slate-700/50 shadow-2xl">
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
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                {title}
              </p>
            </div>
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
            <motion.div
              className="text-3xl font-bold text-white tabular-nums"
              style={{ color: colors.primary }}
            >
              <motion.span>{rounded}</motion.span>{' '}
              {prefix}
            </motion.div>
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
