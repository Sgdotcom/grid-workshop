import { useCallback, useEffect, useRef, useState } from 'react'
import type { FestivalSession } from '@/lib/festival'
import {
  DEFAULT_LIVE_ROOM,
  applyRoomToSession,
  checkClearRoomPassword,
  clearLiveRoom,
  createLiveSyncController,
  getLiveConfig,
  isEphemeralStation,
  isLiveJoined,
  listRoomArchives,
  persistLivePrefs,
  restoreRoomArchive,
  type LiveRoomApplyMeta,
  type LiveRoomArchiveMeta,
  type LiveRoomState,
  type LiveSyncStatus,
  wallLink,
} from '@/lib/liveSession'

export function useLiveSession(options: {
  getSession: () => FestivalSession | null
  painting?: () => boolean
  onRemoteSession: (session: FestivalSession, room: LiveRoomState, meta?: LiveRoomApplyMeta) => void
  /** Wall/projection: apply full remote active/live cue (desks keep local canvas). */
  wallMode?: boolean
  /** Letter this desk is painting (presence for the wall). Omit on the wall. */
  activeChar?: string
  /** False after publishing — presence releases the letter cue for this desk. */
  holding?: boolean
}) {
  const getSessionRef = useRef(options.getSession)
  getSessionRef.current = options.getSession
  const paintingRef = useRef(options.painting)
  paintingRef.current = options.painting
  const onRemoteRef = useRef(options.onRemoteSession)
  onRemoteRef.current = options.onRemoteSession
  const wallMode = !!options.wallMode
  const tracksPresence = !wallMode && typeof options.activeChar === 'string'

  const holding = options.holding !== false
  const presenceRef = useRef({ char: '', since: new Date().toISOString() })
  const heldChar = tracksPresence && holding ? options.activeChar! : ''
  if (presenceRef.current.char !== heldChar) {
    presenceRef.current = { char: heldChar, since: new Date().toISOString() }
  }

  const initial = getLiveConfig()
  const [status, setStatus] = useState<LiveSyncStatus>(() =>
    initial.enabled
      ? { state: 'idle', message: `Connected · ${initial.room}` }
      : { state: 'off', message: 'Shared session not configured' },
  )
  const [room, setRoom] = useState(initial.room)
  const [joined, setJoined] = useState(() => isLiveJoined())
  const [draftSvgs, setDraftSvgs] = useState<Record<string, string>>({})
  const [liveRoom, setLiveRoom] = useState<LiveRoomState | null>(null)
  const controllerRef = useRef<ReturnType<typeof createLiveSyncController> | null>(null)

  useEffect(() => {
    const config = getLiveConfig()
    // Studio A/B remember the desk; workshop `w_…` stations stay in sessionStorage only.
    if (config.station && !isEphemeralStation(config.station)) {
      persistLivePrefs({ station: config.station })
    }
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
      getPresence: tracksPresence ? () => presenceRef.current : undefined,
      onRoom: (nextRoom, session, meta) => {
        setDraftSvgs(nextRoom.draftSvgs ?? {})
        setLiveRoom(nextRoom)
        onRemoteRef.current(session, nextRoom, meta)
      },
    })
    controllerRef.current = controller
    // WebSocket is primary; 10s GET is fallback only.
    controller.start(10000)
    return () => {
      controller.stop()
      if (controllerRef.current === controller) controllerRef.current = null
    }
  }, [room, joined, wallMode, tracksPresence])

  // Claim / release promptly instead of waiting for the next canvas push or heartbeat.
  useEffect(() => {
    if (!tracksPresence || !joined) return
    const id = window.setTimeout(() => void controllerRef.current?.pushPresence(), 150)
    return () => window.clearTimeout(id)
  }, [heldChar, tracksPresence, joined])

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
    const persistStation = !!station && !isEphemeralStation(station)
    persistLivePrefs({ room: clean, joined: true, ...(persistStation ? { station } : {}) })
    setRoom(clean)
    setJoined(true)
    try {
      const url = new URL(window.location.href)
      url.searchParams.set('room', clean)
      if (persistStation) url.searchParams.set('station', station)
      window.history.replaceState({}, '', url.pathname + url.search)
    } catch {
      /* ignore */
    }
    setStatus({ state: 'syncing', message: `Joining ${clean}…` })
  }, [])

  /** Wipes the room for everyone (Worker archives first). Resolves to '' or an error. */
  const clearRoom = useCallback(
    async (password: string): Promise<string> => {
      if (!(await checkClearRoomPassword(password))) return 'Wrong password'
      try {
        setStatus({ state: 'syncing', message: 'Clearing shared room…' })
        const cleared = await clearLiveRoom(password)
        setDraftSvgs({})
        // Wipe this client immediately so the next push cannot resurrect the room.
        // UI persists via onRemoteSession (sharedWipe) — controller does not write localStorage.
        if (cleared) {
          setLiveRoom(cleared)
          const wiped = applyRoomToSession(getSessionRef.current(), cleared, {
            keepLocalActive: !wallMode,
            sharedWipe: true,
          })
          onRemoteRef.current(wiped, cleared, { sharedWipe: true })
        }
        // Pull refreshes wipeEpoch so later paints are accepted by the Worker.
        await controllerRef.current?.pull()
        setStatus({ state: 'ok', message: `Cleared · ${getLiveConfig().room}` })
        return ''
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Clear failed'
        setStatus({ state: 'error', message })
        return /wrong password/i.test(message) ? 'Wrong password' : message
      }
    },
    [wallMode],
  )

  const fetchArchives = useCallback(async (): Promise<LiveRoomArchiveMeta[]> => {
    if (!getLiveConfig().enabled) return []
    try {
      return await listRoomArchives()
    } catch {
      return []
    }
  }, [])

  /** Restore a cloud archive into the live room. Resolves to '' or an error. */
  const restoreArchive = useCallback(async (archiveId: string, password: string): Promise<string> => {
    if (!(await checkClearRoomPassword(password))) return 'Wrong password'
    try {
      setStatus({ state: 'syncing', message: 'Restoring previous session…' })
      const room = await restoreRoomArchive(archiveId, password)
      if (room) {
        setLiveRoom(room)
        setDraftSvgs(room.draftSvgs ?? {})
        const session = applyRoomToSession(getSessionRef.current(), room, {
          keepLocalActive: false,
        })
        onRemoteRef.current(session, room, { restore: true })
      }
      await controllerRef.current?.pull()
      setStatus({ state: 'ok', message: `Restored · ${getLiveConfig().room}` })
      return ''
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Restore failed'
      setStatus({ state: 'error', message })
      return /wrong password/i.test(message) ? 'Wrong password' : message
    }
  }, [])

  const copyWallLink = useCallback(async (view: 'projection' | 'studio' = 'projection') => {
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
    liveRoom,
    pushSession,
    joinSession,
    clearRoom,
    fetchArchives,
    restoreArchive,
    copyWallLink,
  }
}
