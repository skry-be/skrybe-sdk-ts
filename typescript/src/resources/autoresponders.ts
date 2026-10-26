import { parseJsonObject } from '../parse.js'
import type { Transport } from '../transport.js'
import type { EngagementStats, Tracking } from './shared.js'

/**
 * `drip` sends each email a set time after someone joins; `annually` and
 * `on_date` send on a Date custom field, every year or once.
 */
export type AutoresponderType = 'drip' | 'annually' | 'on_date'

export interface Autoresponder {
  id: number
  name: string
  /** `unknown` for a type this SDK predates. */
  type: AutoresponderType | 'unknown'
  /** Encrypted, like the ids `lists.list()` returns. */
  list_id: string
  /** The date field an `annually` or `on_date` autoresponder sends on. */
  custom_field: string | null
  emails: number
  enabled_emails: number
}

export interface AutoresponderEmail {
  id: number
  autoresponder_id: number
  subject: string
  from_name: string
  from_email: string
  /** As stored: "immediately", "+3 days", "-1 days", or "" for the date itself. */
  when: string
  enabled: boolean
  recipients: number
  /** Unix seconds. */
  created_at: number | null
}

export interface AutoresponderWithEmails extends Autoresponder {
  email_list: AutoresponderEmail[]
}

export interface AutoresponderEmailStats extends EngagementStats {
  id: number
  autoresponder_id: number
}

export interface CreateAutoresponderParams {
  name: string
  type: AutoresponderType
  /** The encrypted list id. A list can have one drip autoresponder. */
  listId: string
  /** Required for `annually` and `on_date`: a Date custom field of the list, one autoresponder per field. */
  customField?: string
}

export interface CreateAutoresponderEmailParams {
  subject: string
  htmlText: string
  plainText?: string
  preheader?: string
  /**
   * When it goes. For a drip, "immediately" (the default) or a delay such as
   * "+3 days"; for annually and on_date, "on" (the default, the date itself)
   * or an offset such as "+9 hours" or "-1 days". Units: minute, hour, day,
   * week, month.
   */
  when?: string
  /** Each falls back to the brand's sender. */
  fromName?: string
  fromEmail?: string
  replyTo?: string
  queryString?: string
  trackOpens?: Tracking
  trackClicks?: Tracking
  /** Emails are created off, as the dashboard creates them, unless this is true. */
  enabled?: boolean
}

export class Autoresponders {
  constructor(private readonly transport: Transport) {}

  /** The brand's autoresponders, or one list's. */
  async list(opts: { listId?: string } = {}): Promise<Autoresponder[]> {
    const body = await this.transport.text({
      path: 'api/autoresponders/get-autoresponders.php',
      body: { list_id: opts.listId },
      retryable: true,
    })
    return parseJsonObject<{ autoresponders: Autoresponder[] }>(body, 'autoresponders').autoresponders
  }

  /** One autoresponder with its emails. */
  async get(autoresponderId: number): Promise<AutoresponderWithEmails> {
    const body = await this.transport.text({
      path: 'api/autoresponders/get-autoresponder-emails.php',
      body: { autoresponder_id: autoresponderId },
      retryable: true,
    })
    return parseJsonObject<AutoresponderWithEmails>(body, 'autoresponder')
  }

  async emailStats(emailId: number): Promise<AutoresponderEmailStats> {
    const body = await this.transport.text({
      path: 'api/autoresponders/autoresponder-stats.php',
      body: { email_id: emailId },
      retryable: true,
    })
    return parseJsonObject<AutoresponderEmailStats>(body, 'autoresponder email stats')
  }

  /** Creates an autoresponder with no emails; add them with `createEmail()`. Not retried. */
  async create(params: CreateAutoresponderParams): Promise<Autoresponder> {
    const body = await this.transport.text({
      path: 'api/autoresponders/create-autoresponder.php',
      body: { name: params.name, type: params.type, list_id: params.listId, custom_field: params.customField },
    })
    return parseJsonObject<Autoresponder>(body, 'autoresponder')
  }

  /** Adds an email to an autoresponder. Not retried: a repeat would add it twice. */
  async createEmail(autoresponderId: number, params: CreateAutoresponderEmailParams): Promise<AutoresponderEmail> {
    const body = await this.transport.text({
      path: 'api/autoresponders/create-autoresponder-email.php',
      body: {
        autoresponder_id: autoresponderId,
        subject: params.subject,
        html_text: params.htmlText,
        plain_text: params.plainText,
        preheader: params.preheader,
        when: params.when,
        from_name: params.fromName,
        from_email: params.fromEmail,
        reply_to: params.replyTo,
        query_string: params.queryString,
        track_opens: params.trackOpens,
        track_clicks: params.trackClicks,
        enabled: params.enabled ? 1 : undefined,
      },
    })
    return parseJsonObject<AutoresponderEmail>(body, 'autoresponder email')
  }
}
