import { InvalidRequestError } from '../errors.js'
import type { Transport } from '../transport.js'
import type { Tracking } from './shared.js'

/** send.php refuses more than this, and says so with a 400. */
export const MAX_RECIPIENTS = 250

export interface SendEmailParams {
  fromName: string
  fromEmail: string
  replyTo: string
  subject: string
  htmlText: string
  plainText?: string
  /** Addresses to send to, at most 250. Without `listIds` these are added to a new list. */
  to?: string[]
  /** Per-recipient values, referenced in the body as `[recipient.first]`. */
  recipientVariables?: Record<string, Record<string, unknown>>
  /** Encrypted list ids, as `lists.list()` returns them. */
  listIds?: string[]
  queryString?: string
  trackOpens?: Tracking
  trackClicks?: Tracking
  /** e.g. "June 15, 2027 6:05pm". */
  scheduleDateTime?: string
  /** e.g. "Africa/Lagos". Falls back to the brand's timezone. */
  scheduleTimezone?: string
}

export interface SendEmailResult {
  message: string
  /** The campaign the send created behind the scenes. */
  campaignId?: string
}

export interface SendTransactionalParams {
  toEmail: string
  subject: string
  /** At least one of `htmlBody` and `plainBody` is required. */
  htmlBody?: string
  plainBody?: string
  /** Each falls back to the brand's configured value when omitted. */
  fromName?: string
  fromEmail?: string
  replyTo?: string
}

export interface SendTransactionalResult {
  message: string
  messageId?: string
}

export class Emails {
  constructor(private readonly transport: Transport) {}

  /**
   * `api/emails/send.php`: a bulk send to addresses or lists. It creates a
   * campaign behind the scenes; the subject doubles as its title.
   */
  async send(params: SendEmailParams): Promise<SendEmailResult> {
    const to = params.to ?? []
    if (to.length === 0 && (params.listIds ?? []).length === 0) {
      throw new InvalidRequestError('recipients_missing', 'Nothing to send to.', {
        hint: 'Pass `to` addresses, or `listIds`.',
      })
    }
    // Checked here so a 251-address send fails before it is transmitted.
    if (to.length > MAX_RECIPIENTS) {
      throw new InvalidRequestError(
        'too_many_recipients',
        `${to.length} recipients is more than the ${MAX_RECIPIENTS} this endpoint accepts.`,
        { hint: 'Split the send, or put the addresses on a list and pass `listIds`.' },
      )
    }

    const data = await this.transport.json<{ message?: string; data?: { campaign_id?: string } | null }>({
      path: 'api/emails/send.php',
      body: {
        from_name: params.fromName,
        from_email: params.fromEmail,
        reply_to: params.replyTo,
        subject: params.subject,
        html_text: params.htmlText,
        plain_text: params.plainText,
        // Both go over the wire as JSON strings inside a form body.
        to: to.length > 0 ? JSON.stringify(to) : undefined,
        'recipient-variables': params.recipientVariables ? JSON.stringify(params.recipientVariables) : undefined,
        list_ids: params.listIds?.join(','),
        query_string: params.queryString,
        track_opens: params.trackOpens,
        track_clicks: params.trackClicks,
        schedule_date_time: params.scheduleDateTime,
        schedule_timezone: params.scheduleTimezone,
      },
    })
    return { message: data.message ?? 'Sent.', campaignId: data.data?.campaign_id }
  }

  /**
   * `api/emails/send-transactional.php`: one email, delivered immediately with
   * nothing queued. For OTPs, password resets and receipts.
   */
  async sendTransactional(params: SendTransactionalParams): Promise<SendTransactionalResult> {
    if (!params.htmlBody && !params.plainBody) {
      throw new InvalidRequestError('body_missing', 'A message body is required.', {
        hint: 'Pass `htmlBody`, `plainBody`, or both.',
      })
    }

    // The one endpoint that reads php://input: a form post gets "Invalid JSON payload."
    const data = await this.transport.json<{ message?: string; message_id?: string }>({
      path: 'api/emails/send-transactional.php',
      encoding: 'json',
      body: {
        to_email: params.toEmail,
        subject: params.subject,
        html_body: params.htmlBody,
        plain_body: params.plainBody,
        from_name: params.fromName,
        from_email: params.fromEmail,
        reply_to: params.replyTo,
      },
    })
    return { message: data.message ?? 'Email sent successfully.', messageId: data.message_id }
  }
}
