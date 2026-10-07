/**
 * Simple shared-session control: pick a room name and join.
 * No write token — desks and wall just use the same room.
 */
import { useState } from 'react'
import { DEFAULT_LIVE_ROOM, getLiveConfig } from '@/lib/liveSession'
import { cn } from '@/lib/utils'

export function LiveSessionJoin({
  room,
  statusMessage,
  enabled,
  joined,
  onJoin,
  compact,
  className,
}: {
  room: string
  statusMessage: string
  enabled: boolean
  joined: boolean
  onJoin: (room: string) => void
  compact?: boolean
  className?: string
}) {
  const [draft, setDraft] = useState(room || DEFAULT_LIVE_ROOM)

  if (!enabled && !getLiveConfig().enabled) {
    return (
      <div className={cn('live-session-join is-off', className)} data-testid="live-session-join">
        <p>Shared session is not configured on this site.</p>
      </div>
    )
  }

  return (
    <div
      className={cn('live-session-join', compact && 'is-compact', joined && 'is-joined', className)}
      data-testid="live-session-join"
    >
      {!compact && <p className="live-session-join-title">Shared session</p>}
      <div className="live-session-join-row">
        <label>
          <span>Room</span>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onJoin(draft.trim() || DEFAULT_LIVE_ROOM)
            }}
            spellCheck={false}
            placeholder={DEFAULT_LIVE_ROOM}
            aria-label="Session room name"
          />
        </label>
        <button
          type="button"
          data-testid="live-session-join-btn"
          onClick={() => onJoin(draft.trim() || DEFAULT_LIVE_ROOM)}
        >
          {joined && draft.trim() === room ? 'Joined' : 'Join session'}
        </button>
      </div>
      <p className="live-session-join-status" data-testid="live-sync-status">
        {joined ? statusMessage : 'Not in a shared session yet — click Join session.'}
      </p>
    </div>
  )
}
