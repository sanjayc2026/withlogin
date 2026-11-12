import { useEffect, useRef, useState } from 'react'
import { LogOut, MapPin, ScanLine, UserRound, Users, Wallet, X } from 'lucide-react'
import { useFarm } from './store'

function initials(name: string, email: string | null) {
  const source = name.trim() || email || '?'
  const parts = source.split(/[\s@.]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

export function AccountButton() {
  const { profile, userEmail, userId, ledger, diagnoses, logout } = useFarm()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const signOut = async () => {
    setBusy(true)
    try {
      await logout()
    } finally {
      setBusy(false)
      setOpen(false)
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="View account"
        className="flex size-11 items-center justify-center rounded-full border bg-secondary text-sm font-bold text-primary"
      >
        {initials(profile.farmerName, userEmail)}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Your account"
          className="absolute right-0 top-13 z-40 w-72 rounded-2xl border bg-card p-4 shadow-xl animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              {initials(profile.farmerName, userEmail)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{profile.farmerName}</p>
              <p className="truncate text-sm text-muted-foreground">{userEmail}</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-muted-foreground">
              <X className="size-4" />
            </button>
          </div>

          <ul className="mt-4 flex flex-col gap-2 text-sm">
            <li className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="size-4 text-primary" />
              {profile.village}, {profile.district} · {profile.acres} acres
            </li>
            <li className="flex items-center gap-2 text-muted-foreground">
              <Wallet className="size-4 text-primary" />
              {ledger.length} ledger entries saved
            </li>
            <li className="flex items-center gap-2 text-muted-foreground">
              <ScanLine className="size-4 text-primary" />
              {diagnoses.length} leaf scans saved
            </li>
            <li className="flex items-center gap-2 text-muted-foreground">
              <UserRound className="size-4 text-primary" />
              <span className="truncate">ID {userId?.slice(0, 8).toUpperCase()}</span>
            </li>
          </ul>

          <p className="mt-3 rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
            Your farm details are saved to this email. Log in with another email to see that account's data.
          </p>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={signOut}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-secondary py-2.5 text-sm font-semibold text-secondary-foreground disabled:opacity-60"
            >
              <Users className="size-4" /> Switch
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={signOut}
              className="flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-sm font-semibold text-destructive disabled:opacity-60"
            >
              <LogOut className="size-4" /> Log out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
