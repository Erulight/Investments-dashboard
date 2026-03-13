'use client'

import { useCallback } from 'react'

interface BucketRow {
  id: string
  label?: string | null
  source: string
  sourceGroup: string
  sourceType: string
  currency: string
  balance: number
  haulStartDate: string
  haulCompleteDate: string
  idleBase: number
  receiptsTotal: number
  zakatDue: number
  isPaid: boolean
  haulCompleted: boolean
  rowKind?: string | null
  why?: string | null
}

interface ExportButtonsProps {
  rows: BucketRow[]
  totalWealth: number
  totalDue: number
  totalPaidThisYear: number
  remainingToPay: number
  warningCount: number
  money: (v: number) => string
}

export function ExportButtons({
  rows,
  totalWealth,
  totalDue,
  totalPaidThisYear,
  remainingToPay,
  warningCount,
  money,
}: ExportButtonsProps) {
  const fmt = useCallback((n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), [])

  const handleExportPDF = useCallback(() => {
    const win = window.open('', '_blank', 'width=1000,height=800')
    if (!win) return

    const now = new Date().toLocaleString()
    const groups = new Map<string, BucketRow[]>()
    for (const r of rows) {
      const key = r.source || 'General Cash'
      groups.set(key, [...(groups.get(key) || []), r])
    }

    const dueRows = rows.filter(r => r.zakatDue > 0 && !r.isPaid)
    const paidRows = rows.filter(r => r.isPaid)

    const groupHTML = Array.from(groups.entries()).map(([name, items]) => {
      const groupDue = items.reduce((s, r) => s + (r.zakatDue || 0), 0)
      return `
        <tr style="background:#0d1b2a">
          <td colspan="7" style="padding:10px 14px;font-weight:700;font-size:12px;color:#c9a84c;border-bottom:1px solid #1e3a5f">
            ${name} — ${items.length} item(s) — Zakat Due: SAR ${fmt(groupDue)}
          </td>
        </tr>
        ${items.map(r => `
          <tr style="border-bottom:1px solid #1a2e4a">
            <td style="padding:8px 14px 8px 24px;font-size:11px;color:#cbd5e1">${(r.label || r.source || '—').replace(/\u2022/g, '•')}</td>
            <td style="padding:8px 10px;font-size:11px;color:#94a3b8">${r.rowKind || '—'}</td>
            <td style="padding:8px 10px;font-size:11px;color:#94a3b8">${r.haulStartDate}</td>
            <td style="padding:8px 10px;font-size:11px;color:#94a3b8">${r.haulCompleteDate}</td>
            <td style="padding:8px 10px;font-size:11px;color:#94a3b8;text-align:right">SAR ${fmt(r.idleBase + r.receiptsTotal)}</td>
            <td style="padding:8px 10px;font-size:11px;text-align:right;font-weight:600;color:${r.zakatDue > 0 ? '#fbbf24' : '#34d399'}">SAR ${fmt(r.zakatDue)}</td>
            <td style="padding:8px 10px;font-size:11px;text-align:center">
              <span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:10px;font-weight:600;background:${r.isPaid ? 'rgba(52,211,153,0.15)' : r.zakatDue > 0 ? 'rgba(251,191,36,0.15)' : 'rgba(100,116,139,0.15)'};color:${r.isPaid ? '#34d399' : r.zakatDue > 0 ? '#fbbf24' : '#94a3b8'}">
                ${r.isPaid ? 'PAID' : r.zakatDue > 0 ? 'DUE' : 'UPCOMING'}
              </span>
            </td>
          </tr>
        `).join('')}
      `
    }).join('')

    win.document.write(`<!DOCTYPE html><html><head><title>Zakat Audit Report — ${now}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Segoe UI',system-ui,sans-serif; background:#0a1628; color:#e2e8f0; padding:32px; }
  .header { text-align:center; margin-bottom:32px; }
  .header h1 { font-size:24px; color:#c9a84c; margin-bottom:4px; }
  .header p { font-size:12px; color:#64748b; }
  .summary { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; margin-bottom:32px; }
  .stat { background:#0d1b2a; border:1px solid #1e3a5f; border-radius:12px; padding:16px; }
  .stat-label { font-size:10px; text-transform:uppercase; letter-spacing:0.05em; color:#64748b; margin-bottom:6px; }
  .stat-value { font-size:20px; font-weight:700; }
  .stat-due { color:#fbbf24; }
  .stat-paid { color:#34d399; }
  .stat-remaining { color:#f87171; }
  .stat-wealth { color:#60a5fa; }
  table { width:100%; border-collapse:collapse; margin-bottom:24px; }
  th { background:#0d1b2a; color:#64748b; text-align:left; padding:10px 14px; font-size:10px; text-transform:uppercase; letter-spacing:0.05em; border-bottom:2px solid #1e3a5f; }
  .recon { background:#0d1b2a; border:1px solid #1e3a5f; border-radius:12px; padding:20px; margin-bottom:24px; }
  .recon h3 { font-size:14px; color:#e2e8f0; margin-bottom:8px; }
  .recon-status { display:inline-block; padding:4px 12px; border-radius:9999px; font-size:11px; font-weight:600; }
  .footer { text-align:center; margin-top:32px; padding-top:16px; border-top:1px solid #1e3a5f; font-size:10px; color:#475569; }
  @media print { @page { margin:16mm; } body { background:#fff; color:#1e293b; } th { background:#f1f5f9; color:#475569; border-bottom:2px solid #cbd5e1; } tr { border-bottom:1px solid #e2e8f0; } td { color:#1e293b !important; } .stat { background:#f8fafc; border-color:#e2e8f0; } .stat-label { color:#64748b; } .stat-due { color:#b45309; } .stat-paid { color:#059669; } .stat-remaining { color:#dc2626; } .stat-wealth { color:#1e40af; } .recon { background:#f8fafc; border-color:#e2e8f0; } }
</style>
</head><body>
<div class="header">
  <h1>🕌 Zakat Audit & Verification Report</h1>
  <p>Generated: ${now}</p>
</div>
<div class="summary">
  <div class="stat"><div class="stat-label">Total Wealth Tracked</div><div class="stat-value stat-wealth">SAR ${fmt(totalWealth)}</div></div>
  <div class="stat"><div class="stat-label">Total Zakat Due</div><div class="stat-value stat-due">SAR ${fmt(totalDue)}</div></div>
  <div class="stat"><div class="stat-label">Total Paid This Year</div><div class="stat-value stat-paid">SAR ${fmt(totalPaidThisYear)}</div></div>
  <div class="stat"><div class="stat-label">Remaining to Pay</div><div class="stat-value stat-remaining">SAR ${fmt(remainingToPay)}</div></div>
</div>
<div class="recon">
  <h3>Reconciliation</h3>
  <span class="recon-status" style="background:${warningCount === 0 ? 'rgba(52,211,153,0.15)' : 'rgba(251,191,36,0.15)'};color:${warningCount === 0 ? '#34d399' : '#fbbf24'}">
    ${warningCount === 0 ? '✓ All Calculations Verified' : `⚠ ${warningCount} Warning(s) Found`}
  </span>
  <p style="margin-top:8px;font-size:11px;color:#94a3b8">Due rows: ${dueRows.length} | Paid rows: ${paidRows.length} | Total rows: ${rows.length}</p>
</div>
<table>
  <thead><tr>
    <th>Item</th><th>Type</th><th>Hawl Start</th><th>Hawl End</th><th style="text-align:right">Amount</th><th style="text-align:right">Zakat Due</th><th style="text-align:center">Status</th>
  </tr></thead>
  <tbody>${groupHTML}</tbody>
</table>
<div class="footer">
  <p>This report is auto-generated by the Zakat Audit System. Please verify all calculations with a qualified Islamic scholar.</p>
</div>
</body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 500)
  }, [rows, totalWealth, totalDue, totalPaidThisYear, remainingToPay, warningCount, fmt])

  const handleExportCSV = useCallback(() => {
    const headers = ['Date', 'Type', 'Source', 'Description', 'Hawl Start', 'Hawl End', 'Amount', 'Zakat Due', 'Status', 'Investment']
    const csvRows = rows.map(r => [
      r.haulCompleteDate,
      r.rowKind || 'IDLE',
      r.source || 'General',
      (r.label || '').replace(/,/g, ';').replace(/"/g, '""'),
      r.haulStartDate,
      r.haulCompleteDate,
      (r.idleBase + r.receiptsTotal).toFixed(2),
      r.zakatDue.toFixed(2),
      r.isPaid ? 'PAID' : r.zakatDue > 0 ? 'DUE' : 'UPCOMING',
      (r.source || '').replace(/,/g, ';'),
    ])

    const csv = [headers, ...csvRows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n')

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `zakat-audit-${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, [rows])

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleExportPDF}
        className="flex items-center gap-2 rounded-lg bg-[#c9a84c]/20 border border-[#c9a84c]/40 px-4 py-2.5 text-sm font-semibold text-[#c9a84c] hover:bg-[#c9a84c]/30 transition-colors"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
        </svg>
        Export PDF Report
      </button>
      <button
        onClick={handleExportCSV}
        className="flex items-center gap-2 rounded-lg bg-slate-700/40 border border-slate-600/40 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-slate-700/60 transition-colors"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
        </svg>
        Export CSV Ledger
      </button>
    </div>
  )
}
