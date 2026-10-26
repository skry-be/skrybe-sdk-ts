import { isProseSuccess, unexpectedResponse } from '../errors.js'
import { parseJsonObject } from '../parse.js'
import type { Transport } from '../transport.js'

export interface SubscriberRef {
  /** The encrypted list id, as `lists.list()` returns it. */
  listId: string
  email: string
}

export interface SubscribeParams extends SubscriberRef {
  name?: string
  /** Mobile number for SMS. The server ignores one it cannot read, rather than failing the signup. */
  phone?: string
  /** Two-letter ISO 3166-1 code, e.g. NG. */
  country?: string
  ipAddress?: string
  referrer?: string
  /** Record GDPR consent for an EU signup. */
  gdpr?: boolean
  /** Add to a double opt-in list as single opt-in, skipping confirmation. */
  silent?: boolean
  /**
   * Custom fields, keyed by the name the list shows, e.g. `Birthday` for a
   * field whose tag is `[Birthday,fallback=]`. Spaces are taken out before
   * sending, as the server matches on.
   */
  fields?: Record<string, string>
}

export type SubscribeOutcome = 'subscribed' | 'already_subscribed'

/** Every subscriber is in exactly one of these; `active` is who a campaign sends to. */
export const SUBSCRIBER_STATUSES = ['active', 'unconfirmed', 'unsubscribed', 'bounced', 'complained'] as const
export type SubscriberStatus = (typeof SUBSCRIBER_STATUSES)[number]

export interface Subscriber {
  /** null for a contact that only has a phone number. */
  email: string | null
  /** E.164, e.g. +2348031234567. */
  phone: string | null
  /** Opted out of SMS; email is unaffected. */
  sms_opt_out: boolean
  name: string
  status: SubscriberStatus
  /** Unix seconds. */
  joined_at: number | null
  /** By field name, in the list's order. Dates are YYYY-MM-DD; empty values are null. */
  custom_fields: Record<string, string | null>
}

export interface SubscribersPage {
  list_id: string
  status: SubscriberStatus | null
  page: number
  limit: number
  /** Subscribers matching the status filter, across all pages. */
  total: number
  subscribers: Subscriber[]
}

export interface ListSubscribersParams {
  status?: SubscriberStatus
  /** 1-based. */
  page?: number
  /** At most 1000. */
  limit?: number
}

export const MAX_SUBSCRIBERS_PAGE = 1000

export class Subscribers {
  constructor(private readonly transport: Transport) {}

  /**
   * Adds an address to a list. Posting one that is already there updates its
   * name and custom fields, and resolves `already_subscribed` rather than
   * throwing, so re-running an import is safe.
   */
  async subscribe(params: SubscribeParams): Promise<SubscribeOutcome> {
    const body: Record<string, string> = {}
    for (const [name, value] of Object.entries(params.fields ?? {})) body[name.replace(/ /g, '')] = value

    // Written after the custom fields so the documented names win a collision.
    body.email = params.email
    body.list = params.listId
    // Switches subscribe.php from rendering an HTML page to answering in plain text.
    body.boolean = 'true'
    if (params.name !== undefined) body.name = params.name
    if (params.phone !== undefined) body.phone = params.phone
    if (params.country !== undefined) body.country = params.country
    if (params.ipAddress !== undefined) body.ipaddress = params.ipAddress
    if (params.referrer !== undefined) body.referrer = params.referrer
    if (params.gdpr) body.gdpr = 'true'
    if (params.silent) body.silent = 'true'

    // At the install root, not under api/.
    const text = await this.transport.text({ path: 'subscribe', body })
    if (text.trim().toLowerCase() === 'already subscribed.') return 'already_subscribed'
    if (isProseSuccess(text)) return 'subscribed'
    throw unexpectedResponse('subscribe', text)
  }

  /** Marks the address unsubscribed from the list. */
  async unsubscribe(ref: SubscriberRef): Promise<void> {
    const text = await this.transport.text({
      path: 'unsubscribe',
      body: { email: ref.email, list: ref.listId, boolean: 'true' },
    })
    if (!isProseSuccess(text)) throw unexpectedResponse('unsubscribe', text)
  }

  /** Removes the subscriber outright, rather than marking it unsubscribed. */
  async delete(ref: SubscriberRef): Promise<void> {
    const text = await this.transport.text({
      path: 'api/subscribers/delete.php',
      body: { list_id: ref.listId, email: ref.email },
    })
    if (!isProseSuccess(text)) throw unexpectedResponse('delete', text)
  }

  /**
   * One of Subscribed, Unsubscribed, Unconfirmed, Bounced, Soft bounced or
   * Complained. Returned as given, so a status added server-side surfaces
   * rather than being rejected.
   */
  async status(ref: SubscriberRef): Promise<string> {
    const text = await this.transport.text({
      path: 'api/subscribers/subscription-status.php',
      body: { email: ref.email, list_id: ref.listId },
      retryable: true,
    })
    const status = text.trim()
    if (status === '') throw unexpectedResponse('subscription-status', text)
    return status
  }

  /** One page of a list's subscribers, oldest first. */
  async list(listId: string, params: ListSubscribersParams = {}): Promise<SubscribersPage> {
    const body = await this.transport.text({
      path: 'api/subscribers/get-subscribers.php',
      body: { list_id: listId, status: params.status, page: params.page, limit: params.limit },
      retryable: true,
    })
    return parseJsonObject<SubscribersPage>(body, 'subscribers page')
  }

  /**
   * Every page, at the largest page size. Oldest first, so someone joining
   * mid-way lands on a later page instead of shifting the ones already read.
   */
  async listAll(listId: string, params: { status?: SubscriberStatus } = {}): Promise<Subscriber[]> {
    const all: Subscriber[] = []
    for (let page = 1; ; page++) {
      const r = await this.list(listId, { ...params, page, limit: MAX_SUBSCRIBERS_PAGE })
      all.push(...r.subscribers)
      if (r.subscribers.length < MAX_SUBSCRIBERS_PAGE) return all
    }
  }
}
