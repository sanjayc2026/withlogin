'use client'

import { useEffect, useState } from 'react'
import { ArrowRight, Sprout } from 'lucide-react'
import { useFarm } from '../store'

const inputCls = 'w-full rounded-xl border bg-card px-3.5 py-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function AuthScreen() {
  const { login, register } = useFarm()
  const [mode, setMode] = useState<'login' | 'signup'>('signup')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Returning visitors land on Login; first-timers on Create account.
  useEffect(() => {
    if (localStorage.getItem('khetmitra_has_account') === '1') setMode('login')
  }, [])

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'signup') await register(name, email, password)
      else await login(email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="relative h-[15rem] overflow-hidden rounded-b-[2.5rem]">
        <img src="/images/field-hero.png" alt="Farm fields" className="absolute inset-0 h-full w-full object-cover" fetchPriority="high" />
        <div className="absolute inset-0 bg-gradient-to-t from-foreground/75 to-transparent" />
        <div className="absolute bottom-6 left-6 text-primary-foreground">
          <span className="inline-flex items-center gap-2 rounded-full bg-primary-foreground/20 px-3 py-1 text-xs font-semibold backdrop-blur"><Sprout className="size-3.5" /> KhetMitra</span>
          <h1 className="mt-3 font-serif text-3xl font-semibold">Grow smarter from soil to sale.</h1>
        </div>
      </div>
      <form onSubmit={submit} className="flex flex-1 flex-col gap-4 p-6">
        <div>
          <h2 className="font-serif text-3xl font-semibold">{mode === 'signup' ? 'Create your account' : 'Welcome back'}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{mode === 'signup' ? 'Create an account to save your farm details.' : 'Log in to access your saved farm profile.'}</p>
        </div>
        <div className="grid grid-cols-2 rounded-xl bg-secondary p-1">
          <button type="button" onClick={() => { setMode('signup'); setError('') }} className={`rounded-lg py-2.5 text-sm font-semibold ${mode === 'signup' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>Create account</button>
          <button type="button" onClick={() => { setMode('login'); setError('') }} className={`rounded-lg py-2.5 text-sm font-semibold ${mode === 'login' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>Login</button>
        </div>
        {mode === 'signup' && <label className="flex flex-col gap-1.5"><span className="text-sm font-semibold">Full name</span><input required autoComplete="name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter your name" /></label>}
        <label className="flex flex-col gap-1.5"><span className="text-sm font-semibold">Email address</span><input required type="email" autoComplete="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></label>
        <label className="flex flex-col gap-1.5"><span className="text-sm font-semibold">Password</span><input required minLength={6} type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" /></label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <button disabled={loading} type="submit" className="mt-2 flex items-center justify-center gap-2 rounded-2xl bg-primary py-4 font-semibold text-primary-foreground disabled:opacity-60">{loading ? 'Please wait…' : mode === 'signup' ? 'Create account & continue' : 'Login & continue'} <ArrowRight className="size-4" /></button>
        <p className="text-center text-xs text-muted-foreground">Your farm details will be saved to your account for future recommendations.</p>
      </form>
    </div>
  )
}
