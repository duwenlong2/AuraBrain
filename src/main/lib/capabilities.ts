import { loadConfig, saveConfig, type AuraBrainConfig } from './config-store.ts'
import { outlookEvents, outlookRecentEmails, type OutlookEmailItem, type OutlookEventItem } from './outlook.ts'

export type CapabilityDataMode = 'real' | 'demo'

export interface CapabilitySettings {
  mail: { enabled: boolean; dataMode: CapabilityDataMode }
  calendar: { enabled: boolean; dataMode: CapabilityDataMode }
}

export interface CapabilityEnvelope<T> {
  ok: boolean
  enabled: boolean
  mode: CapabilityDataMode
  source: 'outlook-local' | 'demo'
  data: T
  error?: string
}

export function loadCapabilitySettings(): CapabilitySettings {
  const configured = loadConfig().capabilities
  return {
    mail: {
      enabled: configured?.mail?.enabled ?? true,
      dataMode: configured?.mail?.dataMode === 'demo' ? 'demo' : 'real',
    },
    calendar: {
      enabled: configured?.calendar?.enabled ?? true,
      dataMode: configured?.calendar?.dataMode === 'demo' ? 'demo' : 'real',
    },
  }
}

export function saveCapabilitySettings(settings: CapabilitySettings): void {
  const current = loadConfig()
  saveConfig({
    ...current,
    capabilities: settings,
  })
}

export async function readCapabilityMail(limit = 8): Promise<CapabilityEnvelope<OutlookEmailItem[]>> {
  const settings = loadCapabilitySettings().mail
  if (!settings.enabled) return envelope([], false, settings.dataMode, 'demo')
  if (settings.dataMode === 'demo') return envelope(demoEmails(), true, 'demo', 'demo')

  try {
    return envelope(await outlookRecentEmails(limit, 14), true, 'real', 'outlook-local')
  } catch (error: any) {
    return envelope([], true, 'real', 'outlook-local', error?.message || String(error))
  }
}

export async function readCapabilityCalendar(days = 14): Promise<CapabilityEnvelope<OutlookEventItem[]>> {
  const settings = loadCapabilitySettings().calendar
  if (!settings.enabled) return envelope([], false, settings.dataMode, 'demo')
  if (settings.dataMode === 'demo') return envelope(demoEvents(), true, 'demo', 'demo')

  try {
    return envelope(await outlookEvents(days), true, 'real', 'outlook-local')
  } catch (error: any) {
    return envelope([], true, 'real', 'outlook-local', error?.message || String(error))
  }
}

function envelope<T>(data: T, enabled: boolean, mode: CapabilityDataMode, source: 'outlook-local' | 'demo', error?: string): CapabilityEnvelope<T> {
  return { ok: !error, enabled, mode, source, data, ...(error ? { error } : {}) }
}

function demoEmails(): OutlookEmailItem[] {
  const now = new Date()
  return [
    {
      entryId: 'demo-mail-001',
      subject: 'Client onboarding documents for review',
      from: 'Sarah Chen',
      fromEmail: 'sarah.chen@example.test',
      received: new Date(now.getTime() - 35 * 60_000).toISOString(),
      unread: true,
      hasAttach: true,
      body: 'The onboarding documents are ready for your review.',
      html: null,
    },
    {
      entryId: 'demo-mail-002',
      subject: 'Weekly product strategy sync',
      from: 'Alex Morgan',
      fromEmail: 'alex.morgan@example.test',
      received: new Date(now.getTime() - 3 * 3_600_000).toISOString(),
      unread: false,
      hasAttach: false,
      body: 'A short summary of this week\'s product strategy sync.',
      html: null,
    },
    {
      entryId: 'demo-mail-003',
      subject: 'Travel details for next week',
      from: 'Travel Desk',
      fromEmail: 'travel@example.test',
      received: new Date(now.getTime() - 26 * 3_600_000).toISOString(),
      unread: false,
      hasAttach: true,
      body: 'Your itinerary is attached.',
      html: null,
    },
  ]
}

function demoEvents(): OutlookEventItem[] {
  const start = new Date()
  start.setHours(9, 30, 0, 0)
  return [
    {
      subject: 'Product Strategy Sync',
      start: start.toISOString(),
      end: new Date(start.getTime() + 60 * 60_000).toISOString(),
      location: 'Teams',
      organizer: 'Sarah Chen',
      online: true,
      meetingUrl: 'https://teams.example.test/demo',
    },
    {
      subject: 'Client Onboarding Review',
      start: new Date(start.getTime() + 3 * 60 * 60_000).toISOString(),
      end: new Date(start.getTime() + 4 * 60 * 60_000).toISOString(),
      location: 'Focus Room',
      organizer: 'Alex Morgan',
      online: false,
      meetingUrl: '',
    },
    {
      subject: 'Storyboard Review',
      start: new Date(start.getTime() + 24 * 60 * 60_000).toISOString(),
      end: new Date(start.getTime() + 25 * 60 * 60_000).toISOString(),
      location: 'Teams',
      organizer: 'Sarah Chen',
      online: true,
      meetingUrl: 'https://teams.example.test/demo-2',
    },
  ]
}
