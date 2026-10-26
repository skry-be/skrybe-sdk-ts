import { isProseEmpty } from '../errors.js'
import { parseJsonObject, parseNumberedObject } from '../parse.js'
import type { Transport } from '../transport.js'

export interface Brand {
  id: string
  name: string
}

export class Brands {
  constructor(private readonly transport: Transport) {}

  /**
   * The key's own brand: a brand key gets exactly one row. Empty, not an error,
   * when there is none.
   */
  async list(): Promise<Brand[]> {
    const body = await this.transport.text({ path: 'api/brands/get-brands.php', retryable: true })
    if (isProseEmpty(body)) return []
    return parseNumberedObject(body, 'brand')
  }
}

/**
 * `transactional` reaches numbers on Nigeria's DND register and is for OTPs,
 * receipts and alerts; `promotional` is the cheaper route DND numbers never get.
 */
export const SMS_TYPES = ['transactional', 'promotional'] as const
export type SmsType = (typeof SMS_TYPES)[number]

export interface SendSmsParams {
  /** Any common Nigerian format: 0803 123 4567, +2348031234567, ... */
  to: string
  message: string
  type?: SmsType
}

export interface SendSmsResult {
  id: number
  /** E.164, as the server normalised it. */
  to: string
  /** `sent`, or `failed` when the provider refused it (the charge is refunded). */
  status: string
  /** SMS segments charged against the brand's monthly allowance. */
  segments: number
  error: string | null
  /** Segments left this month; null when the brand has no limit. */
  allowance_remaining: number | null
}

export interface SmsMessage {
  id: number
  to: string
  sender_id: string
  type: SmsType
  /** queued, sent, delivered, failed or rejected. */
  status: string
  segments: number
  error: string | null
  /** Unix seconds. */
  created_at: number
  sent_at: number | null
  delivered_at: number | null
}

export class Sms {
  constructor(private readonly transport: Transport) {}

  /**
   * Sends one SMS, charged to the key's brand. Not retried: a timeout after the
   * server handed the message to the provider would otherwise send it twice.
   */
  async send(params: SendSmsParams): Promise<SendSmsResult> {
    const body = await this.transport.text({
      path: 'api/sms/send.php',
      body: { to: params.to, message: params.message, type: params.type },
    })
    return parseJsonObject<SendSmsResult>(body, 'SMS send result')
  }

  /** One message and its latest delivery status. */
  async get(messageId: number | string): Promise<SmsMessage> {
    const body = await this.transport.text({ path: 'api/sms/get-message.php', body: { id: messageId }, retryable: true })
    return parseJsonObject<SmsMessage>(body, 'SMS message')
  }
}

export class Stats {
  constructor(private readonly transport: Transport) {}

  /**
   * Emails sent across the whole installation (campaigns, autoresponders and
   * transactional), not a per-brand figure. Public and cached for 5 minutes.
   */
  async totalEmailsSent(): Promise<number> {
    const data = await this.transport.json<{ total_emails_sent?: number }>({
      path: 'api/stats/emails-sent.php',
      method: 'GET',
      anonymous: true,
      retryable: true,
    })
    return data.total_emails_sent ?? 0
  }
}
