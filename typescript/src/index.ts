import axios, { AxiosInstance } from "axios";

export interface SkrybeConfig {
  apiKey: string;
  baseURL?: string;
}

export interface SendEmailOptions {
  fromName: string;
  fromEmail: string;
  replyTo: string;
  subject: string;
  htmlText: string;
  plainText?: string;
  to?: string[];
  recipientVariables?: Record<string, Record<string, any>>;
  listIds?: string[];
  queryString?: string;
  trackOpens?: 0 | 1 | 2;
  trackClicks?: 0 | 1 | 2;
  scheduleDateTime?: string;
  scheduleTimezone?: string;
}

export interface CreateCampaignOptions {
  fromName: string;
  fromEmail: string;
  replyTo: string;
  title: string;
  subject: string;
  htmlText: string;
  plainText?: string;
  listIds?: string;
  segmentIds?: string;
  excludeListIds?: string;
  excludeSegmentIds?: string;
  queryString?: string;
  trackOpens?: 0 | 1 | 2;
  trackClicks?: 0 | 1 | 2;
  sendCampaign?: 0 | 1;
  scheduleDateTime?: string;
  scheduleTimezone?: string;
}

export interface List {
  id: string;
  name: string;
}

export class SkrybeSDK {
  private client: AxiosInstance;
  private apiKey: string;

  constructor(config: SkrybeConfig) {
    this.apiKey = config.apiKey;
    this.client = axios.create({
      baseURL: config.baseURL || "https://dashboard.skry.be",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });
  }

  private createFormData(data: Record<string, any>): URLSearchParams {
    const formData = new URLSearchParams();
    formData.append("api_key", this.apiKey);

    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined) {
        if (Array.isArray(value)) {
          formData.append(key, JSON.stringify(value));
        } else if (typeof value === "object") {
          formData.append(key, JSON.stringify(value));
        } else {
          formData.append(key, String(value));
        }
      }
    });

    return formData;
  }

  async sendEmail(options: SendEmailOptions): Promise<string> {
    const formData = this.createFormData({
      from_name: options.fromName,
      from_email: options.fromEmail,
      reply_to: options.replyTo,
      subject: options.subject,
      html_text: options.htmlText,
      plain_text: options.plainText,
      to: options.to,
      "recipient-variables": options.recipientVariables,
      list_ids: options.listIds?.join(","),
      query_string: options.queryString,
      track_opens: options.trackOpens,
      track_clicks: options.trackClicks,
      schedule_date_time: options.scheduleDateTime,
      schedule_timezone: options.scheduleTimezone,
    });

    console.log(formData);

    const response = await this.client.post("/api/emails/send.php", formData);
    return response.data;
  }

  async createCampaign(options: CreateCampaignOptions): Promise<string> {
    const formData = this.createFormData({
      from_name: options.fromName,
      from_email: options.fromEmail,
      reply_to: options.replyTo,
      title: options.title,
      subject: options.subject,
      html_text: options.htmlText,
      plain_text: options.plainText,
      list_ids: options.listIds,
      segment_ids: options.segmentIds,
      exclude_list_ids: options.excludeListIds,
      exclude_segments_ids: options.excludeSegmentIds,
      query_string: options.queryString,
      track_opens: options.trackOpens,
      track_clicks: options.trackClicks,
      send_campaign: options.sendCampaign,
      schedule_date_time: options.scheduleDateTime,
      schedule_timezone: options.scheduleTimezone,
    });

    const response = await this.client.post(
      "/api/campaigns/create.php",
      formData
    );
    return response.data;
  }

  async getLists(includeHidden: boolean = false): Promise<List[]> {
    const formData = this.createFormData({
      include_hidden: includeHidden ? "yes" : "no",
    });

    const response = await this.client.post(
      "/api/lists/get-lists.php",
      formData
    );
    return response.data;
  }
}
