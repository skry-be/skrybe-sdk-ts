import { InvalidRequestError } from './errors.js'
import { Autoresponders } from './resources/autoresponders.js'
import { Campaigns } from './resources/campaigns.js'
import { Emails } from './resources/emails.js'
import { Lists } from './resources/lists.js'
import { Brands, Stats } from './resources/misc.js'
import { Subscribers } from './resources/subscribers.js'
import { Templates } from './resources/templates.js'
import { Transport, type FetchLike } from './transport.js'

export const DEFAULT_BASE_URL = 'https://dashboard.skry.be'

export interface SkrybeOptions {
  /** A brand's API key, from Settings in the Skrybe dashboard. Keep it server-side. */
  apiKey: string
  /** Defaults to https://dashboard.skry.be. */
  baseUrl?: string
  /** Per attempt. Defaults to 30 seconds. */
  timeoutMs?: number
  /**
   * Extra attempts for reads after a dropped connection or a 429/502/503/504.
   * Defaults to 2. Writes are never retried: the API has no idempotency keys,
   * so a retried send could go out twice.
   */
  maxRetries?: number
  /**
   * The fetch to use, defaulting to the global one. Pass your own to route
   * through a proxy or trust a corporate CA, e.g. undici's fetch with a
   * dispatcher. There is deliberately no option to skip TLS verification.
   */
  fetch?: FetchLike
}

export class Skrybe {
  readonly emails: Emails
  readonly campaigns: Campaigns
  readonly lists: Lists
  readonly subscribers: Subscribers
  readonly templates: Templates
  readonly autoresponders: Autoresponders
  readonly brands: Brands
  readonly stats: Stats

  constructor(options: SkrybeOptions) {
    if (!options?.apiKey) {
      throw new InvalidRequestError('api_key_missing', 'An apiKey is required.', {
        hint: 'Generate one in the Skrybe dashboard under Settings.',
      })
    }
    const fetchImpl = options.fetch ?? globalThis.fetch
    if (typeof fetchImpl !== 'function') {
      throw new InvalidRequestError('fetch_unavailable', 'No global fetch is available in this runtime.', {
        hint: 'Use Node.js 18 or newer, or pass a fetch implementation as `fetch`.',
      })
    }

    const transport = new Transport({
      apiKey: options.apiKey,
      baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
      timeoutMs: options.timeoutMs ?? 30_000,
      maxRetries: Math.max(0, options.maxRetries ?? 2),
      // Bound so a fetch that relies on `this` being globalThis still works.
      fetch: options.fetch ?? ((input, init) => globalThis.fetch(input, init)),
    })

    this.emails = new Emails(transport)
    this.campaigns = new Campaigns(transport)
    this.lists = new Lists(transport)
    this.subscribers = new Subscribers(transport)
    this.templates = new Templates(transport)
    this.autoresponders = new Autoresponders(transport)
    this.brands = new Brands(transport)
    this.stats = new Stats(transport)
  }
}
