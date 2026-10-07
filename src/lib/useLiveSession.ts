import { useCallback, useEffect, useRef, useState } from 'react'
import type { FestivalSession } from '@/lib/festival'
import {
  clearLiveRoom,
  createLiveSyncController,
  getLiveConfig,
  persistLivePrefs,
  type LiveRoomState,
  type LiveSyncStatus,
  wallLink,
} from '@/lib/liveSession'

export function useLiveSession(options: {
  getSession: () => FestivalSession | null
  painting?: () => boolean
  onRemoteSession: (session: FestivalSession, room: LiveRoomState) => void
}) {
  const getSessionRef = useRef(options.getSession)
  getSessionRef.current = options.getSession
  const paintingRef = useRef(options.painting)
  paintingRef.current = options.painting
  const onRemoteRef = useRef(options.onRemoteSession)
  onRemoteRef.current = options.onRemoteSession

  const initial = getLiveConfig()
  const [status, setStatus] = useState<LiveSyncStatus>(() =>
    initial.enabled
      ? { state: 'idle', message: `Live · room ${initial.room}` }
      : { state: 'off', message: 'Live sync off (set VITE_LIVE_SESSION_URL to enable)' },
  )
  const [room, setRoom] = useState(initial.room)
  const [token, setToken] = useState(initial.token)
  const [station, setStation] = useState(initial.station)
  const [draftSvgs, setDraftSvgs] = useState<Record<string, string>>({})
  const controllerRef = useRef<ReturnType<typeof createLiveSyncController> | null>(null)

  useEffect(() => {
    const controller = createLiveSyncController({
      onStatus: setStatus,
      getSession: () => getSessionRef.current(),
      painting: () => paintingRef.current?.() ?? false,
      keepLocalActive: true,
      selfStation: () => getLiveConfig().station,
      onRoom: (liveRoom, session) => {
        setDraftSvgs(liveRoom.draftSvgs ?? {})
        onRemoteRef.current(session, liveRoom)
      },
    })
    controllerRef.current = controller
    controller.start(1800)
    return () => {
      controller.stop()
      controllerRef.current = null
    }
  }, [])

  const pushSession = useCallback((session: FestivalSession) => {
    controllerRef.current?.push(session)
  }, [])

  const savePrefs = useCallback(
    (next: { room?: string; token?: string; station?: string }) => {
      if (next.room !== undefined) setRoom(next.room)
      if (next.token !== undefined) setToken(next.token)
      if (next.station !== undefined) setStation(next.station)
      persistLivePrefs(next)
      void controllerRef.current?.pull()
    },
    [],
  )

  const clearRoom = useCallback(async () => {
    try {
      setStatus({ state: 'syncing', message: 'Clearing shared room…' })
      await clearLiveRoom()
      setDraftSvgs({})
      setStatus({ state: 'ok', message: 'Shared room cleared' })
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
    enabled: initial.enabled || getLiveConfig().enabled,
    status,
    room,
    token,
    station,
    draftSvgs,
    pushSession,
    savePrefs,
    clearRoom,
    copyWallLink,
    refresh: () => void controllerRef.current?.pull(),
  }
}
