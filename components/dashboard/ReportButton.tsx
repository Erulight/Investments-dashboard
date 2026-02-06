'use client'

import { Button } from '@/components/ui/Button'

export function ReportButton({ selectedYear }: { selectedYear: number }) {
  const handleClick = () => {
    window.location.href = `/api/reports/annual?year=${selectedYear}`
  }

  return (
    <Button variant="secondary" size="sm" onClick={handleClick}>
      Generate Report
    </Button>
  )
}
