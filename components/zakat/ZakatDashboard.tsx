'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import {
  ZAKAT_RATE,
  calcSimpleZakat,
  calcSukukZakatPdf,
  calcSukukZakatStandard,
  calcTotalZakat,
  type ZakatMode,
  type ZakatSettings,
  type ZakatSukukDeal,
} from '@/lib/zakat'

interface ZakatDashboardProps {
  sukukDeals: ZakatSukukDeal[]
  circlysBase: number
  cryptoBase: number
  sipBase: number
  otherBase: number
}

const formatCurrency = (value: number) =>
  value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function ZakatDashboard({
  sukukDeals,
  circlysBase,
  cryptoBase,
  sipBase,
  otherBase,
}: ZakatDashboardProps) {
  const [settings, setSettings] = useState<ZakatSettings>({
    mode: 'PDF',
    zakatDate: new Date().toISOString().split('T')[0],
    nisabRef: 'Gold',
    nisabValue: 0,
    includeLiabilities: false,
    liabilities: 0,
    treatSukukProfitAsCash: false,
    cashBalance: 0,
  })

  const sukukSummary = useMemo(() => {
    if (settings.mode === 'STANDARD') {
      const base = sukukDeals.reduce((sum, deal) => sum + deal.principalInvested, 0)
      return { ...calcSukukZakatStandard(base), method: 'Standard Annual Assessment' }
    }
    const pdfResult = calcSukukZakatPdf(sukukDeals, settings)
    return {
      zakatableBase: pdfResult.totalBase,
      zakatDue: pdfResult.totalDue,
      method: 'PDF-based Sukuk Method',
    }
  }, [settings, sukukDeals])

  const circlysSummary = useMemo(() => calcSimpleZakat(circlysBase), [circlysBase])
  const cryptoSummary = useMemo(() => calcSimpleZakat(cryptoBase), [cryptoBase])
  const sipSummary = useMemo(() => calcSimpleZakat(sipBase), [sipBase])
  const cashSummary = useMemo(() => calcSimpleZakat(settings.cashBalance), [settings.cashBalance])
  const otherSummary = useMemo(() => calcSimpleZakat(otherBase), [otherBase])

  const breakdown = useMemo(
    () => [
      {
        type: 'Sukuk',
        ...sukukSummary,
      },
      { type: 'Circlys', ...circlysSummary, method: 'Annual cash-like' },
      { type: 'Crypto', ...cryptoSummary, method: 'Annual cash-like' },
      { type: 'SIP', ...sipSummary, method: 'Annual cash-like' },
      { type: 'Cash', ...cashSummary, method: 'Annual cash-like' },
      { type: 'Other', ...otherSummary, method: 'Annual cash-like' },
    ],
    [sukukSummary, circlysSummary, cryptoSummary, sipSummary, cashSummary, otherSummary]
  )

  const totals = useMemo(() => calcTotalZakat(breakdown, settings), [breakdown, settings])

  const updateSetting = <K extends keyof ZakatSettings>(key: K, value: ZakatSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-gray-900">Zakat Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Zakat Mode</label>
              <select
                value={settings.mode}
                onChange={(e) => updateSetting('mode', e.target.value as ZakatMode)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              >
                <option value="PDF">PDF-based Sukuk Method (Receivable-on-receipt)</option>
                <option value="STANDARD">Standard Annual Assessment (cash-like)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Zakat Date</label>
              <input
                type="date"
                value={settings.zakatDate}
                onChange={(e) => updateSetting('zakatDate', e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nisab Reference</label>
              <select
                value={settings.nisabRef}
                onChange={(e) => updateSetting('nisabRef', e.target.value as ZakatSettings['nisabRef'])}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              >
                <option value="Gold">Gold</option>
                <option value="Silver">Silver</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nisab Value (SAR)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={settings.nisabValue}
                onChange={(e) => updateSetting('nisabValue', Number(e.target.value))}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cash Balance (SAR)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={settings.cashBalance}
                onChange={(e) => updateSetting('cashBalance', Number(e.target.value))}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-3 pt-6">
              <input
                id="include-liabilities"
                type="checkbox"
                checked={settings.includeLiabilities}
                onChange={(e) => updateSetting('includeLiabilities', e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="include-liabilities" className="text-sm text-gray-700">
                Include Debts/Liabilities Deduction
              </label>
            </div>
            {settings.includeLiabilities && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Short-term Payable Debts (SAR)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={settings.liabilities}
                  onChange={(e) => updateSetting('liabilities', Number(e.target.value))}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
            <div className="flex items-center gap-3 pt-6">
              <input
                id="treat-profit-cash"
                type="checkbox"
                checked={settings.treatSukukProfitAsCash}
                onChange={(e) => updateSetting('treatSukukProfitAsCash', e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="treat-profit-cash" className="text-sm text-gray-700">
                Treat received Sukuk profit like cash on zakat date
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500">Total Zakat Due (SAR)</p>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(totals.totalDue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500">Zakatable Assets Total (SAR)</p>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(totals.totalAssets)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500">Liabilities Deducted (SAR)</p>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(totals.liabilities)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500">Nisab Status</p>
            <p className={`text-2xl font-bold ${totals.aboveNisab ? 'text-green-600' : 'text-red-600'}`}>
              {totals.aboveNisab ? 'Above Nisab' : 'Below Nisab'}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-bold text-gray-900">Zakat Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                    Zakatable Base (SAR)
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                    Zakat Due (SAR)
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                    Method
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {breakdown.map((item) => (
                  <tr key={item.type}>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{item.type}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{formatCurrency(item.zakatableBase)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{formatCurrency(item.zakatDue)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{item.method}</td>
                    <td className="px-4 py-3 text-sm">
                      <Link href={`/zakat/${item.type.toLowerCase()}`}>
                        <Button variant="ghost" size="sm">
                          View Details
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 text-sm text-gray-600">
          Zakat rate applied: {(ZAKAT_RATE * 100).toFixed(2)}%
        </CardContent>
      </Card>
    </div>
  )
}
