'use client'

import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'

export function TradingChartOverlay() {
  const [dataPoints, setDataPoints] = useState<number[]>([])

  useEffect(() => {
    // Generate realistic trading chart data
    const generateData = () => {
      const points: number[] = []
      let value = 50
      for (let i = 0; i < 50; i++) {
        value += (Math.random() - 0.48) * 5
        value = Math.max(20, Math.min(80, value))
        points.push(value)
      }
      return points
    }

    setDataPoints(generateData())
    const interval = setInterval(() => {
      setDataPoints(prev => {
        const newPoints = [...prev.slice(1)]
        const lastValue = prev[prev.length - 1]
        const newValue = Math.max(20, Math.min(80, lastValue + (Math.random() - 0.48) * 5))
        newPoints.push(newValue)
        return newPoints
      })
    }, 10000)

    return () => clearInterval(interval)
  }, [])

  const pathData = dataPoints.map((point, i) => {
    const x = (i / (dataPoints.length - 1)) * 100
    const y = 100 - point
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
  }).join(' ')

  return (
    <div className="fixed bottom-4 right-4 w-64 h-32 pointer-events-none z-40 opacity-30">
      <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <linearGradient id="chartGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
          </linearGradient>
        </defs>
        
        {/* Grid lines */}
        {[0, 25, 50, 75, 100].map(y => (
          <line
            key={y}
            x1="0"
            y1={y}
            x2="100"
            y2={y}
            stroke="rgba(34, 211, 238, 0.1)"
            strokeWidth="0.5"
          />
        ))}
        
        {/* Chart line */}
        <path
          d={pathData}
          fill="none"
          stroke="#22d3ee"
          strokeWidth="2"
        />
        
        {/* Fill area */}
        <path
          d={`${pathData} L 100 100 L 0 100 Z`}
          fill="url(#chartGradient)"
        />
      </svg>
      
      {/* Ticker text */}
      <div className="absolute bottom-0 left-0 text-xs font-mono text-cyan-400 opacity-70">
        LIVE MARKET
      </div>
    </div>
  )
}
