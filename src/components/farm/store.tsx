'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { supabase } from '@/integrations/supabase/client'
import type { Json } from '@/integrations/supabase/types'
import {
  addDays,
  CROPS,
  DEFAULT_PROFILE,
  FERTILIZER_TEMPLATE,
  type CropInfo,
  type FarmProfile,
  type FertilizerTask,
  type LedgerEntry,
} from '@/lib/farm-data'

export type Screen =
  | 'home'
  | 'crops'
  | 'scan'
  | 'care'
  | 'ledger'
  | 'subsidies'
  | 'relief'
  | 'devices'
  | 'location'
  | 'profile'

export type Diagnosis = {
  id: string
  date: string
  image: string
  verdict: 'Biological disease' | 'Pest attack' | 'Chemical burn / toxicity'
  name: string
  confidence: number
}

const DAYS_SINCE_SOWING = 38

function buildTasks(sowing: Date): FertilizerTask[] {
  return FERTILIZER_TEMPLATE.map((t, i): FertilizerTask => ({
    ...t,
    id: `f${i}`,
    ...(t.day < DAYS_SINCE_SOWING
      ? {
          done: {
            date: addDays(sowing, t.day).toISOString(),
            actualDose: t.day === 35 ? t.dosePerAcre * 1.4 : t.dosePerAcre,
          },
        }
      : {}),
  }))
}

function buildLedger(sowing: Date, acres: number): LedgerEntry[] {
  const d = (n: number) => addDays(sowing, n).toISOString()
  return [
    { id: 'l1', kind: 'expense', category: 'Machinery', label: 'Tractor ploughing & rotavator', amount: 2400 * acres, date: d(-4) },
    { id: 'l2', kind: 'expense', category: 'Seeds', label: 'Hybrid tomato seedlings', amount: 8500 * acres, date: d(-1) },
    { id: 'l3', kind: 'expense', category: 'Fertilizer', label: 'Farmyard manure', amount: 3200 * acres, date: d(0) },
    { id: 'l4', kind: 'expense', category: 'Fertilizer', label: 'DAP 50 kg bags', amount: 1350 * acres, date: d(1) },
    { id: 'l5', kind: 'expense', category: 'Labour', label: 'Transplanting labour (6 workers)', amount: 2100 * acres, date: d(1) },
    { id: 'l6', kind: 'expense', category: 'Irrigation', label: 'Drip line maintenance', amount: 1800, date: d(10) },
    { id: 'l7', kind: 'expense', category: 'Fertilizer', label: 'Urea top dressing', amount: 300 * acres, date: d(21) },
    { id: 'l8', kind: 'expense', category: 'Labour', label: 'Weeding', amount: 1500 * acres, date: d(28) },
    { id: 'l9', kind: 'expense', category: 'Fertilizer', label: 'Urea top dressing', amount: 360 * acres, date: d(35) },
  ]
}

type FarmState = {
  onboarded: boolean
  setOnboarded: (v: boolean) => void
  userId: string | null
  userEmail: string | null
  authReady: boolean
  dataLoading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  completeOnboarding: (p: FarmProfile) => void
  profile: FarmProfile
  setProfile: (p: FarmProfile) => void
  activeCrop: CropInfo
  setActiveCropId: (id: string) => void
  sowingDate: Date
  daysSinceSowing: number
  tasks: FertilizerTask[]
  completeTask: (id: string, actualDose: number) => void
  ledger: LedgerEntry[]
  addEntry: (e: Omit<LedgerEntry, 'id'>) => void
  removeEntry: (id: string) => void
  diagnoses: Diagnosis[]
  addDiagnosis: (d: Diagnosis) => void
  screen: Screen
  go: (s: Screen) => void
}

const FarmContext = createContext<FarmState | null>(null)

const newId = () => crypto.randomUUID()

function reportError(action: string, error: unknown) {
  if (error) console.error(`[farm] ${action} failed`, error)
}

export function FarmProvider({ children }: { children: ReactNode }) {
  const sowingDate = useMemo(() => addDays(new Date(), -DAYS_SINCE_SOWING), [])
  const [onboarded, setOnboardedState] = useState(false)
  const [profile, setProfileState] = useState<FarmProfile>(DEFAULT_PROFILE)
  const [userId, setUserId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [dataLoading, setDataLoading] = useState(false)
  const [activeCropId, setActiveCropIdState] = useState('tomato')
  const [tasks, setTasks] = useState<FertilizerTask[]>(() => buildTasks(sowingDate))
  const [ledger, setLedger] = useState<LedgerEntry[]>([])
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([])
  const [screen, setScreen] = useState<Screen>('home')
  const loadedFor = useRef<string | null>(null)

  const resetState = useCallback(() => {
    setOnboardedState(false)
    setProfileState(DEFAULT_PROFILE)
    setActiveCropIdState('tomato')
    setTasks(buildTasks(sowingDate))
    setLedger([])
    setDiagnoses([])
    setScreen('home')
  }, [sowingDate])

  // Load everything saved for the signed-in account.
  const loadAccount = useCallback(
    async (uid: string) => {
      setDataLoading(true)
      try {
        const [{ data: row, error: pErr }, { data: entries, error: lErr }, { data: diags, error: dErr }] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', uid).maybeSingle(),
          supabase.from('ledger_entries').select('*').eq('user_id', uid).order('date', { ascending: true }),
          supabase.from('diagnoses').select('*').eq('user_id', uid).order('date', { ascending: false }),
        ])
        reportError('load profile', pErr)
        reportError('load ledger', lErr)
        reportError('load diagnoses', dErr)
        if (loadedFor.current !== uid) return
        const saved = (row?.farm_profile ?? null) as FarmProfile | null
        setProfileState(saved ? { ...DEFAULT_PROFILE, ...saved } : { ...DEFAULT_PROFILE, farmerName: row?.full_name || DEFAULT_PROFILE.farmerName })
        setOnboardedState(Boolean(row?.onboarded))
        setActiveCropIdState(row?.active_crop_id || 'tomato')
        setTasks(Array.isArray(row?.tasks) ? (row!.tasks as unknown as FertilizerTask[]) : buildTasks(sowingDate))
        setLedger(
          (entries ?? []).map((e) => ({
            id: e.id,
            kind: e.kind as LedgerEntry['kind'],
            category: e.category as LedgerEntry['category'],
            label: e.label,
            amount: Number(e.amount),
            date: e.date,
          })),
        )
        setDiagnoses(
          (diags ?? []).map((d) => ({
            id: d.id,
            date: d.date,
            image: d.image,
            verdict: d.verdict as Diagnosis['verdict'],
            name: d.name,
            confidence: Number(d.confidence),
          })),
        )
      } finally {
        setDataLoading(false)
      }
    },
    [sowingDate],
  )

  useEffect(() => {
    const apply = (session: { user: { id: string; email?: string | null } } | null) => {
      const uid = session?.user.id ?? null
      setUserEmail(session?.user.email ?? null)
      if (uid === loadedFor.current) return
      loadedFor.current = uid
      setUserId(uid)
      resetState()
      if (uid) {
        try { localStorage.setItem('khetmitra_has_account', '1') } catch { /* storage unavailable */ }
        // Defer: querying inside the auth callback can deadlock the auth client.
        setDataLoading(true)
        setTimeout(() => void loadAccount(uid), 0)
      }
    }
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED' || event === 'INITIAL_SESSION') {
        apply(session)
        setAuthReady(true)
      }
    })
    void supabase.auth.getSession().then(({ data }) => {
      apply(data.session)
      setAuthReady(true)
    })
    return () => sub.subscription.unsubscribe()
  }, [loadAccount, resetState])

  const saveProfileFields = useCallback(
    async (fields: { farm_profile?: Json; onboarded?: boolean; active_crop_id?: string; tasks?: Json; full_name?: string }) => {
      const uid = loadedFor.current
      if (!uid) return
      const { error } = await supabase.from('profiles').update(fields).eq('id', uid)
      reportError('save profile', error)
    },
    [],
  )

  const register = async (name: string, email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { emailRedirectTo: window.location.origin, data: { full_name: name.trim() } },
    })
    if (error) {
      if (/already registered|already exists/i.test(error.message)) throw new Error('An account with this email already exists. Please log in.')
      throw new Error(error.message)
    }
    if (!data.session) throw new Error('Account created. Please log in to continue.')
    setProfileState({ ...DEFAULT_PROFILE, farmerName: name.trim() })
  }

  const login = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
    if (error) throw new Error(/invalid/i.test(error.message) ? 'Incorrect email or password.' : error.message)
  }

  const logout = async () => {
    await supabase.auth.signOut()
  }

  const completeOnboarding = (nextProfile: FarmProfile) => {
    const firstTime = !onboarded
    setProfileState(nextProfile)
    setOnboardedState(true)
    const freshTasks = buildTasks(sowingDate)
    void saveProfileFields({
      farm_profile: nextProfile as unknown as Json,
      onboarded: true,
      full_name: nextProfile.farmerName,
      ...(firstTime ? { tasks: freshTasks as unknown as Json } : {}),
    })
    if (firstTime && ledger.length === 0 && loadedFor.current) {
      // Starter season costs, scaled to this farm's size.
      const seeded = buildLedger(sowingDate, nextProfile.acres).map((e) => ({ ...e, id: newId() }))
      setTasks(freshTasks)
      setLedger(seeded)
      const uid = loadedFor.current
      void supabase
        .from('ledger_entries')
        .insert(seeded.map((e) => ({ ...e, user_id: uid })))
        .then(({ error }) => reportError('seed ledger', error))
    }
  }

  const activeCrop = CROPS.find((c) => c.id === activeCropId) ?? CROPS[0]!

  const insertEntry = (entry: LedgerEntry) => {
    const uid = loadedFor.current
    if (!uid) return
    void supabase
      .from('ledger_entries')
      .insert({ ...entry, user_id: uid })
      .then(({ error }) => reportError('add ledger entry', error))
  }

  const value: FarmState = {
    onboarded,
    setOnboarded: (v) => {
      setOnboardedState(v)
      void saveProfileFields({ onboarded: v })
    },
    userId,
    userEmail,
    authReady,
    dataLoading,
    login,
    register,
    logout,
    completeOnboarding,
    profile,
    setProfile: (p) => {
      setProfileState(p)
      void saveProfileFields({ farm_profile: p as unknown as Json })
    },
    activeCrop,
    setActiveCropId: (id) => {
      setActiveCropIdState(id)
      void saveProfileFields({ active_crop_id: id })
    },
    sowingDate,
    daysSinceSowing: DAYS_SINCE_SOWING,
    tasks,
    completeTask: (id, actualDose) => {
      const task = tasks.find((t) => t.id === id)
      const nextTasks = tasks.map((t) => (t.id === id ? { ...t, done: { date: new Date().toISOString(), actualDose } } : t))
      setTasks(nextTasks)
      void saveProfileFields({ tasks: nextTasks as unknown as Json })
      if (task) {
        const entry: LedgerEntry = {
          id: newId(),
          kind: 'expense',
          category: task.type === 'Fungicide' ? 'Pesticide' : 'Fertilizer',
          label: task.product,
          amount: Math.round(actualDose * profile.acres * (task.unit === 'L' ? 450 : 28)),
          date: new Date().toISOString(),
        }
        setLedger((prev) => [...prev, entry])
        insertEntry(entry)
      }
    },
    ledger,
    addEntry: (e) => {
      const entry = { ...e, id: newId() }
      setLedger((prev) => [...prev, entry])
      insertEntry(entry)
    },
    removeEntry: (id) => {
      setLedger((prev) => prev.filter((e) => e.id !== id))
      void supabase
        .from('ledger_entries')
        .delete()
        .eq('id', id)
        .then(({ error }) => reportError('delete ledger entry', error))
    },
    diagnoses,
    addDiagnosis: (d) => {
      const diag = { ...d, id: newId() }
      setDiagnoses((prev) => [diag, ...prev])
      const uid = loadedFor.current
      if (!uid) return
      void supabase
        .from('diagnoses')
        .insert({ ...diag, user_id: uid })
        .then(({ error }) => reportError('save diagnosis', error))
    },
    screen,
    go: setScreen,
  }

  return <FarmContext.Provider value={value}>{children}</FarmContext.Provider>
}

export function useFarm() {
  const ctx = useContext(FarmContext)
  if (!ctx) throw new Error('useFarm must be used inside FarmProvider')
  return ctx
}
