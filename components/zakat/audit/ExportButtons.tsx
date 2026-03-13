'use client'

import { useState } from 'react'

type ExportButtonsProps = {
  onExportPDF: () => Promise<void>
  onExportCSV: () => Promise<void>
}

export function ExportButtons({ onExportPDF, onExportCSV }: ExportButtonsProps) {
  const [loadingPDF, setLoadingPDF] = useState(false)
  const [loadingCSV, setLoadingCSV] = useState(false)

  const handlePDFExport = async () => {
    setLoadingPDF(true)
    try {
      await onExportPDF()
    } finally {
      setLoadingPDF(false)
    }
  }

  const handleCSVExport = async () => {
    setLoadingCSV(true)
    try {
      await onExportCSV()
    } finally {
      setLoadingCSV(false)
    }
  }

  return (
    <div className="flex flex-wrap gap-3">
      <button
        onClick={handlePDFExport}
        disabled={loadingPDF}
        className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 font-semibold text-white shadow-md transition-all hover:bg-red-700 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loadingPDF ? (
          <>
            <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span>Generating PDF...</span>
          </>
        ) : (
          <>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
              />
            </svg>
            <span>Export Zakat Report (PDF)</span>
          </>
        )}
      </button>

      <button
        onClick={handleCSVExport}
        disabled={loadingCSV}
        className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 font-semibold text-white shadow-md transition-all hover:bg-emerald-700 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loadingCSV ? (
          <>
            <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span>Generating CSV...</span>
          </>
        ) : (
          <>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <span>Export Ledger (CSV)</span>
          </>
        )}
      </button>
    </div>
  )
}
