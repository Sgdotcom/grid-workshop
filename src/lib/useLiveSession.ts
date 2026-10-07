import { useCallback, useEffect, useRef, useState } from 'react'
import type { FestivalSession } from '@/lib/festival'
import {
  DEFAULT_LIVE_ROOM,
  clearLiveRoom,
  createLiveSyncController,
  getLiveConfig,
  isLiveJoined,
  persistLivePrefs,
  type LiveRoomState,
  type LiveSyncStatus,
  wallLink,
} from '@/lib/liveSession'

export function useLiveSession(options: {
  getSession: () => FestivalSession | null
  painting?: () => boolean
  onRemoteSession: (session: FestivalSession, room: LiveRoomState) => void
  /** Wall/projection: poll only (still respects join + room). */
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
  const [station, setStation] = useState(initial.station)
  const [joined, setJoined] = useState(() => isLiveJoined())
  const [draftSvgs, setDraftSvgs] = useState<Record<string, string>>({})
  const controllerRef = useRef<ReturnType<typeof createLiveSyncController> | null>(null)

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
      selfStation: () => getLiveConfig().station,
      onRoom: (liveRoom, session) => {
        setDraftSvgs(liveRoom.draftSvgs ?? {})
        onRemoteRef.current(session, liveRoom)
      },
    })
    controllerRef.current = controller
    controller.start(wallMode ? 1500 : 1800)
    return () => {
      controller.stop()
      if (controllerRef.current === controller) controllerRef.current = null
    }
  }, [room, joined, wallMode])

  const pushSession = useCallback(
    (session: FestivalSession) => {
      if (!joined) return
      controllerRef.current?.push(session)
    },
    [joined],
  )

  const joinSession = useCallback((nextRoom: string) => {
    const clean = nextRoom.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || DEFAULT_LIVE_ROOM
    persistLivePrefs({ room: clean, joined: true })
    setRoom(clean)
    setJoined(true)
    // Keep URL shareable without a reload dance when possible.
    try {
      const url = new URL(window.location.href)
      url.searchParams.set('room', clean)
      window.history.replaceState({}, '', url.pathname + url.search)
    } catch {
      /* ignore */
    }
    setStatus({ state: 'syncing', message: `Joining ${clean}…` })
  }, [])

  const savePrefs = useCallback((next: { room?: string; station?: string; joined?: boolean }) => {
    if (next.room !== undefined) {
      const clean = next.room.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || DEFAULT_LIVE_ROOM
      setRoom(clean)
      persistLivePrefs({ room: clean })
    }
    if (next.station !== undefined) {
      setStation(next.station)
      persistLivePrefs({ station: next.station })
    }
    if (next.joined !== undefined) {
      setJoined(next.joined)
      persistLivePrefs({ joined: next.joined })
    }
  }, [])

  const clearRoom = useCallback(async () => {
    try {
      setStatus({ state: 'syncing', message: 'Clearing shared room…' })
      await clearLiveRoom()
      setDraftSvgs({})
      setStatus({ state: 'ok', message: `Cleared · ${getLiveConfig().room}` })
      void controllerRef.current?.pull()
    } catch (error) {
      setStatus({
        state: 'error',
        message: error instanceof Error ? error.message : 'Clear failed',
      })
    }
  }, [])

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
    station,
    joined,
    draftSvgs,
    pushSession,
    joinSession,
    savePrefs,
    clearRoom,
    copyWallLink,
    refresh: () => void controllerRef.current?.pull(),
  }
}
