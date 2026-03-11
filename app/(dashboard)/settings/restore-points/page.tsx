'use client'

import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'

interface Snapshot {
  id: string
  createdAt: string
  label: string
  trigger: string
  restoredAt?: string
  userId?: string
}

export default function RestorePointsPage() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'trigger'>('newest')
  const [searchQuery, setSearchQuery] = useState('')
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [cleaning, setCleaning] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const showMessage = (message: string, type: 'success' | 'error' = 'success') => {
    alert(`${type.toUpperCase()}: ${message}`)
  }

  const fetchSnapshots = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/admin/snapshots?filter=${filter}`)
      if (!response.ok) throw new Error('Failed to fetch snapshots')
      const data = await response.json()
      setSnapshots(data.snapshots || [])
    } catch (error) {
      console.error('Error fetching snapshots:', error)
      showMessage('Failed to load restore points', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleRestore = async (snapshotId: string) => {
    if (!confirm('Are you sure you want to restore this snapshot? This action cannot be undone.')) {
      return
    }

    try {
      setRestoringId(snapshotId)
      const response = await fetch(`/api/admin/restore/${snapshotId}`, {
        method: 'POST',
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to restore snapshot')
      }

      const result = await response.json()
      showMessage(`Restored successfully! ${result.changes?.length || 0} changes applied. This restore point can be used again.`)
      fetchSnapshots()
    } catch (error) {
      console.error('Error restoring snapshot:', error)
      showMessage(error instanceof Error ? error.message : 'Failed to restore snapshot', 'error')
    } finally {
      setRestoringId(null)
    }
  }

  const handleDelete = async (snapshotId: string) => {
    if (!confirm('Are you sure you want to delete this restore point? This action cannot be undone.')) {
      return
    }

    try {
      setDeletingId(snapshotId)
      const response = await fetch(`/api/admin/snapshots/${snapshotId}`, {
        method: 'DELETE',
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete snapshot')
      }

      showMessage('Restore point deleted successfully')
      fetchSnapshots()
    } catch (error) {
      console.error('Error deleting snapshot:', error)
      showMessage(error instanceof Error ? error.message : 'Failed to delete snapshot', 'error')
    } finally {
      setDeletingId(null)
    }
  }

  const handleCleanup = async () => {
    if (!confirm('Are you sure you want to delete ALL restore points? This action cannot be undone.')) {
      return
    }

    try {
      setCleaning(true)
      const response = await fetch('/api/admin/snapshots/cleanup', {
        method: 'POST',
      })
      
      if (!response.ok) throw new Error('Failed to cleanup snapshots')
      
      const result = await response.json()
      showMessage(`Cleanup completed! Deleted ${result.deletedCount} snapshots.`)
      fetchSnapshots()
    } catch (error) {
      console.error('Error cleaning up snapshots:', error)
      showMessage('Failed to cleanup snapshots', 'error')
    } finally {
      setCleaning(false)
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffHours / 24)

    if (diffHours < 1) {
      const diffMins = Math.floor(diffMs / (1000 * 60))
      return `${diffMins} minutes ago`
    } else if (diffHours < 24) {
      return `${diffHours} hours ago`
    } else if (diffDays === 1) {
      return `Yesterday at ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
    } else if (diffDays < 7) {
      return `${diffDays} days ago`
    } else {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      })
    }
  }

  useEffect(() => {
    fetchSnapshots()
  }, [filter])

  const visibleSnapshots = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const filtered = query
      ? snapshots.filter((snapshot) => {
          const label = snapshot.label.toLowerCase()
          const trigger = snapshot.trigger.toLowerCase()
          return label.includes(query) || trigger.includes(query)
        })
      : snapshots

    return [...filtered].sort((a, b) => {
      if (sortBy === 'oldest') {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      }
      if (sortBy === 'trigger') {
        return a.trigger.localeCompare(b.trigger)
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
  }, [snapshots, searchQuery, sortBy])

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">🔄 Restore Points</h1>
        <p className="text-gray-600 mt-2">
          Roll back to a previous state if something went wrong
        </p>
      </div>

      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-4">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by label or trigger"
            className="md:col-span-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 transition-colors placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'newest' | 'oldest' | 'trigger')}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100"
          >
            <option value="newest">Arrange: Newest first</option>
            <option value="oldest">Arrange: Oldest first</option>
            <option value="trigger">Arrange: Trigger (A-Z)</option>
          </select>
          <Button onClick={fetchSnapshots} className="bg-slate-700 text-white hover:bg-slate-800 dark:bg-white/10 dark:hover:bg-white/15">
            Refresh
          </Button>
        </div>

        <div className="text-sm text-slate-600 dark:text-slate-400">
          Showing {visibleSnapshots.length} of {snapshots.length} restore points
        </div>

        <div className="flex space-x-2">
          <Button 
            onClick={() => setFilter('hour')}
            className={filter === 'hour' ? 'bg-blue-500 text-white' : 'bg-gray-200'}
          >
            Last Hour
          </Button>
          <Button 
            onClick={() => setFilter('day')}
            className={filter === 'day' ? 'bg-blue-500 text-white' : 'bg-gray-200'}
          >
            Today
          </Button>
          <Button 
            onClick={() => setFilter('week')}
            className={filter === 'week' ? 'bg-blue-500 text-white' : 'bg-gray-200'}
          >
            This Week
          </Button>
          <Button 
            onClick={() => setFilter('all')}
            className={filter === 'all' ? 'bg-blue-500 text-white' : 'bg-gray-200'}
          >
            All
          </Button>
        </div>

        {loading ? (
          <Card>
            <CardContent className="flex items-center justify-center py-8">
              <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900"></div>
                <span>Loading restore points...</span>
              </div>
            </CardContent>
          </Card>
        ) : visibleSnapshots.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <div className="text-4xl mb-4">🔄</div>
              <h3 className="text-lg font-semibold mb-2">No restore points found</h3>
              <p className="text-gray-600">
                Try changing filters or search query.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {visibleSnapshots.map((snapshot) => (
              <Card key={snapshot.id}>
                <CardContent className="flex items-center justify-between p-6">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <div>
                        <h3 className="font-semibold">{snapshot.label}</h3>
                        <div className="flex items-center space-x-2 mt-1">
                          <span className="text-sm text-gray-600">
                            {formatDate(snapshot.createdAt)}
                          </span>
                          <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                            {snapshot.trigger}
                          </span>
                          {snapshot.restoredAt && (
                            <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                              Restored {formatDate(snapshot.restoredAt)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      onClick={() => handleRestore(snapshot.id)}
                      disabled={!!restoringId || !!deletingId}
                      className="bg-red-500 text-white hover:bg-red-600 disabled:bg-gray-300"
                    >
                      {restoringId === snapshot.id ? 'Restoring...' : 'Restore Again'}
                    </Button>
                    <Button
                      onClick={() => handleDelete(snapshot.id)}
                      disabled={!!restoringId || !!deletingId}
                      className="bg-gray-700 text-white hover:bg-gray-800 disabled:bg-gray-300"
                    >
                      {deletingId === snapshot.id ? 'Deleting...' : 'Delete'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <span>🗑️</span>
            <span>Maintenance</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-600 mb-4">
            Clean up old restore points to free up database space
          </p>
          <Button
            onClick={handleCleanup}
            disabled={cleaning}
            className="bg-red-500 text-white hover:bg-red-600"
          >
            {cleaning ? 'Cleaning...' : 'Run Cleanup'}
          </Button>
          <p className="text-xs text-gray-500 mt-2">
            Removes ALL restore points from the database.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
