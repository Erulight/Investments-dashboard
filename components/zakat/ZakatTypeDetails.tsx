'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import {
  ZAKAT_RATE,
  calcSimpleZakat,
  calcSukukZakatPdf,
  calcSukukZakatStandard,
  type ZakatMode,
  type ZakatSettings,
  type ZakatSukukDeal,
} from '@/lib/zakat'

interface ZakatTypeDetailsProps {
  type: string
  sukukDeals: ZakatSukukDeal[]
  baseValue: number
}

const formatCurrency = (value: number) =>
  value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function ZakatTypeDetails({ type, sukukDeals, baseValue }: ZakatTypeDetailsProps) {
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

  const isSukuk = type.toLowerCase() === 'sukuk'

  const sukukBreakdown = useMemo(() => {
    if (!isSukuk) return null
    if (settings.mode === 'STANDARD') {
      const base = sukukDeals.reduce((sum, deal) => sum + deal.principalInvested, 0)
      return {
        total: calcSukukZakatStandard(base),
        deals: sukukDeals.map((deal) => ({
          dealId: deal.id,
          zakatDue: deal.principalInvested * ZAKAT_RATE,
          zakatableBase: deal.principalInvested,
          reason: 'Standard annual assessment',
        })),
        method: 'Standard Annual Assessment',
      }
    }
    const pdfResult = calcSukukZakatPdf(sukukDeals, settings)
    return {
      total: { zakatableBase: pdfResult.totalBase, zakatDue: pdfResult.totalDue },
      deals: pdfResult.results,
      method: 'PDF-based Sukuk Method',
    }
  }, [isSukuk, settings, sukukDeals])

  const summary = useMemo(() => {
    if (isSukuk && sukukBreakdown) return sukukBreakdown.total
    return calcSimpleZakat(baseValue)
  }, [baseValue, isSukuk, sukukBreakdown])

  const updateSetting = <K extends keyof ZakatSettings>(key: K, value: ZakatSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{type} Zakat Details</h1>
          <p className="text-sm text-gray-500 mt-1">Calculation method and line items</p>
        </div>
        <Link href="/zakat">
          <Button variant="secondary">Back to Zakat</Button>
        </Link>
      </div>

      {isSukuk && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-bold text-gray-900">Sukuk Settings</CardTitle>
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
              <div className="flex items-center gap-3 pt-6">
                <input
                  id="treat-profit-cash-detail"
                  type="checkbox"
                  checked={settings.treatSukukProfitAsCash}
                  onChange={(e) => updateSetting('treatSukukProfitAsCash', e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="treat-profit-cash-detail" className="text-sm text-gray-700">
                  Treat received Sukuk profit like cash on zakat date
                </label>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500">Zakatable Base (SAR)</p>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(summary.zakatableBase)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500">Zakat Due (SAR)</p>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(summary.zakatDue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500">Rate</p>
            <p className="text-2xl font-bold text-gray-900">{(ZAKAT_RATE * 100).toFixed(2)}%</p>
          </CardContent>
        </Card>
      </div>

      {isSukuk && sukukBreakdown && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-bold text-gray-900">Sukuk Deals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                      Deal ID
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                      Zakatable Base
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                      Zakat Due
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                      Why
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {sukukBreakdown.deals.map((deal) => (
                    <tr key={deal.dealId}>
                      <td className="px-4 py-3 text-sm text-gray-700">{deal.dealId}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {formatCurrency(deal.zakatableBase)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {formatCurrency(deal.zakatDue)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{deal.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
