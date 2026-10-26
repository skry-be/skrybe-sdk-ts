export { Skrybe, DEFAULT_BASE_URL, type SkrybeOptions } from './client.js'
export {
  SkrybeError,
  AuthenticationError,
  InvalidRequestError,
  RateLimitError,
  ConnectionError,
  ApiError,
  type SkrybeErrorType,
} from './errors.js'
export type { FetchLike } from './transport.js'
export { VERSION } from './version.js'

export type { Tracking, EngagementStats } from './resources/shared.js'
export {
  MAX_RECIPIENTS,
  type SendEmailParams,
  type SendEmailResult,
  type SendTransactionalParams,
  type SendTransactionalResult,
} from './resources/emails.js'
export {
  CAMPAIGN_STATUSES,
  ACTIVITY_TYPES,
  MAX_CAMPAIGNS_PAGE,
  MAX_ACTIVITY_PAGE,
  MAX_TEST_EMAILS,
  type Campaign,
  type CampaignDetail,
  type CampaignStatus,
  type CampaignStats,
  type CampaignActivity,
  type CampaignActivityPage,
  type CampaignActivityParams,
  type ActivityType,
  type CreateCampaignParams,
  type CreateCampaignResult,
  type ListCampaignsParams,
  type Recipients,
  type SendCampaignResult,
  type ScheduleCampaignParams,
  type ScheduleCampaignResult,
  type TestSendResult,
  type UpdateCampaignParams,
} from './resources/campaigns.js'
export type { List, ListDetail, OptIn, CustomField, CustomFieldType } from './resources/lists.js'
export {
  SUBSCRIBER_STATUSES,
  MAX_SUBSCRIBERS_PAGE,
  type Subscriber,
  type SubscriberRef,
  type SubscriberStatus,
  type SubscribersPage,
  type SubscribeParams,
  type SubscribeOutcome,
  type ListSubscribersParams,
} from './resources/subscribers.js'
export type { Template, TemplateEditor, TemplateFields } from './resources/templates.js'
export type {
  Autoresponder,
  AutoresponderType,
  AutoresponderEmail,
  AutoresponderWithEmails,
  AutoresponderEmailStats,
  CreateAutoresponderParams,
  CreateAutoresponderEmailParams,
} from './resources/autoresponders.js'
export {
  SMS_TYPES,
  type Brand,
  type SmsType,
  type SendSmsParams,
  type SendSmsResult,
  type SmsMessage,
} from './resources/misc.js'
