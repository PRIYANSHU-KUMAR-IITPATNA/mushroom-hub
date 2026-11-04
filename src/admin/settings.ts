export type AdminDemoSettings = {
  schemaVersion: 1
  bagUnitPrice: number
  gradeRates: { A: number; B: number; C: number }
}

const SETTINGS_KEY = 'mushroom-hub-admin-demo-settings-v1'
export const DEFAULT_SETTINGS: AdminDemoSettings = {
  schemaVersion: 1,
  bagUnitPrice: 80,
  gradeRates: { A: 180, B: 140, C: 100 },
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

export function loadAdminSettings(): {
  settings: AdminDemoSettings
  invalid: boolean
  unavailable: boolean
} {
  let raw: string | null
  try {
    raw = window.localStorage.getItem(SETTINGS_KEY)
  } catch {
    return { settings: DEFAULT_SETTINGS, invalid: false, unavailable: true }
  }
  if (raw === null) {
    return { settings: DEFAULT_SETTINGS, invalid: false, unavailable: false }
  }
  try {
    const value: unknown = JSON.parse(raw)
    if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.gradeRates)) {
      throw new TypeError('Invalid admin demo settings')
    }
    const rates = value.gradeRates
    if (
      !isNonNegativeNumber(rates.A) ||
      !isNonNegativeNumber(rates.B) ||
      !isNonNegativeNumber(rates.C) ||
      (value.bagUnitPrice !== undefined &&
        !isPositiveNumber(value.bagUnitPrice))
    ) {
      throw new TypeError('Invalid admin demo settings')
    }
    return {
      settings: {
        schemaVersion: 1,
        bagUnitPrice: isPositiveNumber(value.bagUnitPrice)
          ? value.bagUnitPrice
          : DEFAULT_SETTINGS.bagUnitPrice,
        gradeRates: {
          A: rates.A,
          B: rates.B,
          C: rates.C,
        },
      },
      invalid: false,
      unavailable: false,
    }
  } catch {
    try {
      window.localStorage.removeItem(SETTINGS_KEY)
    } catch {
      return { settings: DEFAULT_SETTINGS, invalid: false, unavailable: true }
    }
    return { settings: DEFAULT_SETTINGS, invalid: true, unavailable: false     }
  }
}

export function saveAdminSettings(settings: AdminDemoSettings): void {
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

export function clearAdminSettings(): void {
  window.localStorage.removeItem(SETTINGS_KEY)
}
