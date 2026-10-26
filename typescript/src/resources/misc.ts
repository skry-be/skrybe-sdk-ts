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
