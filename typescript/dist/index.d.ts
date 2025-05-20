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
export declare class SkrybeSDK {
    private client;
    private apiKey;
    constructor(config: SkrybeConfig);
    private createFormData;
    sendEmail(options: SendEmailOptions): Promise<string>;
    createCampaign(options: CreateCampaignOptions): Promise<string>;
    getLists(includeHidden?: boolean): Promise<List[]>;
}
