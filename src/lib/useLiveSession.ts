import { useCallback, useEffect, useRef, useState } from 'react'
import type { FestivalSession } from '@/lib/festival'
import {
  DEFAULT_LIVE_ROOM,
  applyRoomToSession,
  clearLiveRoom,
  createLiveSyncController,
  getLiveConfig,
  isLiveJoined,
  persistLivePrefs,
  persistSession,
  type LiveRoomState,
  type LiveSyncStatus,
  wallLink,
} from '@/lib/liveSession'

export function useLiveSession(options: {
  getSession: () => FestivalSession | null
  painting?: () => boolean
  onRemoteSession: (session: FestivalSession, room: LiveRoomState) => void
  /** Wall/projection: apply full remote active/live cue (desks keep local canvas). */
  wallMode?: boolean
}) {
  const getSessionRef = useRef(options.getSession)
  getSessionRef.current = options.getSession
  const paintingRef = useRef(options.painting)
  paintingRef.current = options.painting
  const onRemoteRef = useRef(options.onRemoteSession)
  onRemoteRef.current = options.onRemoteSession
  const wallMode = !!options.wallMode

  const initial = getLiveConfig()
  const [status, setStatus] = useState<LiveSyncStatus>(() =>
    initial.enabled
      ? { state: 'idle', message: `Connected · ${initial.room}` }
      : { state: 'off', message: 'Shared session not configured' },
  )
  const [room, setRoom] = useState(initial.room)
  const [joined, setJoined] = useState(() => isLiveJoined())
  const [draftSvgs, setDraftSvgs] = useState<Record<string, string>>({})
  const controllerRef = useRef<ReturnType<typeof createLiveSyncController> | null>(null)

  useEffect(() => {
    const config = getLiveConfig()
    if (config.station) persistLivePrefs({ station: config.station })
  }, [])

  useEffect(() => {
    const config = getLiveConfig()
    if (!config.enabled || !joined) {
      controllerRef.current?.stop()
      controllerRef.current = null
      setStatus(
        config.enabled
          ? { state: 'idle', message: 'Not joined — click Join session' }
          : { state: 'off', message: 'Shared session not configured' },
      )
      return
    }

    const controller = createLiveSyncController({
      onStatus: setStatus,
      getSession: () => getSessionRef.current(),
      painting: () => paintingRef.current?.() ?? false,
      keepLocalActive: !wallMode,
      onRoom: (liveRoom, session) => {
        setDraftSvgs(liveRoom.draftSvgs ?? {})
        onRemoteRef.current(session, liveRoom)
      },
    })
    controllerRef.current = controller
    // WebSocket is primary; 10s GET is fallback only.
    controller.start(10000)
    return () => {
      controller.stop()
      if (controllerRef.current === controller) controllerRef.current = null
    }
  }, [room, joined, wallMode])

  const pushSession = useCallback(
    (session: FestivalSession, opts?: { immediate?: boolean }) => {
      if (!joined) return
      controllerRef.current?.push(session, opts)
    },
    [joined],
  )

  const joinSession = useCallback((nextRoom: string) => {
    const clean = nextRoom.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || DEFAULT_LIVE_ROOM
    const station = getLiveConfig().station
    persistLivePrefs({ room: clean, joined: true, ...(station ? { station } : {}) })
    setRoom(clean)
    setJoined(true)
    try {
      const url = new URL(window.location.href)
      url.searchParams.set('room', clean)
      if (station) url.searchParams.set('station', station)
      window.history.replaceState({}, '', url.pathname + url.search)
    } catch {
      /* ignore */
    }
    setStatus({ state: 'syncing', message: `Joining ${clean}…` })
  }, [])

  const clearRoom = useCallback(async () => {
    try {
      setStatus({ state: 'syncing', message: 'Clearing shared room…' })
      const cleared = await clearLiveRoom()
      setDraftSvgs({})
      // Wipe this client immediately so the next push cannot resurrect the room.
      if (cleared) {
        const wiped = applyRoomToSession(getSessionRef.current(), cleared, {
          keepLocalActive: !wallMode,
          sharedWipe: true,
        })
        persistSession(wiped)
        onRemoteRef.current(wiped, cleared)
      }
      // Pull refreshes wipeEpoch so later paints are accepted by the Worker.
      await controllerRef.current?.pull()
      setStatus({ state: 'ok', message: `Cleared · ${getLiveConfig().room}` })
    } catch (error) {
      setStatus({
        state: 'error',
        message: error instanceof Error ? error.message : 'Clear failed',
      })
    }
  }, [wallMode])

  const copyWallLink = useCallback(async (view: 'wall' | 'projection' | 'studio' = 'wall') => {
    const link = wallLink(view)
    try {
      await navigator.clipboard.writeText(new URL(link, window.location.origin).toString())
      setStatus((s) => ({ ...s, message: `Copied ${view} link` }))
    } catch {
      setStatus((s) => ({ ...s, message: link }))
    }
  }, [])

  return {
    enabled: getLiveConfig().enabled,
    status,
    room,
    joined,
    draftSvgs,
    pushSession,
    joinSession,
    clearRoom,
    copyWallLink,
  }
}
