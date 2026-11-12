import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'

/* ---------- Voice assistant ---------- */

export const askAssistant = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        question: z.string().trim().min(1).max(500),
        lang: z.enum(['en', 'ta']).default('en'),
        context: z.string().max(1500).default(''),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const apiKey = (process.env['GEMINI_AI_API'] || process.env['GEMINI_API_KEY'])?.trim()
    if (!apiKey) {
      console.error('[assistant] Missing GEMINI_API_KEY')
      return { answer: '', error: 'Assistant unavailable' }
    }

    const language = data.lang === 'ta' ? 'Tamil (in Tamil script)' : 'simple Indian English'
    const systemPrompt = `You are KhetMitra, a friendly voice assistant for Indian farmers inside a farm management app.
Always reply in ${language}. Your reply will be read aloud by text-to-speech, so:
- Keep it to 2-4 short sentences, practical and specific.
- No markdown, bullet points, emojis or symbols. Write numbers and units in words-friendly form (e.g. "2 grams per litre").
- For pesticides, give the common chemical name and dose, and remind about safety gear and the label.
- If the question is unrelated to farming or the app, answer briefly and politely steer back to farming.
The app has screens: Home, Crop advice, Leaf scan, Fertilizer schedule, Ledger, Subsidies, Disaster aid, Devices, Field GPS location. Suggest a relevant screen when helpful.
Farmer context: ${data.context}`

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: 'user', parts: [{ text: data.question }] }],
          }),
        },
      )
      if (!res.ok) {
        console.error('[assistant] Gemini API error', res.status, await res.text())
        return { answer: '', error: 'Assistant unavailable' }
      }
      const json = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
      }
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text
      return { answer: typeof text === 'string' ? text.trim() : '' }
    } catch (error) {
      console.error('[assistant] generation failed', error)
      return { answer: '', error: 'Assistant unavailable' }
    }
  })

/* ---------- Soil health card reader ---------- */

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const
const MAX_FILE_BYTES = 15 * 1024 * 1024

type SoilValues = {
  ph: number | null
  organicCarbon: number | null
  nitrogen: number | null
  phosphorus: number | null
  potassium: number | null
}

export type SoilReportResult =
  | { ok: true; documentType: string; status: 'valid' | 'incomplete' | 'invalid'; values: SoilValues; confidence: number; message: string }
  | { ok: false; error: string }

const SOIL_PROMPT = `You are an expert document reader for Indian Soil Health Cards. Read the attached document and return ONLY valid JSON with this exact shape:
{
  "documentType": "soil_health_card" | "other" | "unreadable",
  "status": "valid" | "incomplete" | "invalid",
  "values": { "ph": number|null, "organicCarbon": number|null, "nitrogen": number|null, "phosphorus": number|null, "potassium": number|null },
  "units": { "nitrogen": string|null, "phosphorus": string|null, "potassium": string|null },
  "confidence": number,
  "message": string
}
Rules:
- Extract only values explicitly printed in the document. Do not infer, estimate, or invent missing values.
- pH is dimensionless; organicCarbon is percentage; N/P/K should be numeric values in kg/ha. If the card uses a different unit, convert only when the conversion is unambiguous; otherwise return null for that value and explain in message.
- Map available phosphorus and available potassium values to phosphorus and potassium. Do not confuse fertilizer recommendations with measured soil values.
- A recognizable Soil Health Card with all five values and plausible ranges (pH 0–14, organic carbon 0–100%, N/P/K non-negative) is valid.
- A recognizable Soil Health Card missing one or more required values is incomplete.
- A clearly unrelated document, fabricated-looking/non-soil document, or a report with impossible values is invalid.
- If the file cannot be read, documentType is unreadable and status is invalid.
- Keep confidence between 0 and 1. message should be a short, user-friendly explanation.
- Do not return markdown or any text outside the JSON.`

export const analyseSoilReport = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        filename: z.string().max(300),
        mimeType: z.enum(ALLOWED_TYPES),
        base64: z.string().min(1).max(Math.ceil((MAX_FILE_BYTES * 4) / 3) + 16),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<SoilReportResult> => {
    const apiKey = (process.env['GEMINI_AI_API'] || process.env['GEMINI_API_KEY'])?.trim()
    if (!apiKey) {
      return { ok: false, error: 'GEMINI_API_KEY is not configured on the server.' }
    }

    let text = ''
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [
                  { text: SOIL_PROMPT },
                  { inlineData: { mimeType: data.mimeType, data: data.base64 } },
                ],
              },
            ],
            generationConfig: {
              temperature: 0,
              responseMimeType: 'application/json',
            },
          }),
        },
      )

      if (!res.ok) {
        console.error('[soil-report] Gemini API error', res.status, await res.text())
        if (res.status === 429) {
          return {
            ok: false,
            error: 'The report reader is busy. Please wait 30 seconds and try again. Your uploaded report was not lost.',
          }
        }
        return { ok: false, error: 'Could not read this report. Try a clearer photo or PDF.' }
      }

      const json = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
      }
      text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    } catch (error) {
      console.error('[soil-report] analysis failed', error)
      return { ok: false, error: 'Could not read this report. Try a clearer photo or PDF.' }
    }

    if (!text) return { ok: false, error: 'No readable result was returned. Try a clearer photo or PDF.' }

    let parsed: {
      documentType?: string
      status?: string
      values?: Partial<SoilValues>
      confidence?: number
      message?: string
    }
    try {
      parsed = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''))
    } catch {
      return { ok: false, error: 'Could not read this report. Try a clearer photo or PDF.' }
    }

    const keys: (keyof SoilValues)[] = ['ph', 'organicCarbon', 'nitrogen', 'phosphorus', 'potassium']
    const values = Object.fromEntries(
      keys.map((key) => {
        const value = parsed.values?.[key]
        return [key, typeof value === 'number' && Number.isFinite(value) ? value : null]
      }),
    ) as SoilValues
    const anyValue = keys.some((key) => values[key] !== null)
    const plausible =
      (values.ph === null || (values.ph >= 0 && values.ph <= 14)) &&
      (values.organicCarbon === null || (values.organicCarbon >= 0 && values.organicCarbon <= 100))
    const nonNegative = (['nitrogen', 'phosphorus', 'potassium'] as const).every((k) => values[k] === null || (values[k] as number) >= 0)
    const documentType =
      parsed.documentType === 'soil_health_card' ? 'soil_health_card' : parsed.documentType === 'unreadable' ? 'unreadable' : 'other'
    const complete = keys.every((key) => values[key] !== null)
    const status: 'valid' | 'incomplete' | 'invalid' =
      documentType !== 'soil_health_card' || !plausible || !nonNegative || parsed.status === 'invalid'
        ? 'invalid'
        : complete
          ? 'valid'
          : anyValue
            ? 'incomplete'
            : 'invalid'

    return {
      ok: true,
      documentType,
      status,
      values,
      confidence: typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0,
      message:
        typeof parsed.message === 'string'
          ? parsed.message.slice(0, 300)
          : status === 'valid'
            ? 'Soil report verified. Values have been filled in.'
            : status === 'incomplete'
              ? 'Some values were found. Please enter the missing values manually.'
              : 'This does not appear to be a readable Soil Health Card.',
    }
  })

/* ---------- GPS ---------- */

const coords = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
})

export const recordGps = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    coords.extend({ accuracy: z.number().finite().nonnegative().optional(), timestamp: z.number().optional() }).parse(input),
  )
  .handler(async ({ data }) => ({
    success: true,
    data: { ...data, accuracy: data.accuracy ?? null, timestamp: data.timestamp ?? Date.now() },
  }))

export const reverseGeocode = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => coords.parse(input))
  .handler(async ({ data }) => {
    try {
      const url = new URL('https://nominatim.openstreetmap.org/reverse')
      url.searchParams.set('format', 'jsonv2')
      url.searchParams.set('lat', String(data.latitude))
      url.searchParams.set('lon', String(data.longitude))
      url.searchParams.set('zoom', '10')
      url.searchParams.set('addressdetails', '1')
      const response = await fetch(url, {
        headers: { 'User-Agent': 'KhetMitra/1.0 (farm location lookup)', 'Accept-Language': 'en' },
        signal: AbortSignal.timeout(10000),
      })
      if (!response.ok) return { error: 'The location service could not identify this area.', village: '', district: '' }
      const json = (await response.json()) as { address?: Record<string, string>; display_name?: string }
      const a = json.address ?? {}
      const pick = (...keys: string[]) => keys.map((k) => a[k]).find((v) => typeof v === 'string' && v) ?? ''
      const village = pick('village', 'hamlet', 'locality', 'town', 'city', 'municipality', 'suburb', 'neighbourhood')
      const district = pick('state_district', 'district', 'county')
      return { village, district, displayName: json.display_name ?? '', error: '' }
    } catch {
      return {
        error: 'Unable to look up this location right now. Please enter the village and district manually.',
        village: '',
        district: '',
      }
    }
  })
