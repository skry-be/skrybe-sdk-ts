import { excerpt, isProseEmpty, ApiError } from '../errors.js'
import { parseJsonObject, parseNumberedRecords } from '../parse.js'
import type { Transport } from '../transport.js'
import { joinIds, type EngagementStats, type Tracking } from './shared.js'

export interface CreateCampaignParams {
  fromName: string
  fromEmail: string
  replyTo: string
  title: string
  subject: string
  htmlText: string
  plainText?: string
  /** Encrypted list ids. Needed, with `segmentIds`, only to send or schedule. */
  listIds?: string[]
  segmentIds?: (string | number)[]
  excludeListIds?: string[]
  excludeSegmentIds?: (string | number)[]
  queryString?: string
  trackOpens?: Tracking
  trackClicks?: Tracking
  /** Send immediately once created. */
  send?: boolean
  /** Schedule instead, e.g. "June 15, 2027 6:05pm". Minutes must be a multiple of 5. */
  scheduleDateTime?: string
  /** e.g. "America/New_York". Falls back to the brand's timezone. */
  scheduleTimezone?: string
}

export interface CreateCampaignResult {
  outcome: 'created' | 'sending' | 'scheduled'
  /**
   * Only for a plain create: the sending and scheduling paths of create.php
   * answer with bare prose and no id.
   */
  campaignId?: string
}

/** As the brand's campaign list labels them. */
export const CAMPAIGN_STATUSES = ['draft', 'scheduled', 'preparing', 'sending', 'sent', 'paused'] as const
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number]

/** One row of `campaigns.list()`. */
export interface Campaign {
  id: number
  title: string
  subject: string
  status: CampaignStatus
  from_name: string
  from_email: string
  reply_to: string
  recipients: number
  to_send: number
  /** Unix seconds. */
  sent_at: number | null
  /** Unix seconds, only while scheduled. */
  scheduled_at: number | null
  timezone: string | null
  /** `ui`, or `api` for campaigns created by `emails.send()`. */
  source: string
}

export interface CampaignDetail extends Campaign {
  preheader: string
  query_string: string
  track_opens: Tracking
  track_clicks: Tracking
  /** Encrypted, like the ids `lists.list()` returns. */
  list_ids: string[]
  exclude_list_ids: string[]
  segment_ids: number[]
  exclude_segment_ids: number[]
  web_version: string
  /** Only with `includeContent`. */
  html_text?: string
  plain_text?: string
}

export interface CampaignStats extends EngagementStats {
  id: number
  status: CampaignStatus
}

export interface ListCampaignsParams {
  /** 1-based. */
  page?: number
  /** At most 100. */
  limit?: number
  status?: CampaignStatus
}

export const MAX_CAMPAIGNS_PAGE = 100

export interface Recipients {
  /** Encrypted list ids. At least one list or segment is required. */
  listIds?: string[]
  segmentIds?: (string | number)[]
  excludeListIds?: string[]
  excludeSegmentIds?: (string | number)[]
  /** Run every check and count the recipients, but send nothing. */
  dryRun?: boolean
}

export interface SendCampaignResult {
  status: 'sending' | 'dry_run'
  campaign_id: number
  /** Unique active subscribers the campaign goes (or would go) to. */
  recipients: number
}

export interface ScheduleCampaignParams extends Recipients {
  /** Anything PHP's strtotime() reads, e.g. "2027-06-15 18:05" or "June 15, 2027 6:05pm". */
  at: string
  /** e.g. "Africa/Lagos". Defaults to the account's timezone. */
  timezone?: string
}

export interface ScheduleCampaignResult {
  status: 'scheduled' | 'dry_run'
  campaign_id: number
  recipients: number
  /** Unix seconds. */
  scheduled_at: number
  timezone: string
}

/** test-send.php refuses more than this many addresses per request. */
export const MAX_TEST_EMAILS = 5

export interface TestSendResult {
  campaign_id: number
  /** One per address, in the order sent. */
  results: { email: string; ok: boolean; error: string | null }[]
}

/** Fields `campaigns.update()` can change. Only those given change. */
export interface UpdateCampaignParams {
  title?: string
  subject?: string
  preheader?: string
  fromName?: string
  fromEmail?: string
  replyTo?: string
  htmlText?: string
  plainText?: string
  queryString?: string
  trackOpens?: Tracking
  trackClicks?: Tracking
}

export const ACTIVITY_TYPES = ['opens', 'clicks', 'bounces', 'complaints', 'unsubscribes'] as const
export type ActivityType = (typeof ACTIVITY_TYPES)[number]

/** One subscriber's part in a campaign. `opens`/`country` only for opens, `clicks`/`links` only for clicks. */
export interface CampaignActivity {
  email: string
  name: string
  /** Encrypted, like the ids `lists.list()` returns. */
  list_id: string
  opens?: number
  /** Where they first opened it, when known. */
  country?: string | null
  clicks?: number
  links?: string[]
}

export interface CampaignActivityPage {
  campaign_id: number
  type: ActivityType
  page: number
  limit: number
  /** Subscribers across all pages. */
  total: number
  activity: CampaignActivity[]
}

export interface CampaignActivityParams {
  type?: ActivityType
  page?: number
  /** At most 1000. */
  limit?: number
}

export const MAX_ACTIVITY_PAGE = 1000

export class Campaigns {
  constructor(private readonly transport: Transport) {}

  /**
   * `api/campaigns/create.php` creates a draft, and optionally sends or
   * schedules it in the same call. To send a draft that already exists, see
   * `send()`.
   */
  async create(params: CreateCampaignParams): Promise<CreateCampaignResult> {
    const text = await this.transport.text({
      path: 'api/campaigns/create.php',
      body: {
        from_name: params.fromName,
        from_email: params.fromEmail,
        reply_to: params.replyTo,
        title: params.title,
        subject: params.subject,
        html_text: params.htmlText,
        plain_text: params.plainText,
        list_ids: joinIds(params.listIds),
        segment_ids: joinIds(params.segmentIds),
        exclude_list_ids: joinIds(params.excludeListIds),
        exclude_segments_ids: joinIds(params.excludeSegmentIds),
        query_string: params.queryString,
        track_opens: params.trackOpens,
        track_clicks: params.trackClicks,
        send_campaign: params.send ? 1 : undefined,
        schedule_date_time: params.scheduleDateTime,
        schedule_timezone: params.scheduleTimezone,
        // Asks for `{"status": ..., "campaign_id": ...}` instead of bare prose.
        json: 1,
      },
    })
    const trimmed = text.trim()

    if (trimmed === 'Campaign scheduled') return { outcome: 'scheduled' }
    if (trimmed === 'Campaign created and now sending') return { outcome: 'sending' }
    if (trimmed === 'Campaign created') return { outcome: 'created' }

    // The json=1 shape, built by hand server-side, so parsed leniently.
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed) as { status?: string; campaign_id?: string }
        if (typeof parsed.status === 'string' && parsed.status.startsWith('Campaign created')) {
          return { outcome: 'created', campaignId: parsed.campaign_id }
        }
      } catch {
        // Reported below with the body intact.
      }
    }

    throw new ApiError('unexpected_response', `Unexpected response from campaigns/create: ${excerpt(trimmed)}`, {
      raw: text,
    })
  }

  /** One page, newest first. An empty page is an empty array, not an error. */
  async list(params: ListCampaignsParams = {}): Promise<Campaign[]> {
    const body = await this.transport.text({
      path: 'api/campaigns/get-campaigns.php',
      body: { page: params.page, limit: params.limit, status: params.status },
      retryable: true,
    })
    if (isProseEmpty(body)) return []
    return parseNumberedRecords<Campaign>(body, 'campaign')
  }

  /** Every page, fetched in order at the largest page size. */
  async listAll(params: Omit<ListCampaignsParams, 'page' | 'limit'> = {}): Promise<Campaign[]> {
    const all: Campaign[] = []
    for (let page = 1; ; page++) {
      const rows = await this.list({ ...params, page, limit: MAX_CAMPAIGNS_PAGE })
      all.push(...rows)
      if (rows.length < MAX_CAMPAIGNS_PAGE) return all
    }
  }

  async get(campaignId: number, opts: { includeContent?: boolean } = {}): Promise<CampaignDetail> {
    const body = await this.transport.text({
      path: 'api/campaigns/get-campaign.php',
      body: { campaign_id: campaignId, include_content: opts.includeContent ? 'yes' : undefined },
      retryable: true,
    })
    return parseJsonObject<CampaignDetail>(body, 'campaign')
  }

  async stats(campaignId: number): Promise<CampaignStats> {
    const body = await this.transport.text({
      path: 'api/campaigns/stats.php',
      body: { campaign_id: campaignId },
      retryable: true,
    })
    return parseJsonObject<CampaignStats>(body, 'campaign stats')
  }

  /**
   * `api/campaigns/send.php` sends an existing draft. It only ever claims a
   * draft, so a repeat after a lost response answers "Campaign has already been
   * sent" rather than sending twice. It is still not retried: that answer
   * would turn a success into a reported failure.
   */
  async send(campaignId: number, recipients: Recipients): Promise<SendCampaignResult> {
    const body = await this.transport.text({
      path: 'api/campaigns/send.php',
      body: { campaign_id: campaignId, ...recipientFields(recipients) },
    })
    return parseJsonObject<SendCampaignResult>(body, 'send result')
  }

  /**
   * Sends the campaign as a test to up to 5 addresses. Each request counts
   * against a per-brand limit shared with the dashboard (20 an hour), so it is
   * never retried.
   */
  async testSend(campaignId: number, emails: string[]): Promise<TestSendResult> {
    const body = await this.transport.text({
      path: 'api/campaigns/test-send.php',
      body: { campaign_id: campaignId, emails: emails.join(',') },
    })
    return parseJsonObject<TestSendResult>(body, 'test send result')
  }

  /**
   * Schedules a draft, or moves a scheduled campaign. The recipients are
   * reserved against the quota now and handed back by `unschedule()`.
   */
  async schedule(campaignId: number, params: ScheduleCampaignParams): Promise<ScheduleCampaignResult> {
    const body = await this.transport.text({
      path: 'api/campaigns/schedule.php',
      body: {
        campaign_id: campaignId,
        ...recipientFields(params),
        schedule_date_time: params.at,
        schedule_timezone: params.timezone,
      },
    })
    return parseJsonObject<ScheduleCampaignResult>(body, 'schedule result')
  }

  /** Back to a draft, with its quota reservation refunded. */
  async unschedule(campaignId: number): Promise<{ status: 'draft'; campaign_id: number }> {
    const body = await this.transport.text({ path: 'api/campaigns/unschedule.php', body: { campaign_id: campaignId } })
    return parseJsonObject<{ status: 'draft'; campaign_id: number }>(body, 'unschedule result')
  }

  /** Edits a draft or scheduled campaign and returns it as `get()` would. */
  async update(campaignId: number, changes: UpdateCampaignParams): Promise<CampaignDetail> {
    const body = await this.transport.text({
      path: 'api/campaigns/update-campaign.php',
      body: {
        campaign_id: campaignId,
        title: changes.title,
        subject: changes.subject,
        preheader: changes.preheader,
        from_name: changes.fromName,
        from_email: changes.fromEmail,
        reply_to: changes.replyTo,
        html_text: changes.htmlText,
        plain_text: changes.plainText,
        query_string: changes.queryString,
        track_opens: changes.trackOpens,
        track_clicks: changes.trackClicks,
      },
    })
    return parseJsonObject<CampaignDetail>(body, 'campaign')
  }

  /** A new draft copied from the campaign, in the same brand. */
  async duplicate(campaignId: number, opts: { title?: string } = {}): Promise<CampaignDetail> {
    const body = await this.transport.text({
      path: 'api/campaigns/duplicate-campaign.php',
      body: { campaign_id: campaignId, title: opts.title },
    })
    return parseJsonObject<CampaignDetail>(body, 'campaign')
  }

  /**
   * Deletes the campaign with its links and attachments; a sent one loses its
   * report. Refused while the campaign is preparing or sending.
   */
  async delete(campaignId: number): Promise<{ campaign_id: number; deleted: true }> {
    const body = await this.transport.text({ path: 'api/campaigns/delete-campaign.php', body: { campaign_id: campaignId } })
    return parseJsonObject<{ campaign_id: number; deleted: true }>(body, 'delete result')
  }

  /**
   * A page of who opened, clicked, bounced, complained or unsubscribed. Opens
   * and clicks are in the order subscribers first did them.
   */
  async activity(campaignId: number, params: CampaignActivityParams = {}): Promise<CampaignActivityPage> {
    const body = await this.transport.text({
      path: 'api/campaigns/get-activity.php',
      body: { campaign_id: campaignId, type: params.type, page: params.page, limit: params.limit },
      retryable: true,
    })
    return parseJsonObject<CampaignActivityPage>(body, 'campaign activity')
  }

  /** Every page of one activity type, at the largest page size. */
  async activityAll(campaignId: number, type: ActivityType): Promise<CampaignActivity[]> {
    const all: CampaignActivity[] = []
    for (let page = 1; ; page++) {
      const r = await this.activity(campaignId, { type, page, limit: MAX_ACTIVITY_PAGE })
      all.push(...r.activity)
      if (r.activity.length === 0 || page * MAX_ACTIVITY_PAGE >= r.total) return all
    }
  }
}

function recipientFields(r: Recipients) {
  return {
    list_ids: joinIds(r.listIds),
    segment_ids: joinIds(r.segmentIds),
    exclude_list_ids: joinIds(r.excludeListIds),
    exclude_segment_ids: joinIds(r.excludeSegmentIds),
    dry_run: r.dryRun ? 1 : undefined,
  }
}
