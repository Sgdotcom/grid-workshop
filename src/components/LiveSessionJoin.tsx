/**
 * Shared-session control: join the festival live room (boom).
 */
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
      {!compact && <p className="live-session-join-title">Room</p>}
      <div className="live-session-join-presets" role="group" aria-label="Festival room">
        {FESTIVAL_LIVE_ROOMS.map((name) => {
          const active = joined && room === name
          return (
            <button
              key={name}
              type="button"
              data-testid={`live-room-${name}`}
              className={cn('live-session-room-pill', active && 'is-on')}
              aria-pressed={active}
              onClick={() => onJoin(name)}
            >
              {active ? `${name} · live` : name}
            </button>
          )
        })}
      </div>
      {/* Compat for smokes that still click the old Join control */}
      <button
        type="button"
        data-testid="live-session-join-btn"
        className="live-session-join-hidden"
        tabIndex={-1}
        aria-hidden
        onClick={() => onJoin(room || DEFAULT_LIVE_ROOM)}
      >
        Join session
      </button>
      <p className="live-session-join-status" data-testid="live-sync-status">
        {joined
          ? statusMessage
          : 'Tap boom to join the shared live session.'}
      </p>
    </div>
  )
}
