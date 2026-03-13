'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { formatCurrencyAmount, type DisplayCurrency } from '@/lib/currency'

export type DrillDownData = {
  sourceBucket: string
  sourceAmount: number
  firstContributionDate: string
  receiptDate: string | null
  hawl1Start: string
  hawl1End: string
  amountHeldAtHawlEnd: number
  amountWithdrawnBeforeHawlEnd: number
  taxableAmount: number
  zakatRate: number
  zakatDue: number
  paymentStatus: 'paid' | 'unpaid' | 'partial'
  investedInSukuk: {
    name: string
    status: 'active' | 'closed' | 'matured'
  } | null
}

type DrillDownModalProps = {
  isOpen: boolean
  onClose: () => void
  data: DrillDownData | null
  displayCurrency: DisplayCurrency
}

export function DrillDownModal({ isOpen, onClose, data, displayCurrency }: DrillDownModalProps) {
  if (!data) return null

  const money = (val: number) => formatCurrencyAmount(val, displayCurrency, 'SAR')

  const getStatusBadge = (status: 'paid' | 'unpaid' | 'partial') => {
    switch (status) {
      case 'paid':
        return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300'
      case 'unpaid':
        return 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
      case 'partial':
        return 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300'
    }
  }

  const getStatusText = (status: 'paid' | 'unpaid' | 'partial') => {
    switch (status) {
      case 'paid':
        return '✅ Paid'
      case 'unpaid':
        return '❌ Unpaid'
      case 'partial':
        return '⏳ Partial'
    }
  }

  const getSukukStatusColor = (status: 'active' | 'closed' | 'matured') => {
    switch (status) {
      case 'active':
        return 'text-blue-600 dark:text-blue-400'
      case 'closed':
        return 'text-slate-600 dark:text-slate-400'
      case 'matured':
        return 'text-green-600 dark:text-green-400'
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black bg-opacity-50 backdrop-blur-sm"
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="w-full max-w-2xl max-h-[90vh] overflow-auto rounded-2xl bg-white shadow-2xl dark:bg-slate-800"
            >
              {/* Header */}
              <div className="sticky top-0 z-10 border-b border-slate-200 bg-gradient-to-r from-blue-500 to-blue-600 p-6 text-white dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold">Zakat Row Details</h2>
                    <p className="mt-1 text-sm opacity-90">{data.sourceBucket}</p>
                  </div>
                  <button
                    onClick={onClose}
                    className="rounded-full p-2 transition-colors hover:bg-white hover:bg-opacity-20"
                  >
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="p-6 space-y-6">
                {/* Source Information */}
                <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-700">
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                    Source Information
                  </h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-slate-400">Source Bucket:</span>
                      <span className="font-semibold text-slate-900 dark:text-white">{data.sourceBucket}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-slate-400">Source Amount:</span>
                      <span className="font-semibold text-slate-900 dark:text-white">{money(data.sourceAmount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-slate-400">First Contribution:</span>
                      <span className="font-semibold text-slate-900 dark:text-white">{data.firstContributionDate}</span>
                    </div>
                    {data.receiptDate && (
                      <div className="flex justify-between">
                        <span className="text-slate-600 dark:text-slate-400">Receipt Date:</span>
                        <span className="font-semibold text-slate-900 dark:text-white">{data.receiptDate}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Hawl Period */}
                <div className="rounded-xl bg-blue-50 p-4 dark:bg-blue-900 dark:bg-opacity-20">
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
                    Hawl Period (354 days)
                  </h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-slate-400">Hawl Start:</span>
                      <span className="font-semibold text-slate-900 dark:text-white">{data.hawl1Start}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-slate-400">Hawl End:</span>
                      <span className="font-semibold text-slate-900 dark:text-white">{data.hawl1End}</span>
                    </div>
                  </div>
                </div>

                {/* Calculation */}
                <div className="rounded-xl bg-amber-50 p-4 dark:bg-amber-900 dark:bg-opacity-20">
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                    Zakat Calculation
                  </h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-slate-400">Amount Held at Hawl End:</span>
                      <span className="font-semibold text-slate-900 dark:text-white">{money(data.amountHeldAtHawlEnd)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-slate-400">Withdrawn Before Hawl End:</span>
                      <span className="font-semibold text-red-600 dark:text-red-400">- {money(data.amountWithdrawnBeforeHawlEnd)}</span>
                    </div>
                    <div className="border-t border-amber-200 pt-2 dark:border-amber-700">
                      <div className="flex justify-between">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">Taxable Amount:</span>
                        <span className="font-bold text-slate-900 dark:text-white">{money(data.taxableAmount)}</span>
                      </div>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600 dark:text-slate-400">Zakat Rate:</span>
                      <span className="font-semibold text-slate-900 dark:text-white">{data.zakatRate}%</span>
                    </div>
                    <div className="border-t-2 border-amber-300 pt-2 dark:border-amber-600">
                      <div className="flex justify-between text-lg">
                        <span className="font-bold text-amber-700 dark:text-amber-400">Zakat Due:</span>
                        <span className="font-bold text-amber-700 dark:text-amber-400">{money(data.zakatDue)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Payment Status */}
                <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-700">
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                    Payment Status
                  </h3>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Status:</span>
                    <span className={`rounded-full px-4 py-1.5 text-sm font-semibold ${getStatusBadge(data.paymentStatus)}`}>
                      {getStatusText(data.paymentStatus)}
                    </span>
                  </div>
                </div>

                {/* Sukuk Investment */}
                {data.investedInSukuk && (
                  <div className="rounded-xl bg-purple-50 p-4 dark:bg-purple-900 dark:bg-opacity-20">
                    <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-purple-600 dark:text-purple-400">
                      Invested in Sukuk
                    </h3>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-slate-600 dark:text-slate-400">Sukuk Name:</span>
                        <span className="font-semibold text-slate-900 dark:text-white">{data.investedInSukuk.name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600 dark:text-slate-400">Status:</span>
                        <span className={`font-semibold uppercase ${getSukukStatusColor(data.investedInSukuk.status)}`}>
                          {data.investedInSukuk.status}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="sticky bottom-0 border-t border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900">
                <button
                  onClick={onClose}
                  className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-blue-700"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}
