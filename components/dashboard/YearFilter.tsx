'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

const years = [2024, 2025, 2026]

export function YearFilter({ selectedYear }: { selectedYear: number | 'all' }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [year, setYear] = useState(String(selectedYear))

  useEffect(() => {
    setYear(String(selectedYear))
  }, [selectedYear])

  const handleChange = (value: string) => {
    const params = new URLSearchParams(searchParams?.toString())
    if (value === 'all') {
      params.delete('year')
    } else {
      params.set('year', value)
    }
    setYear(value)
    router.replace(`${pathname}?${params.toString()}`)
    router.refresh()
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-slate-600 dark:text-slate-300">Year</span>
      <select
        value={year}
        onChange={(e) => handleChange(e.target.value)}
        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100"
      >
        <option value="all">All Years</option>
        {years.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>
    </div>
  )
}
