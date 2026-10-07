/**
 * Shared-session control: boom and bobby are separate live rooms.
 * No write token — desks and wall just use the same room name.
 */
import { useEffect, useState } from 'react'
import { DEFAULT_LIVE_ROOM, FESTIVAL_LIVE_ROOMS, getLiveConfig } from '@/lib/liveSession'
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

  useEffect(() => {
    setDraft(room || DEFAULT_LIVE_ROOM)
  }, [room])

  if (!enabled && !getLiveConfig().enabled) {
    return (
      <div className={cn('live-session-join is-off', className)} data-testid="live-session-join">
        <p>Shared session is not configured on this site.</p>
      </div>
    )
  }

  const join = (name: string) => onJoin(name.trim() || DEFAULT_LIVE_ROOM)

  return (
    <div
      className={cn('live-session-join', compact && 'is-compact', joined && 'is-joined', className)}
      data-testid="live-session-join"
    >
      {!compact && <p className="live-session-join-title">Shared session</p>}
      <div className="live-session-join-presets" role="group" aria-label="Festival rooms">
        {FESTIVAL_LIVE_ROOMS.map((name) => (
          <button
            key={name}
            type="button"
            data-testid={`live-room-${name}`}
            className={cn('live-session-room-pill', joined && room === name && 'is-on')}
            onClick={() => {
              setDraft(name)
              join(name)
            }}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="live-session-join-row">
        <label>
          <span>Room</span>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') join(draft)
            }}
            spellCheck={false}
            placeholder={DEFAULT_LIVE_ROOM}
            aria-label="Session room name"
          />
        </label>
        <button
          type="button"
          data-testid="live-session-join-btn"
          onClick={() => join(draft)}
        >
          {joined && draft.trim() === room ? 'Joined' : 'Join session'}
        </button>
      </div>
      <p className="live-session-join-status" data-testid="live-sync-status">
        {joined
          ? statusMessage
          : 'Pick boom or bobby — each room is a separate live session.'}
      </p>
    </div>
  )
}
