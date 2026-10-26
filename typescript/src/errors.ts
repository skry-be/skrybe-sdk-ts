/**
 * The Skrybe API answers most failures with HTTP 200 and a prose sentence.
 * Only api/emails/send.php, api/emails/send-transactional.php and
 * api/stats/emails-sent.php use real status codes.
 *
 * Everything here exists to turn that into something code can branch on: every
 * failure is a `SkrybeError` with a stable `code`, and its subclass says what
 * kind of failure it is.
 */

/**
 * - `authentication`: the API key is missing or wrong.
 * - `invalid_request`: the request itself is wrong; retrying it unchanged will fail again.
 * - `rate_limit`: a quota or rate limit was hit.
 * - `connection`: the API could not be reached, or did not answer in time.
 * - `api`: anything else the API refused or got wrong.
 */
export type SkrybeErrorType = 'authentication' | 'invalid_request' | 'rate_limit' | 'connection' | 'api'

export interface SkrybeErrorOptions {
  /** What to do about it, when we know. */
  hint?: string
  /** HTTP status of the response, when there was one. */
  status?: number
  /** Raw response body, kept for debugging odd endpoints. */
  raw?: string
  cause?: unknown
}

export class SkrybeError extends Error {
  /** Stable machine-readable slug, e.g. `list_not_found`. */
  readonly code: string
  readonly type: SkrybeErrorType
  readonly hint?: string
  readonly status?: number
  readonly raw?: string

  constructor(type: SkrybeErrorType, code: string, message: string, opts: SkrybeErrorOptions = {}) {
    super(message, opts.cause === undefined ? undefined : { cause: opts.cause })
    this.name = 'SkrybeError'
    this.type = type
    this.code = code
    this.hint = opts.hint
    this.status = opts.status
    this.raw = opts.raw
  }
}

export class AuthenticationError extends SkrybeError {
  constructor(code: string, message: string, opts?: SkrybeErrorOptions) {
    super('authentication', code, message, opts)
    this.name = 'AuthenticationError'
  }
}

export class InvalidRequestError extends SkrybeError {
  constructor(code: string, message: string, opts?: SkrybeErrorOptions) {
    super('invalid_request', code, message, opts)
    this.name = 'InvalidRequestError'
  }
}

export class RateLimitError extends SkrybeError {
  constructor(code: string, message: string, opts?: SkrybeErrorOptions) {
    super('rate_limit', code, message, opts)
    this.name = 'RateLimitError'
  }
}

export class ConnectionError extends SkrybeError {
  constructor(code: string, message: string, opts?: SkrybeErrorOptions) {
    super('connection', code, message, opts)
    this.name = 'ConnectionError'
  }
}

export class ApiError extends SkrybeError {
  constructor(code: string, message: string, opts?: SkrybeErrorOptions) {
    super('api', code, message, opts)
    this.name = 'ApiError'
  }
}

export function createError(
  type: SkrybeErrorType,
  code: string,
  message: string,
  opts?: SkrybeErrorOptions,
): SkrybeError {
  switch (type) {
    case 'authentication':
      return new AuthenticationError(code, message, opts)
    case 'invalid_request':
      return new InvalidRequestError(code, message, opts)
    case 'rate_limit':
      return new RateLimitError(code, message, opts)
    case 'connection':
      return new ConnectionError(code, message, opts)
    default:
      return new ApiError(code, message, opts)
  }
}

/**
 * Render an unexpected response body for an error message: whitespace collapsed
 * so a multi-line PHP warning stays on one line, and truncated so a stray HTML
 * page does not swamp a log. The untruncated body stays on `SkrybeError.raw`.
 */
export function excerpt(body: string, limit = 200): string {
  const flat = body.replace(/\s+/g, ' ').trim()
  if (flat === '') return '(an empty response)'
  return flat.length > limit ? `${flat.slice(0, limit)}…` : flat
}

interface ProseRule {
  code: string
  type: SkrybeErrorType
  hint?: string
}

const LIST_IDS_HINT = 'Call lists.list() to see the IDs available to this API key.'
const UNDER_REVIEW_HINT =
  'Sending is paused while the brand is reviewed for a high bounce rate. Contact Skrybe support.'
const DOMAIN_HINT = "Verify the From domain for this brand in the Skrybe dashboard."

/**
 * Prose returned by the legacy endpoints, mapped to a stable code.
 * Matched case-insensitively against the trimmed body.
 *
 * Kept in step with skrybe-cli's src/api/errors.ts, which documents where each
 * one comes from.
 */
const PROSE_ERRORS: Record<string, ProseRule> = {
  // Authentication
  'api key not passed': { code: 'api_key_missing', type: 'authentication' },
  'invalid api key': {
    code: 'invalid_api_key',
    type: 'authentication',
    hint: 'Generate a key in the Skrybe dashboard under Settings. Keys are cleared for every login of a brand placed under review.',
  },

  // Request shape
  'no data passed': { code: 'no_data_passed', type: 'invalid_request' },
  'some fields are missing.': { code: 'missing_fields', type: 'invalid_request' },

  // Brands and lists
  'brand id not passed': { code: 'brand_id_missing', type: 'invalid_request' },
  // Also the answer to the install's main account key, which no brand is tied to.
  'brand does not exist': {
    code: 'brand_not_found',
    type: 'api',
    hint: 'Use an API key from a brand login; the main account key is not tied to a brand.',
  },
  'list does not exist': { code: 'list_not_found', type: 'api', hint: LIST_IDS_HINT },
  'invalid list id.': { code: 'list_not_found', type: 'api', hint: LIST_IDS_HINT },
  // Also what the server produces from an id it cannot decrypt, so this is
  // the answer to a malformed id as much as to a missing one.
  'list id not passed': {
    code: 'list_id_invalid',
    type: 'invalid_request',
    hint: 'A list ID is the encrypted value lists.list() returns, not the number in the dashboard URL.',
  },

  // Autoresponders
  'autoresponder id not passed': { code: 'autoresponder_id_missing', type: 'invalid_request' },
  'autoresponder does not exist': { code: 'autoresponder_not_found', type: 'api' },
  'email id not passed': { code: 'email_id_missing', type: 'invalid_request' },
  'autoresponder email does not exist': { code: 'autoresponder_email_not_found', type: 'api' },
  'autoresponder name not passed': { code: 'autoresponder_name_missing', type: 'invalid_request' },
  'type must be drip, annually or on_date': { code: 'invalid_autoresponder_type', type: 'invalid_request' },
  'list already has a drip autoresponder': {
    code: 'drip_exists',
    type: 'api',
    hint: 'A list can have one drip autoresponder. Add emails to the existing one.',
  },
  'custom_field not passed': {
    code: 'custom_field_missing',
    type: 'invalid_request',
    hint: 'annually and on_date autoresponders send on a Date custom field of the list.',
  },
  'field is not a date field': { code: 'field_not_date', type: 'invalid_request' },
  'field already has an autoresponder': { code: 'field_has_autoresponder', type: 'api' },
  'subject not passed': { code: 'subject_missing', type: 'invalid_request' },
  'a drip email cannot go before signup': { code: 'invalid_when', type: 'invalid_request' },
  'when must be immediately, or a delay such as +3 days': { code: 'invalid_when', type: 'invalid_request' },
  'when must be on, or an offset such as +9 hours or -1 days': { code: 'invalid_when', type: 'invalid_request' },

  // Templates
  'template id not passed': { code: 'template_id_missing', type: 'invalid_request' },
  'template does not exist': { code: 'template_not_found', type: 'api' },
  'template name not passed': { code: 'template_name_missing', type: 'invalid_request' },
  'template name cannot be empty': { code: 'template_name_missing', type: 'invalid_request' },
  'html not passed': { code: 'html_missing', type: 'invalid_request' },
  'editor must be html or dragdrop': { code: 'invalid_editor', type: 'invalid_request' },

  // List management
  'list name not passed': { code: 'list_name_missing', type: 'invalid_request' },
  'list name is too long': {
    code: 'list_name_too_long',
    type: 'invalid_request',
    hint: 'A list name can be at most 100 characters.',
  },
  'opt_in must be single or double': { code: 'invalid_opt_in', type: 'invalid_request' },
  'nothing to update': { code: 'nothing_to_update', type: 'invalid_request', hint: 'Pass at least one field to change.' },
  'list is used by a scheduled or sending campaign': {
    code: 'list_in_use',
    type: 'api',
    hint: 'Unschedule the campaign, or wait for it to finish sending, then delete the list.',
  },

  // Custom fields
  'field name not passed': { code: 'field_name_missing', type: 'invalid_request' },
  'invalid field name': {
    code: 'invalid_field_name',
    type: 'invalid_request',
    hint: 'Up to 100 characters, without : % [ ] , " < or >.',
  },
  'name and email are built-in fields': { code: 'reserved_field_name', type: 'invalid_request' },
  'type must be text or date': { code: 'invalid_field_type', type: 'invalid_request' },
  'field already exists': { code: 'field_exists', type: 'api', hint: 'Field names are case-insensitive.' },
  'field does not exist': { code: 'field_not_found', type: 'api' },
  'field is used by an autoresponder': {
    code: 'field_in_use',
    type: 'api',
    hint: 'Change the autoresponder in the Skrybe dashboard first.',
  },
  'field is used by a segment': {
    code: 'field_in_use',
    type: 'api',
    hint: 'Remove it from the segment in the Skrybe dashboard first.',
  },
  'list was changed by another request. try again.': { code: 'conflict', type: 'api' },

  // Campaigns
  'campaign id not passed': { code: 'campaign_id_missing', type: 'invalid_request' },
  'campaign does not exist': { code: 'campaign_not_found', type: 'api' },
  'invalid status': { code: 'invalid_status', type: 'invalid_request' },
  'invalid page': { code: 'invalid_page', type: 'invalid_request' },
  'invalid limit': { code: 'invalid_limit', type: 'invalid_request' },
  'invalid type': { code: 'invalid_type', type: 'invalid_request' },

  // Sending a campaign
  'list or segment id(s) not passed': {
    code: 'recipients_missing',
    type: 'invalid_request',
    hint: 'Pass at least one list or segment ID.',
  },
  'one or more list ids are invalid': { code: 'list_not_found', type: 'api', hint: LIST_IDS_HINT },
  'one or more segment ids are invalid': { code: 'segment_not_found', type: 'api' },
  'campaign has already been sent': {
    code: 'campaign_not_draft',
    type: 'api',
    hint: 'It has already started sending, so it can no longer be sent, scheduled or edited.',
  },
  'campaign is scheduled': {
    code: 'campaign_scheduled',
    type: 'api',
    hint: 'Unschedule it first, or leave it to send at its scheduled time.',
  },
  'campaign is not scheduled': { code: 'campaign_not_scheduled', type: 'api' },

  // Editing and deleting campaigns
  'campaign is sending': {
    code: 'campaign_sending',
    type: 'api',
    hint: 'Stop it in the Skrybe dashboard first, or wait for it to finish.',
  },
  'subject cannot be empty': { code: 'subject_empty', type: 'invalid_request' },
  'html cannot be empty': { code: 'html_empty', type: 'invalid_request' },
  'invalid from_email': { code: 'invalid_from_email', type: 'invalid_request' },
  'invalid reply_to': { code: 'invalid_reply_to', type: 'invalid_request' },
  'track_opens and track_clicks must be 0, 1 or 2': {
    code: 'invalid_tracking',
    type: 'invalid_request',
    hint: '0 off, 1 on, 2 anonymous.',
  },
  'campaign was changed by another request. try again.': { code: 'conflict', type: 'api' },

  // Scheduling
  'schedule_date_time not passed': { code: 'schedule_missing', type: 'invalid_request' },
  'schedule_date_time is invalid': {
    code: 'invalid_schedule',
    type: 'invalid_request',
    hint: 'Use a date and time such as "2027-06-15 18:05" or "June 15, 2027 6:05pm".',
  },
  'schedule_date_time is in the past': {
    code: 'schedule_in_past',
    type: 'invalid_request',
    hint: "The time is read in the timezone given, or the account's timezone if none is.",
  },
  'schedule_timezone is invalid': {
    code: 'invalid_timezone',
    type: 'invalid_request',
    hint: 'Use an IANA name such as Africa/Lagos or America/New_York.',
  },

  // Test sends
  'email addresses not passed': { code: 'emails_missing', type: 'invalid_request' },
  'too many email addresses': {
    code: 'too_many_emails',
    type: 'invalid_request',
    hint: 'A test send goes to at most 5 addresses.',
  },
  'quota exceeded. please upgrade your plan.': { code: 'quota_exceeded', type: 'rate_limit' },
  'no active subscribers to send to': {
    code: 'no_recipients',
    type: 'api',
    hint: 'Every subscriber on those lists is unsubscribed, bounced, unconfirmed or excluded.',
  },

  // Subscribers
  'subscriber does not exist': { code: 'subscriber_not_found', type: 'api' },
  'email does not exist in list': { code: 'subscriber_not_found', type: 'api' },
  'email not passed': { code: 'email_missing', type: 'invalid_request' },
  'email address not passed': { code: 'email_missing', type: 'invalid_request' },
  'invalid email address.': { code: 'invalid_email', type: 'invalid_request' },
  'bounced email address.': { code: 'bounced_email', type: 'api' },
  'email is suppressed.': { code: 'suppressed_email', type: 'api' },
  // unsubscribe.php's wording for an address that is not on the list.
  'email does not exist.': { code: 'subscriber_not_found', type: 'api' },
  'ip address is invalid.': { code: 'invalid_ip_address', type: 'invalid_request' },
  'country must be a valid 2 letter country code': {
    code: 'invalid_country',
    type: 'invalid_request',
    hint: 'Use a two-letter ISO 3166-1 code, e.g. NG.',
  },
  'referrer is not a valid url': { code: 'invalid_referrer', type: 'invalid_request' },
  'consent not given.': {
    code: 'consent_not_given',
    type: 'invalid_request',
    hint: 'The list requires GDPR consent; pass gdpr: true.',
  },
  'failed recaptcha test.': {
    code: 'recaptcha_failed',
    type: 'api',
    hint: 'The list has reCAPTCHA enabled on its subscribe form, which an API call cannot satisfy.',
  },

  // SMS
  'phone number not passed': { code: 'phone_missing', type: 'invalid_request' },
  'message not passed': { code: 'message_missing', type: 'invalid_request' },
  'invalid phone number': {
    code: 'invalid_phone',
    type: 'invalid_request',
    hint: 'Use a Nigerian mobile number, e.g. 0803 123 4567 or +2348031234567.',
  },
  'use a brand api key': {
    code: 'brand_key_required',
    type: 'invalid_request',
    hint: 'SMS is charged to a brand. Use an API key from a brand login, not the main account key.',
  },
  'sms is not enabled for this brand': {
    code: 'sms_not_enabled',
    type: 'api',
    hint: "An admin sets the brand's SMS allowance under brand settings, SMS.",
  },
  'monthly sms allowance exceeded': {
    code: 'quota_exceeded',
    type: 'rate_limit',
    hint: 'The allowance resets on the 1st of the month, Lagos time.',
  },
  'message id not passed': { code: 'message_id_missing', type: 'invalid_request' },
  'message does not exist': { code: 'message_not_found', type: 'api' },

  // Sending
  'unauthorised from email domain': {
    code: 'unauthorised_from_domain',
    type: 'api',
    hint: 'The From domain must be verified for this brand, or listed in its allowed domains.',
  },
}

/** Prose with a variable part, matched by pattern after the exact table. */
const PROSE_PATTERN_ERRORS: [RegExp, ProseRule][] = [
  [/^error: this campaign would exceed/, { code: 'quota_exceeded', type: 'rate_limit' }],
  [/^account under review:/, { code: 'account_under_review', type: 'api', hint: UNDER_REVIEW_HINT }],
  [/^brand is under review/, { code: 'account_under_review', type: 'api', hint: UNDER_REVIEW_HINT }],
  [/^a field is too long/, { code: 'field_too_long', type: 'invalid_request' }],
  [
    /^message is longer than \d+ sms segments/,
    {
      code: 'message_too_long',
      type: 'invalid_request',
      hint: 'A segment is 160 characters, or 70 with emoji or special characters.',
    },
  ],
  [
    /^test send rate limit reached/,
    {
      code: 'rate_limited',
      type: 'rate_limit',
      hint: 'Test sends are limited to 20 an hour per brand, shared with the Skrybe dashboard.',
    },
  ],
  [/^domain not verified in ses/, { code: 'domain_not_verified', type: 'api', hint: DOMAIN_HINT }],
  [/^domain ".*" is not verified/, { code: 'domain_not_verified', type: 'api', hint: DOMAIN_HINT }],
]

/**
 * Bodies that mean "nothing to return" rather than a failure: these endpoints
 * answer with prose instead of an empty object when the brand has no rows.
 */
const PROSE_EMPTY = new Set(['no lists found', 'no brands found', 'no campaigns found'])

export function isProseEmpty(body: string): boolean {
  return PROSE_EMPTY.has(body.trim().toLowerCase())
}

/** Bodies that mean success even though they are bare prose. */
const PROSE_OK = new Set(['1', 'true', 'already subscribed.'])

export function isProseSuccess(body: string): boolean {
  return PROSE_OK.has(body.trim().toLowerCase())
}

/**
 * Classify a legacy plain-text body. Returns null when the body is not a
 * recognised error, which callers should treat as data.
 */
export function classifyProse(body: string, status?: number): SkrybeError | null {
  const trimmed = body.trim()
  const key = trimmed.toLowerCase()

  const rule = PROSE_ERRORS[key] ?? PROSE_PATTERN_ERRORS.find(([pattern]) => pattern.test(key))?.[1]
  if (rule) return createError(rule.type, rule.code, trimmed, { raw: body, status, hint: rule.hint })

  // A family of "Unable to ..." server-side failures not worth enumerating.
  if (key.startsWith('unable to')) return new ApiError('operation_failed', trimmed, { raw: body, status })

  return null
}

/** The error type for an HTTP status from one of the JSON endpoints. */
export function typeForStatus(status: number): SkrybeErrorType {
  if (status === 401 || status === 403) return 'authentication'
  if (status === 402 || status === 429) return 'rate_limit'
  if (status === 400 || status === 405 || status === 422) return 'invalid_request'
  return 'api'
}

export function codeForStatus(status: number): string {
  switch (status) {
    case 400:
      return 'invalid_request'
    case 401:
      return 'unauthenticated'
    case 402:
      return 'quota_exceeded'
    case 403:
      return 'forbidden'
    case 404:
      return 'not_found'
    case 405:
      return 'method_not_allowed'
    case 429:
      return 'rate_limited'
    default:
      return status >= 500 ? 'server_error' : 'api_error'
  }
}

/** A body that is neither a known success nor a known failure. */
export function unexpectedResponse(operation: string, body: string): ApiError {
  return new ApiError('unexpected_response', `Unexpected response from ${operation}: ${excerpt(body)}`, { raw: body })
}
