"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SkrybeSDK = void 0;
const axios_1 = __importDefault(require("axios"));
class SkrybeSDK {
    constructor(config) {
        this.apiKey = config.apiKey;
        this.client = axios_1.default.create({
            baseURL: config.baseURL || "https://dashboard.skry.be",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
        });
    }
    createFormData(data) {
        const formData = new URLSearchParams();
        formData.append("api_key", this.apiKey);
        Object.entries(data).forEach(([key, value]) => {
            if (value !== undefined) {
                if (Array.isArray(value)) {
                    formData.append(key, JSON.stringify(value));
                }
                else if (typeof value === "object") {
                    formData.append(key, JSON.stringify(value));
                }
                else {
                    formData.append(key, String(value));
                }
            }
        });
        return formData;
    }
    async sendEmail(options) {
        var _a;
        const formData = this.createFormData({
            from_name: options.fromName,
            from_email: options.fromEmail,
            reply_to: options.replyTo,
            subject: options.subject,
            html_text: options.htmlText,
            plain_text: options.plainText,
            to: options.to,
            "recipient-variables": options.recipientVariables,
            list_ids: (_a = options.listIds) === null || _a === void 0 ? void 0 : _a.join(","),
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
    async createCampaign(options) {
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
        const response = await this.client.post("/api/campaigns/create.php", formData);
        return response.data;
    }
    async getLists(includeHidden = false) {
        const formData = this.createFormData({
            include_hidden: includeHidden ? "yes" : "no",
        });
        const response = await this.client.post("/api/lists/get-lists.php", formData);
        return response.data;
    }
}
exports.SkrybeSDK = SkrybeSDK;
