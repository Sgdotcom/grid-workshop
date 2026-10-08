/**
 * Clear shared room — password-gated wipe for every joined desk and wall.
 */
import { useState } from 'react'
import { cn } from '@/lib/utils'

export function ClearRoomControl({
  enabled,
  onClear,
  className,
  buttonClassName,
}: {
  enabled: boolean
  /** Resolves to an error message, or '' on success. */
  onClear: (password: string) => Promise<string>
  className?: string
  buttonClassName?: string
}) {
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!password) {
      setMessage('Enter the password first.')
      return
    }
    if (
      !window.confirm(
        'Clear the shared room for everyone? Wipes the typeface, drafts, and canvases on all joined desks and walls. A cloud copy is saved first so you can restore it from Options → Previous sessions.',
      )
    )
      return
    setBusy(true)
    const error = await onClear(password)
    setBusy(false)
    setMessage(error || 'Shared room cleared.')
    if (!error) setPassword('')
  }

  return (
    <form
      className={cn('clear-room-control', className)}
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <input
        type="password"
        data-testid="clear-room-password"
        aria-label="Clear shared room password"
        placeholder="Password to clear room"
        autoComplete="off"
        disabled={!enabled || busy}
        value={password}
        onChange={(e) => {
          setPassword(e.target.value)
          setMessage('')
        }}
      />
      <button
        type="submit"
        data-testid="clear-shared-room"
        className={buttonClassName}
        disabled={!enabled || busy}
      >
        {busy ? 'Clearing…' : 'Clear shared room'}
      </button>
      {message ? (
        <p className="clear-room-message" role="status" data-testid="clear-room-message">
          {message}
        </p>
      ) : null}
    </form>
  )
}
