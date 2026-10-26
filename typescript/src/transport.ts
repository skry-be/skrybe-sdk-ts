import {
  ApiError,
  ConnectionError,
  classifyProse,
  codeForStatus,
  createError,
  typeForStatus,
  type SkrybeError,
} from './errors.js'
import { VERSION } from './version.js'

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>

export interface TransportOptions {
  apiKey: string
  baseUrl: string
  timeoutMs: number
  maxRetries: number
  fetch: FetchLike
}

export type Fields = Record<string, string | number | undefined>

export interface RequestOptions {
  /** Path relative to the install root, e.g. `api/lists/get-lists.php`. */
  path: string
  /** Form fields. `api_key` is added automatically unless `anonymous`. */
  body?: Fields
  /**
   * `form` posts application/x-www-form-urlencoded, which is what every
   * endpoint wants except api/emails/send-transactional.php, which reads
   * php://input and needs a raw JSON body.
   */
  encoding?: 'form' | 'json'
  method?: 'GET' | 'POST'
  /** Skip the api_key: only api/stats/emails-sent.php is public. */
  anonymous?: boolean
  /**
   * Opt in to retrying this request. Off by default because most endpoints
   * here create or send something, and none of them take an idempotency key:
   * a 504 from a send that actually landed becomes a second campaign on
   * retry. A dropped connection cannot be told apart from a response we never
   * saw, so only reads set this.
   */
  retryable?: boolean
}

const RETRYABLE_STATUS = new Set([429, 502, 503, 504])

export class Transport {
  private readonly opts: TransportOptions

  constructor(opts: TransportOptions) {
    this.opts = { ...opts, baseUrl: opts.baseUrl.replace(/\/+$/, '') }
  }

  /**
   * Perform a request and return the body as text.
   *
   * Legacy endpoints answer HTTP 200 with a prose error, so a 2xx here is not
   * proof of success: recognised prose errors are thrown, and anything else is
   * handed back for the caller to parse.
   */
  async text(opts: RequestOptions): Promise<string> {
    const response = await this.send(opts)
    const text = await response.text()

    if (!response.ok) throw errorFromResponse(response, text)

    const prose = classifyProse(text, response.status)
    if (prose) throw prose

    return text
  }

  /** Perform a request against one of the endpoints that returns real JSON. */
  async json<T>(opts: RequestOptions): Promise<T> {
    const response = await this.send(opts)
    const text = await response.text()

    if (!response.ok) throw errorFromResponse(response, text)

    try {
      return JSON.parse(text) as T
    } catch {
      throw new ApiError('malformed_response', 'The API returned a response that was not valid JSON.', {
        raw: text,
        status: response.status,
      })
    }
  }

  private async send(opts: RequestOptions): Promise<Response> {
    const method = opts.method ?? 'POST'
    const target = `${this.opts.baseUrl}/${opts.path.replace(/^\/+/, '')}`

    const fields: Record<string, string> = {}
    for (const [key, value] of Object.entries(opts.body ?? {})) {
      if (value !== undefined) fields[key] = String(value)
    }
    if (!opts.anonymous) fields.api_key = this.opts.apiKey

    const headers: Record<string, string> = { 'User-Agent': `skrybe-sdk-ts/${VERSION}` }
    let url = target
    let body: string | undefined
    if (method === 'GET') {
      const query = new URLSearchParams(fields).toString()
      if (query !== '') url = `${target}?${query}`
    } else if (opts.encoding === 'json') {
      headers['Content-Type'] = 'application/json'
      body = JSON.stringify(fields)
    } else {
      headers['Content-Type'] = 'application/x-www-form-urlencoded'
      body = new URLSearchParams(fields).toString()
    }

    const attempts = opts.retryable ? this.opts.maxRetries + 1 : 1
    let lastError: unknown
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs)

      try {
        const response = await this.opts.fetch(url, { method, headers, body, signal: controller.signal })
        if (RETRYABLE_STATUS.has(response.status) && attempt < attempts) {
          // Drain it so the connection can be reused.
          await response.text().catch(() => undefined)
          await delay(backoffMs(attempt, response.headers.get('retry-after')))
          continue
        }
        return response
      } catch (err) {
        lastError = err
        if (isAbort(err)) {
          throw new ConnectionError('timeout', `Request to ${target} timed out after ${this.opts.timeoutMs}ms.`, {
            cause: err,
          })
        }
        if (attempt < attempts) {
          await delay(backoffMs(attempt, null))
          continue
        }
      } finally {
        clearTimeout(timer)
      }
    }

    throw new ConnectionError(
      'network_error',
      `Could not reach ${this.opts.baseUrl}: ${(lastError as Error | undefined)?.message ?? 'unknown error'}`,
      { cause: lastError },
    )
  }
}

/**
 * Build an error from a non-2xx response. The JSON endpoints use
 * `{ok:false,error:...}` (api/emails/send.php) or
 * `{status:"error",message:...}` (api/emails/send-transactional.php).
 */
function errorFromResponse(response: Response, text: string): SkrybeError {
  let message = text.trim()
  try {
    const parsed = JSON.parse(text) as { error?: unknown; message?: unknown }
    const extracted = parsed.error ?? parsed.message
    if (typeof extracted === 'string' && extracted !== '') message = extracted
  } catch {
    // Not JSON: the prose body is already the best message we have.
  }
  if (message === '') message = `HTTP ${response.status} from the Skrybe API.`

  return createError(typeForStatus(response.status), codeForStatus(response.status), message, {
    raw: text,
    status: response.status,
  })
}

/** Honour Retry-After when present, else exponential backoff with jitter. */
function backoffMs(attempt: number, retryAfter: string | null): number {
  if (retryAfter) {
    const seconds = Number.parseInt(retryAfter, 10)
    if (!Number.isNaN(seconds) && seconds >= 0) return Math.min(seconds * 1000, 30_000)
  }
  return 2 ** (attempt - 1) * 500 + Math.floor(Math.random() * 250)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isAbort(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError'
}
