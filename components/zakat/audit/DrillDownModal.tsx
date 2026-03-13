'use client'

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

const DetailRow = ({ label, value, highlight }: { label: string; value: string | number | null; highlight?: boolean }) => (
  <div className="flex items-center justify-between py-2 border-b border-slate-700/30 last:border-b-0">
    <span className="text-xs text-slate-400">{label}</span>
    <span className={`text-xs font-semibold tabular-nums ${highlight ? 'text-[#c9a84c]' : 'text-slate-200'}`}>
      {value ?? '—'}
    </span>
  </div>
)

const kindColors: Record<string, { bg: string; text: string }> = {
  PROFIT: { bg: 'bg-purple-500/20', text: 'text-purple-300' },
  PRINCIPAL: { bg: 'bg-blue-500/20', text: 'text-blue-300' },
  COMMISSION: { bg: 'bg-cyan-500/20', text: 'text-cyan-300' },
  IDLE: { bg: 'bg-slate-500/20', text: 'text-slate-400' },
  RECEIPT: { bg: 'bg-amber-500/20', text: 'text-amber-300' },
  REWARD: { bg: 'bg-pink-500/20', text: 'text-pink-300' },
}

export function DrillDownModal({ isOpen, onClose, data, money }: DrillDownModalProps) {
  if (!isOpen || !data) return null

  const kb = data.rowKind ? kindColors[data.rowKind] || kindColors.IDLE : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-700/60 bg-[#0a1628] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-700/40 px-6 py-4 bg-gradient-to-r from-slate-800/80 to-slate-900/80 shrink-0">
          <div>
            <h3 className="text-base font-bold text-slate-100">Zakat Row Details</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {data.sourceBucket}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors"
          >
            <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-4 space-y-5 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {kb && (
              <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold ${kb.bg} ${kb.text}`}>
                {data.rowKind}
              </span>
            )}
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold ${data.isPaid ? 'bg-emerald-500/20 text-emerald-300' : data.zakatDue > 0 ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-500/20 text-slate-400'}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${data.isPaid ? 'bg-emerald-400' : data.zakatDue > 0 ? 'bg-amber-400' : 'bg-slate-500'}`} />
              {data.isPaid ? 'Paid' : data.zakatDue > 0 ? 'Due Now' : 'Upcoming'}
            </span>
          </div>

          <div className="rounded-xl border border-slate-700/40 bg-slate-800/30 p-4 space-y-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Source Information</p>
            <DetailRow label="Source Bucket" value={data.sourceBucket} />
            <DetailRow label="Bucket Amount" value={money(data.bucketAmount)} />
            {data.firstContributionDate && (
              <DetailRow label="First Contribution Date" value={data.firstContributionDate} />
            )}
            {data.receiptDate && (
              <DetailRow label="Receipt Date" value={data.receiptDate} />
            )}
          </div>

          <div className="rounded-xl border border-slate-700/40 bg-slate-800/30 p-4 space-y-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Hawl Period</p>
            <DetailRow label="Hawl Start" value={data.hawlStart} />
            <DetailRow label="Hawl End" value={data.hawlEnd} />
            <DetailRow label="Amount Held at Hawl End" value={money(data.amountHeld)} />
            <DetailRow label="Amount Withdrawn Before End" value={money(data.amountWithdrawn)} />
          </div>

          <div className="rounded-xl border border-[#c9a84c]/30 bg-[#c9a84c]/5 p-4 space-y-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#c9a84c]/60 mb-2">Zakat Calculation</p>
            <DetailRow label="Taxable Amount" value={money(data.taxableAmount)} />
            <DetailRow label="Zakat Rate" value={`${(data.zakatRate * 100).toFixed(1)}%`} />
            <DetailRow label="Zakat Due" value={money(data.zakatDue)} highlight />
          </div>

          <div className="rounded-xl border border-slate-700/40 bg-slate-800/30 p-4 space-y-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Payment Status</p>
            <DetailRow label="Status" value={data.isPaid ? 'Paid' : data.zakatDue > 0 ? 'Unpaid — Due Now' : 'Upcoming'} />
            {data.lastPaymentDate && (
              <>
                <DetailRow label="Last Payment Date" value={data.lastPaymentDate} />
                <DetailRow label="Last Payment Amount" value={data.lastPaymentAmount !== null ? money(data.lastPaymentAmount) : null} />
              </>
            )}
          </div>

          {data.investmentName && (
            <div className="rounded-xl border border-slate-700/40 bg-slate-800/30 p-4 space-y-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Investment Link</p>
              <DetailRow label="Sukuk Name" value={data.investmentName} />
              <DetailRow label="Current Status" value={data.investmentStatus} />
            </div>
          )}

          {data.dueReceipts.length > 0 && (
            <div className="rounded-xl border border-slate-700/40 bg-slate-800/30 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Associated Receipts</p>
              <div className="space-y-1.5">
                {data.dueReceipts.map((r, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
                      <span className="text-slate-300">{r.investmentName || r.type}</span>
                    </div>
                    <div className="flex items-center gap-3 text-slate-400 tabular-nums">
                      <span>{r.date}</span>
                      <span>{money(r.amount)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.why && (
            <div className="rounded-xl border border-slate-700/40 bg-slate-800/30 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Explanation</p>
              <p className="text-xs text-slate-300 leading-relaxed">{data.why}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
