/** 0 off, 1 on, 2 anonymous. */
export type Tracking = 0 | 1 | 2

/** Opens, clicks, bounces and the rest, as campaign and autoresponder stats report them. */
export interface EngagementStats {
  recipients: number
  /** `rate` is a percentage of delivered (recipients less hard bounces). */
  opens: { total: number; unique: number; rate: number }
  /** `rate` is a percentage of recipients. */
  clicks: { total: number; unique: number; rate: number }
  bounces: { hard: number; soft: number }
  complaints: number
  unsubscribes: number
  links: { url: string; clicks: number; unique_clicks: number }[]
}

/** Comma-joined, or undefined for an empty or missing list so the field is not sent. */
export function joinIds(ids?: readonly (string | number)[]): string | undefined {
  return ids && ids.length > 0 ? ids.join(',') : undefined
}
