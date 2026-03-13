'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { modalBackdrop, modalContent } from '@/lib/animations'

export interface DrillDownData {
  rowId: string
  sourceBucket: string
  bucketAmount: number
  firstContributionDate: string | null
  receiptDate: string | null
  hawlStart: string
  hawlEnd: string
  amountHeld: number
  amountWithdrawn: number
  taxableAmount: number
  zakatRate: number
  zakatDue: number
  isPaid: boolean
  lastPaymentDate: string | null
  lastPaymentAmount: number | null
  investmentName: string | null
  investmentStatus: string | null
  rowKind: string | null
  why: string | null
  dueReceipts: Array<{
    date: string
    amount: number
    type: string
    investmentName?: string | null
  }>
}

interface DrillDownModalProps {
  isOpen: boolean
  onClose: () => void
  data: DrillDownData | null
  money: (v: number) => string
}

const Row = ({ label, value, gold }: { label: string; value: string | number | null; gold?: boolean }) => (
  <div className="flex items-center justify-between py-1.5">
    <span className="text-xs text-slate-400">{label}</span>
    <span className={`text-xs font-semibold tabular-nums ${gold ? 'text-[#c9a84c]' : 'text-slate-200'}`}>{value ?? '—'}</span>
  </div>
)

const kindBadge: Record<string, string> = {
  PROFIT: 'bg-emerald-500/15 text-emerald-300',
  PRINCIPAL: 'bg-sky-500/15 text-sky-300',
  COMMISSION: 'bg-blue-500/15 text-blue-300',
  IDLE: 'bg-amber-500/15 text-amber-300',
  RECEIPT: 'bg-teal-500/15 text-teal-300',
  REWARD: 'bg-violet-500/15 text-violet-300',
}

export function DrillDownModal({ isOpen, onClose, data, money }: DrillDownModalProps) {
  return (
    <AnimatePresence>
      {isOpen && data && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            variants={modalBackdrop}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={onClose}
          />
          <motion.div
            className="relative w-full max-w-md rounded-xl border border-white/10 bg-slate-800/95 shadow-2xl overflow-hidden max-h-[85vh] flex flex-col"
            variants={modalContent}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 shrink-0">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-100">Row Details</h3>
                <p className="text-xs text-slate-400 mt-0.5 truncate">{data.sourceBucket}</p>
              </div>
              <div className="flex items-center gap-2">
                {data.rowKind && (
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${kindBadge[data.rowKind] || kindBadge.IDLE}`}>
                    {data.rowKind}
                  </span>
                )}
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${data.isPaid ? 'bg-emerald-500/15 text-emerald-300' : data.zakatDue > 0 ? 'bg-amber-500/15 text-amber-300' : 'bg-slate-500/15 text-slate-400'}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${data.isPaid ? 'bg-emerald-400' : data.zakatDue > 0 ? 'bg-amber-400' : 'bg-slate-500'}`} />
                  {data.isPaid ? 'Paid' : data.zakatDue > 0 ? 'Due' : 'Upcoming'}
                </span>
                <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-white/5 transition-colors">
                  <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="overflow-y-auto px-5 py-4 space-y-4 flex-1">
              {/* Source */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Source</p>
                <div className="rounded-lg bg-white/[0.03] px-3 py-2 divide-y divide-white/5">
                  <Row label="Bucket" value={data.sourceBucket} />
                  <Row label="Balance" value={money(data.bucketAmount)} />
                  {data.firstContributionDate && <Row label="First Contribution" value={data.firstContributionDate} />}
                  {data.receiptDate && <Row label="Receipt Date" value={data.receiptDate} />}
                </div>
              </div>

              {/* Hawl */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Hawl Period</p>
                <div className="rounded-lg bg-white/[0.03] px-3 py-2 divide-y divide-white/5">
                  <Row label="Start" value={data.hawlStart} />
                  <Row label="End" value={data.hawlEnd} />
                  <Row label="Amount Held" value={money(data.amountHeld)} />
                  {data.amountWithdrawn > 0 && <Row label="Withdrawn" value={money(data.amountWithdrawn)} />}
                </div>
              </div>

              {/* Zakat */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#c9a84c]/50 mb-1">Zakat Calculation</p>
                <div className="rounded-lg bg-[#c9a84c]/[0.04] border border-[#c9a84c]/10 px-3 py-2 divide-y divide-[#c9a84c]/10">
                  <Row label="Taxable Amount" value={money(data.taxableAmount)} />
                  <Row label="Rate" value={`${(data.zakatRate * 100).toFixed(1)}%`} />
                  <Row label="Zakat Due" value={money(data.zakatDue)} gold />
                </div>
              </div>

              {/* Payment */}
              {(data.isPaid || data.lastPaymentDate) && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Payment</p>
                  <div className="rounded-lg bg-white/[0.03] px-3 py-2 divide-y divide-white/5">
                    <Row label="Status" value={data.isPaid ? 'Paid' : 'Unpaid'} />
                    {data.lastPaymentDate && <Row label="Last Payment" value={data.lastPaymentDate} />}
                    {data.lastPaymentAmount !== null && <Row label="Amount Paid" value={money(data.lastPaymentAmount)} />}
                  </div>
                </div>
              )}

              {/* Investment */}
              {data.investmentName && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Investment</p>
                  <div className="rounded-lg bg-white/[0.03] px-3 py-2 divide-y divide-white/5">
                    <Row label="Name" value={data.investmentName} />
                    <Row label="Status" value={data.investmentStatus} />
                  </div>
                </div>
              )}

              {/* Receipts */}
              {data.dueReceipts.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Receipts</p>
                  <div className="rounded-lg bg-white/[0.03] px-3 py-2 space-y-1">
                    {data.dueReceipts.map((r, i) => (
                      <div key={i} className="flex items-center justify-between text-xs py-1">
                        <span className="text-slate-300">{r.investmentName || r.type}</span>
                        <span className="text-slate-400 tabular-nums">{r.date} · {money(r.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Explanation */}
              {data.why && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Explanation</p>
                  <p className="text-xs text-slate-300 leading-relaxed rounded-lg bg-white/[0.03] px-3 py-2">{data.why}</p>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
