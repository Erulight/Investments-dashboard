'use client'

import { useState } from 'react'
import { type DisplayCurrency } from '@/lib/currency'
import { SummaryCards } from './SummaryCards'
import { ReconciliationWarnings, type Warning } from './ReconciliationWarnings'
import { HawlTimelineView } from './HawlTimelineView'
import { InvestmentBreakdown, type InvestmentBreakdownItem } from './InvestmentBreakdown'
import { DrillDownModal, type DrillDownData } from './DrillDownModal'
import { ExportButtons } from './ExportButtons'

type ZakatAuditClientProps = {
  totalWealth: number
  totalDue: number
  totalPaidThisYear: number
  remainingToPay: number
  nextDueDate: string | null
  systemHealth: 'ALL_CLEAR' | 'WARNINGS'
  warningCount: number
  warnings: Warning[]
  timelineItems: Array<{
    id: string
    source: string
    haulStart: string
    haulEnd: string
    status: 'paid' | 'due' | 'upcoming'
    zakatAmount: number
    nextDueDate: string | null
  }>
  investments: InvestmentBreakdownItem[]
  displayCurrency: DisplayCurrency
  exportData: {
    rows: any[]
    buckets: any[]
    investments: any[]
  }
}

export function ZakatAuditClient({
  totalWealth,
  totalDue,
  totalPaidThisYear,
  remainingToPay,
  nextDueDate,
  systemHealth,
  warningCount,
  warnings,
  timelineItems,
  investments,
  displayCurrency,
  exportData,
}: ZakatAuditClientProps) {
  const [drillDownData, setDrillDownData] = useState<DrillDownData | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const handleRowClick = (investmentId: string, rowType: string) => {
    // Find the relevant data for drill-down
    const inv = investments.find((i) => i.id === investmentId)
    if (!inv) return

    const row = inv.zakatRows.find((r) => r.type === rowType)
    if (!row) return

    const fundingSource = inv.fundingSources[0]
    
    setDrillDownData({
      sourceBucket: fundingSource?.bucketLabel || inv.name,
      sourceAmount: fundingSource?.amount || inv.totalPrincipal,
      firstContributionDate: fundingSource?.haulDate || '—',
      receiptDate: null,
      hawl1Start: fundingSource?.haulDate || '—',
      hawl1End: '—',
      amountHeldAtHawlEnd: row.amount / 0.025,
      amountWithdrawnBeforeHawlEnd: 0,
      taxableAmount: row.amount / 0.025,
      zakatRate: 2.5,
      zakatDue: row.amount,
      paymentStatus: row.status === 'paid' ? 'paid' : 'unpaid',
      investedInSukuk: {
        name: inv.name,
        status: 'active',
      },
    })
    setIsModalOpen(true)
  }

  const handleExportPDF = async () => {
    // Generate PDF report
    const reportContent = `
ZAKAT AUDIT REPORT
Generated: ${new Date().toLocaleDateString()}

=== SUMMARY ===
Total Wealth Tracked: ${totalWealth.toLocaleString()}
Total Zakat Due: ${totalDue.toLocaleString()}
Total Paid This Year: ${totalPaidThisYear.toLocaleString()}
Remaining to Pay: ${remainingToPay.toLocaleString()}

=== ZAKAT ROWS ===
${exportData.rows.map((row: any) => `
${row.label}
  Period: ${row.haulStartDate} → ${row.haulCompleteDate}
  Amount: ${row.balance?.toLocaleString() || 0}
  Zakat Due: ${row.zakatDue?.toLocaleString() || 0}
  Status: ${row.isPaid ? 'PAID' : 'DUE'}
`).join('\n')}

=== RECONCILIATION STATUS ===
${warnings.length === 0 ? 'All calculations verified ✓' : `${warnings.length} warnings detected`}
${warnings.map((w: Warning) => `- ${w.title}: ${w.description}`).join('\n')}
`

    const blob = new Blob([reportContent], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `zakat-report-${new Date().toISOString().split('T')[0]}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleExportCSV = async () => {
    // Generate CSV ledger
    const headers = ['Date', 'Type', 'Description', 'Amount', 'Investment', 'Status']
    const rows = exportData.rows.map((row: any) => [
      row.haulCompleteDate || '',
      row.rowKind || 'IDLE',
      row.label || '',
      row.zakatDue?.toFixed(2) || '0',
      row.source || '',
      row.isPaid ? 'PAID' : 'DUE',
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map((row: any[]) => row.map((cell: any) => `"${cell}"`).join(',')),
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `zakat-ledger-${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-8">
      {/* Export Buttons */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">📋 Zakat Audit & Verification</h1>
          <p className="mt-1 text-slate-600 dark:text-slate-400">
            Complete audit of all zakat calculations and payment history
          </p>
        </div>
        <ExportButtons onExportPDF={handleExportPDF} onExportCSV={handleExportCSV} />
      </div>

      {/* Section 1: Summary Cards */}
      <SummaryCards
        totalWealth={totalWealth}
        totalDue={totalDue}
        totalPaidThisYear={totalPaidThisYear}
        remainingToPay={remainingToPay}
        nextDueDate={nextDueDate}
        systemHealth={systemHealth}
        warningCount={warningCount}
        displayCurrency={displayCurrency}
      />

      {/* Section 4: Reconciliation Warnings */}
      <ReconciliationWarnings warnings={warnings} />

      {/* Section 2: Per Investment Breakdown */}
      <InvestmentBreakdown
        investments={investments}
        displayCurrency={displayCurrency}
        onRowClick={handleRowClick}
      />

      {/* Section 3: Hawl Timeline View */}
      <HawlTimelineView items={timelineItems} displayCurrency={displayCurrency} />

      {/* Section 5: Drill Down Modal */}
      <DrillDownModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        data={drillDownData}
        displayCurrency={displayCurrency}
      />
    </div>
  )
}
