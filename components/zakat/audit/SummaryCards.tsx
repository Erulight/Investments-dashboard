'use client'

import { motion } from 'framer-motion'
import { formatCurrencyAmount, type DisplayCurrency } from '@/lib/currency'

type SummaryCardsProps = {
  totalWealth: number
  totalDue: number
  totalPaidThisYear: number
  remainingToPay: number
  nextDueDate: string | null
  systemHealth: 'ALL_CLEAR' | 'WARNINGS'
  warningCount: number
  displayCurrency: DisplayCurrency
}

export function SummaryCards({
  totalWealth,
  totalDue,
  totalPaidThisYear,
  remainingToPay,
  nextDueDate,
  systemHealth,
  warningCount,
  displayCurrency,
}: SummaryCardsProps) {
  const money = (val: number) => formatCurrencyAmount(val, displayCurrency, 'SAR')

  const cards = [
    {
      title: 'Total Wealth Tracked',
      value: money(totalWealth),
      icon: '💰',
      color: 'from-blue-500 to-blue-600',
      description: 'Cash + Sukuk + Savings + Crypto',
    },
    {
      title: 'Total Zakat Due',
      value: money(totalDue),
      icon: '📊',
      color: 'from-amber-500 to-amber-600',
      description: 'Sum of all unpaid rows',
    },
    {
      title: 'Zakat Paid This Year',
      value: money(totalPaidThisYear),
      icon: '✅',
      color: 'from-emerald-500 to-emerald-600',
      description: new Date().getFullYear().toString(),
    },
    {
      title: 'Remaining to Pay',
      value: money(remainingToPay),
      icon: '⏳',
      color: 'from-purple-500 to-purple-600',
      description: 'Outstanding zakat',
    },
    {
      title: 'Next Zakat Due',
      value: nextDueDate || 'No upcoming',
      icon: '📅',
      color: 'from-cyan-500 to-cyan-600',
      description: 'Earliest hawl completion',
    },
    {
      title: 'System Health',
      value: systemHealth === 'ALL_CLEAR' ? 'ALL CLEAR' : `${warningCount} WARNINGS`,
      icon: systemHealth === 'ALL_CLEAR' ? '🟢' : '🔴',
      color: systemHealth === 'ALL_CLEAR' ? 'from-green-500 to-green-600' : 'from-red-500 to-red-600',
      description: systemHealth === 'ALL_CLEAR' ? 'No issues detected' : 'Review warnings below',
    },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {cards.map((card, index) => (
        <motion.div
          key={card.title}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
          className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${card.color} p-6 text-white shadow-lg`}
        >
          <div className="absolute top-0 right-0 text-6xl opacity-10">{card.icon}</div>
          <div className="relative z-10">
            <p className="text-sm font-medium opacity-90">{card.title}</p>
            <p className="mt-2 text-2xl font-bold">{card.value}</p>
            <p className="mt-1 text-xs opacity-75">{card.description}</p>
          </div>
        </motion.div>
      ))}
    </div>
  )
}
