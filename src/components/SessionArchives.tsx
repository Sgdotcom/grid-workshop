/**
 * Previous cleared live rooms stored on Cloudflare (not localStorage).
 */
import { useCallback, useEffect, useState } from 'react'
import type { LiveRoomArchiveMeta } from '@/lib/liveSession'
import { cn } from '@/lib/utils'

function formatClearedAt(iso: string) {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return iso
  try {
    return new Date(t).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return iso
  }
}

export function SessionArchives({
  enabled,
  fetchArchives,
  onRestore,
}: {
  enabled: boolean
  fetchArchives: () => Promise<LiveRoomArchiveMeta[]>
  /** Resolves to '' or an error message. */
  onRestore: (archiveId: string, password: string) => Promise<string>
}) {
  const [archives, setArchives] = useState<LiveRoomArchiveMeta[]>([])
  const [loading, setLoading] = useState(false)
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!enabled) {
      setArchives([])
      return
    }
    setLoading(true)
    const list = await fetchArchives()
    setArchives(list)
    setLoading(false)
  }, [enabled, fetchArchives])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const restore = async (id: string) => {
    if (!password) {
      setMessage('Enter the clear-room password to restore.')
      return
    }
    if (
      !window.confirm(
        'Replace the current shared room with this previous session for everyone? Current unsaved desk work may be overwritten.',
      )
    )
      return
    setBusyId(id)
    const error = await onRestore(id, password)
    setBusyId(null)
    setMessage(error || 'Session restored for everyone.')
    if (!error) {
      setPassword('')
      void refresh()
    }
  }

  if (!enabled) {
    return (
      <p className="text-[11px] leading-relaxed text-ink-muted">
        Join a live session to see previous cloud backups of this room.
      </p>
    )
  }

  return (
    <div className="space-y-2" data-testid="session-archives">
      <p className="text-[11px] leading-relaxed text-ink-muted">
        When you clear the shared room, a copy is kept in the cloud (not on this
        computer). Restore if a browser crashes after a clear, or to bring an
        earlier typeface back.
      </p>
      <input
        type="password"
        data-testid="restore-archive-password"
        aria-label="Password to restore a previous session"
        placeholder="Password to restore"
        autoComplete="off"
        value={password}
        onChange={(e) => {
          setPassword(e.target.value)
          setMessage('')
        }}
        className="w-full rounded-[3px] border border-line bg-paper px-2 py-2 text-xs"
      />
      <button
        type="button"
        className="options-link w-full"
        onClick={() => void refresh()}
        disabled={loading}
      >
        {loading ? 'Refreshing…' : 'Refresh list'}
      </button>
      {archives.length === 0 && !loading ? (
        <p className="text-[11px] text-ink-muted">No previous sessions yet.</p>
      ) : (
        <ul className="max-h-48 space-y-2 overflow-y-auto">
          {archives.map((arch) => (
            <li
              key={arch.id}
              className="rounded-[3px] border border-line/80 bg-paper-deep/40 px-2 py-2"
            >
              <p className="text-[11px] font-semibold text-ink">{formatClearedAt(arch.clearedAt)}</p>
              <p className="text-[10px] text-ink-muted">
                {arch.letterCount} letters · {arch.contributionCount} publishes ·{' '}
                {arch.draftCount} drafts
              </p>
              <button
                type="button"
                data-testid={`restore-archive-${arch.id}`}
                className={cn('options-link mt-1 w-full', busyId === arch.id && 'opacity-60')}
                disabled={!!busyId}
                onClick={() => void restore(arch.id)}
              >
                {busyId === arch.id ? 'Restoring…' : 'Restore for everyone'}
              </button>
            </li>
          ))}
        </ul>
      )}
      {message ? (
        <p className="text-[11px] text-ink-muted" role="status" data-testid="session-archives-message">
          {message}
        </p>
      ) : null}
    </div>
  )
}
