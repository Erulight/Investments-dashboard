'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'

export function BackupRestore() {
  const [isDownloading, setIsDownloading] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const handleDownloadBackup = async () => {
    try {
      setIsDownloading(true)
      setMessage(null)

      const response = await fetch('/api/admin/backup')
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create backup')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `backup-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)

      setMessage({ type: 'success', text: 'Backup downloaded successfully!' })
    } catch (error) {
      console.error('Backup error:', error)
      setMessage({ 
        type: 'error', 
        text: error instanceof Error ? error.message : 'Failed to download backup' 
      })
    } finally {
      setIsDownloading(false)
    }
  }

  const handleRestoreBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      setIsRestoring(true)
      setMessage(null)

      const text = await file.text()
      const backup = JSON.parse(text)

      const response = await fetch('/api/admin/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(backup),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to restore backup')
      }

      setMessage({ 
        type: 'success', 
        text: `Backup restored! ${result.restoredCounts?.investments || 0} investments, ${result.restoredCounts?.people || 0} people, ${result.restoredCounts?.cashBuckets || 0} buckets restored.` 
      })

      // Refresh the page after a short delay
      setTimeout(() => {
        window.location.reload()
      }, 2000)
    } catch (error) {
      console.error('Restore error:', error)
      setMessage({ 
        type: 'error', 
        text: error instanceof Error ? error.message : 'Failed to restore backup' 
      })
    } finally {
      setIsRestoring(false)
      e.target.value = ''
    }
  }

  return (
    <div className="space-y-4">
      {/* Backup Section */}
      <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 dark:border-emerald-500/20 dark:bg-emerald-500/5 p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-500/20 text-xl">
              💾
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Backup All Data
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Download a complete backup of all investments, partners, debts, cash buckets, and settings
              </div>
            </div>
          </div>
          <button
            onClick={handleDownloadBackup}
            disabled={isDownloading}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-white dark:bg-emerald-500/10 dark:border-emerald-500/30 px-4 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDownloading ? (
              <>
                <span className="animate-spin">⏳</span>
                Downloading...
              </>
            ) : (
              <>
                <span>⬇️</span>
                Download Backup
              </>
            )}
          </button>
        </div>
      </div>

      {/* Restore Section */}
      <div className="rounded-xl border border-amber-100 bg-amber-50/50 dark:border-amber-500/20 dark:bg-amber-500/5 p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-500/20 text-xl">
              📥
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Restore from Backup
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Upload a backup file to restore your data — this will replace all current data
              </div>
            </div>
          </div>
          <label className="shrink-0 cursor-pointer">
            <input
              type="file"
              accept=".json"
              onChange={handleRestoreBackup}
              disabled={isRestoring}
              className="hidden"
            />
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-white dark:bg-amber-500/10 dark:border-amber-500/30 px-4 py-2 text-xs font-semibold text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/20 transition-colors disabled:opacity-50">
              {isRestoring ? (
                <>
                  <span className="animate-spin">⏳</span>
                  Restoring...
                </>
              ) : (
                <>
                  <span>⬆️</span>
                  Upload Backup
                </>
              )}
            </span>
          </label>
        </div>
      </div>

      {/* Warning */}
      <div className="rounded-xl border border-red-100 bg-red-50/50 dark:border-red-500/20 dark:bg-red-500/5 p-4">
        <div className="flex items-start gap-3">
          <span className="text-xl">⚠️</span>
          <div className="text-xs text-red-600 dark:text-red-400 space-y-1">
            <p className="font-semibold">Important Warnings:</p>
            <ul className="list-disc list-inside space-y-0.5 pl-2">
              <li>Restoring a backup will <strong>permanently delete</strong> all current data</li>
              <li>Always download a fresh backup before restoring an old one</li>
              <li>The page will refresh automatically after restore completes</li>
              <li>Only upload backup files generated by this system</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Status Messages */}
      {message && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`rounded-xl border p-4 ${
            message.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10'
              : 'border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10'
          }`}
        >
          <div className="flex items-start gap-2">
            <span className="text-lg">{message.type === 'success' ? '✅' : '❌'}</span>
            <p className={`text-sm font-medium ${
              message.type === 'success' 
                ? 'text-emerald-700 dark:text-emerald-400' 
                : 'text-red-700 dark:text-red-400'
            }`}>
              {message.text}
            </p>
          </div>
        </motion.div>
      )}
    </div>
  )
}
