'use client'

import { useMemo } from 'react'

interface SummaryCardsProps {
  totalWealth: number
  totalDue: number
  totalPaidThisYear: number
  remainingToPay: number
  nextDueDate: string | null
  systemHealth: 'ALL_CLEAR' | 'WARNINGS'
  warningCount: number
  money: (v: number) => string
}

const cardBase = 'rounded-xl border p-5 transition-all duration-300 hover:shadow-lg hover:scale-[1.01]'

export function SummaryCards({
  totalWealth,
  totalDue,
  totalPaidThisYear,
  remainingToPay,
  nextDueDate,
  systemHealth,
  warningCount,
  money,
}: SummaryCardsProps) {
  const cards = useMemo(() => [
    {
      label: 'Total Wealth Tracked',
      value: money(totalWealth),
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
        </svg>
      ),
      color: 'border-blue-500/30 bg-gradient-to-br from-blue-950/60 to-slate-900/80',
      textColor: 'text-blue-300',
      valueColor: 'text-blue-100',
    },
    {
      label: 'Total Zakat Due',
      value: money(totalDue),
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: 'border-amber-500/30 bg-gradient-to-br from-amber-950/60 to-slate-900/80',
      textColor: 'text-amber-300',
      valueColor: 'text-amber-100',
    },
    {
      label: 'Total Paid This Year',
      value: money(totalPaidThisYear),
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: 'border-emerald-500/30 bg-gradient-to-br from-emerald-950/60 to-slate-900/80',
      textColor: 'text-emerald-300',
      valueColor: 'text-emerald-100',
    },
    {
      label: 'Remaining to Pay',
      value: money(remainingToPay),
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      ),
      color: remainingToPay > 0
        ? 'border-red-500/30 bg-gradient-to-br from-red-950/60 to-slate-900/80'
        : 'border-emerald-500/30 bg-gradient-to-br from-emerald-950/60 to-slate-900/80',
      textColor: remainingToPay > 0 ? 'text-red-300' : 'text-emerald-300',
      valueColor: remainingToPay > 0 ? 'text-red-100' : 'text-emerald-100',
    },
    {
      label: 'Next Zakat Due Date',
      value: nextDueDate || 'None',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
        </svg>
      ),
      color: 'border-purple-500/30 bg-gradient-to-br from-purple-950/60 to-slate-900/80',
      textColor: 'text-purple-300',
      valueColor: 'text-purple-100',
    },
    {
      label: 'System Health',
      value: systemHealth === 'ALL_CLEAR' ? 'ALL CLEAR' : `${warningCount} WARNING${warningCount !== 1 ? 'S' : ''}`,
      icon: systemHealth === 'ALL_CLEAR' ? (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
        </svg>
      ) : (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      ),
      color: systemHealth === 'ALL_CLEAR'
        ? 'border-emerald-500/30 bg-gradient-to-br from-emerald-950/60 to-slate-900/80'
        : 'border-red-500/30 bg-gradient-to-br from-red-950/60 to-slate-900/80',
      textColor: systemHealth === 'ALL_CLEAR' ? 'text-emerald-300' : 'text-red-300',
      valueColor: systemHealth === 'ALL_CLEAR' ? 'text-emerald-100' : 'text-red-100',
    },
  ], [totalWealth, totalDue, totalPaidThisYear, remainingToPay, nextDueDate, systemHealth, warningCount, money])

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {cards.map((card, i) => (
        <div
          key={i}
          className={`${cardBase} ${card.color}`}
          style={{ animationDelay: `${i * 80}ms`, animation: 'fadeInUp 0.5s ease-out both' }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className={`text-xs font-semibold uppercase tracking-wider ${card.textColor}`}>
              {card.label}
            </span>
            <span className={card.textColor}>{card.icon}</span>
          </div>
          <div className={`text-2xl font-bold tabular-nums ${card.valueColor}`}>
            {card.value}
          </div>
        </div>
      ))}
    </div>
  )
}
