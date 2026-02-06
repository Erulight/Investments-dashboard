'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

const years = [2024, 2025, 2026]

export function YearFilter({ selectedYear }: { selectedYear: number }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [year, setYear] = useState(String(selectedYear))

  useEffect(() => {
    setYear(String(selectedYear))
  }, [selectedYear])

  const handleChange = (value: string) => {
    const params = new URLSearchParams(searchParams?.toString())
    params.set('year', value)
    setYear(value)
    router.replace(`${pathname}?${params.toString()}`)
    router.refresh()
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-600">Year</span>
      <select
        value={year}
        onChange={(e) => handleChange(e.target.value)}
        className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
      >
        {years.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>
    </div>
  )
}
