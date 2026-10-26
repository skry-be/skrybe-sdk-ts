import { ApiError, excerpt, isProseEmpty } from '../errors.js'
import { parseJsonObject, parseNumberedObject } from '../parse.js'
import type { Transport } from '../transport.js'

export interface List {
  /**
   * An encrypted value, not the number in the dashboard URL. Pass it back as
   * given wherever a list id is wanted.
   */
  id: string
  name: string
}

export type OptIn = 'single' | 'double'

export type CustomFieldType = 'text' | 'date'

export interface CustomField {
  /** As used in personalization tags: `[Name,fallback=]`. */
  name: string
  /** As the API stores it. */
  type: 'Text' | 'Date'
}

/** One list from `get()`, `create()`, `update()` or the custom-field methods. */
export interface ListDetail extends List {
  opt_in: OptIn
  /** `active` is who a campaign goes to: confirmed, and not unsubscribed, bounced or complained. */
  subscribers: { active: number; unconfirmed: number; unsubscribed: number; bounced: number; complained: number }
  /** In the order subscribers' values are stored. */
  custom_fields: CustomField[]
}

export class Lists {
  constructor(private readonly transport: Transport) {}

  /** The brand's lists. An empty brand is an empty array, not an error. */
  async list(opts: { includeHidden?: boolean } = {}): Promise<List[]> {
    const body = await this.transport.text({
      path: 'api/lists/get-lists.php',
      body: { include_hidden: opts.includeHidden ? 'yes' : 'no' },
      retryable: true,
    })
    if (isProseEmpty(body)) return []
    return parseNumberedObject(body, 'list')
  }

  async get(listId: string): Promise<ListDetail> {
    const body = await this.transport.text({ path: 'api/lists/get-list.php', body: { list_id: listId }, retryable: true })
    return parseJsonObject<ListDetail>(body, 'list')
  }

  /** Not retried: a repeat after a lost response would create a second list. */
  async create(params: { name: string; optIn?: OptIn }): Promise<ListDetail> {
    const body = await this.transport.text({
      path: 'api/lists/create.php',
      body: { name: params.name, opt_in: params.optIn },
    })
    return parseJsonObject<ListDetail>(body, 'list')
  }

  async update(listId: string, changes: { name?: string; optIn?: OptIn }): Promise<ListDetail> {
    const body = await this.transport.text({
      path: 'api/lists/update-list.php',
      body: { list_id: listId, name: changes.name, opt_in: changes.optIn },
    })
    return parseJsonObject<ListDetail>(body, 'list')
  }

  /**
   * Deletes the list with its subscribers, segments, autoresponders and rules.
   * Refused while a scheduled or sending campaign is going to it.
   */
  async delete(listId: string): Promise<{ id: string; deleted: true }> {
    const body = await this.transport.text({ path: 'api/lists/delete.php', body: { list_id: listId } })
    return parseJsonObject<{ id: string; deleted: true }>(body, 'delete result')
  }

  /**
   * Subscribers a campaign to this list would reach.
   *
   * Anything but a bare integer is a failure and is thrown, never reported as
   * 0: "this list is empty" is the one wrong answer a caller cannot detect.
   */
  async activeSubscriberCount(listId: string): Promise<number> {
    const body = await this.transport.text({
      path: 'api/subscribers/active-subscriber-count.php',
      body: { list_id: listId },
      retryable: true,
    })
    const trimmed = body.trim()
    if (!/^\d+$/.test(trimmed)) {
      throw new ApiError('malformed_response', `Expected a subscriber count for list ${listId}, got: ${excerpt(trimmed)}`, {
        raw: body,
      })
    }
    return Number.parseInt(trimmed, 10)
  }

  /** Adds a field; every subscriber gets an empty value for it. Returns the list with its fields. */
  async addCustomField(listId: string, params: { name: string; type?: CustomFieldType }): Promise<ListDetail> {
    const body = await this.transport.text({
      path: 'api/lists/add-custom-field.php',
      body: { list_id: listId, name: params.name, type: params.type },
    })
    return parseJsonObject<ListDetail>(body, 'list')
  }

  /**
   * Renames a field, keeping subscribers' values. The autoresponders and
   * segment conditions that use it follow; tags already in campaigns keep the
   * old name.
   */
  async renameCustomField(listId: string, name: string, newName: string): Promise<ListDetail> {
    const body = await this.transport.text({
      path: 'api/lists/rename-custom-field.php',
      body: { list_id: listId, name, new_name: newName },
    })
    return parseJsonObject<ListDetail>(body, 'list')
  }

  /** Deletes a field and every subscriber's value for it. Refused while an autoresponder or segment uses it. */
  async deleteCustomField(listId: string, name: string): Promise<ListDetail> {
    const body = await this.transport.text({
      path: 'api/lists/delete-custom-field.php',
      body: { list_id: listId, name },
    })
    return parseJsonObject<ListDetail>(body, 'list')
  }
}
