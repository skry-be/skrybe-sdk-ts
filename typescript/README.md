# Skrybe TypeScript/JavaScript SDK

Official TypeScript/JavaScript SDK for the Skrybe API.

## Installation

```bash
npm install @skrybe/sdk
```

## Usage

### Initialize the SDK

```typescript
import { SkrybeSDK } from '@skrybe/sdk';

const skrybe = new SkrybeSDK({
  apiKey: 'your-api-key'
});
```

### Send an Email

```typescript
const response = await skrybe.sendEmail({
  fromName: 'John Doe',
  fromEmail: 'john@example.com',
  replyTo: 'support@example.com',
  subject: 'Welcome!',
  htmlText: '<html><body>Hello [recipient.first]!</body></html>',
  to: ['user@example.com'],
  recipientVariables: {
    'user@example.com': {
      first: 'John'
    }
  },
  trackOpens: 1,
  trackClicks: 1
});
```

### Create a Campaign

```typescript
const response = await skrybe.createCampaign({
  fromName: 'John Doe',
  fromEmail: 'john@example.com',
  replyTo: 'support@example.com',
  title: 'Monthly Newsletter',
  subject: 'Your Monthly Update',
  htmlText: '<html><body>Newsletter content here</body></html>',
  listIds: 'list-id-1,list-id-2',
  trackOpens: 1,
  trackClicks: 1,
  sendCampaign: 1
});
```

### Get Lists

```typescript
const lists = await skrybe.getLists();
// To include hidden lists
const allLists = await skrybe.getLists(true);
```

### Send Transactional Email

Send a one-off transactional email (OTP, password reset, alerts, etc.) that delivers immediately without queuing.

```typescript
const response = await skrybe.sendTransactional({
  toEmail: 'user@example.com',
  subject: 'Your one-time passcode',
  htmlBody: '<p>Your code is <strong>384092</strong>. It expires in 5 minutes.</p>',
  plainBody: 'Your code is 384092. It expires in 5 minutes.',
  fromName: 'Skrybe Security',      // optional, uses brand default
  fromEmail: 'no-reply@yourdomain.com', // optional, uses brand default
  replyTo: 'support@yourdomain.com'     // optional, uses brand default
});

if (response.status === 'success') {
  console.log('Email sent!');
} else {
  console.error('Failed:', response.message, response.error_info);
}
```

## API Reference

### SkrybeSDK Configuration

```typescript
interface SkrybeConfig {
  apiKey: string;
  baseURL?: string; // Defaults to https://dashboard.skry.be
}
```

### SendEmailOptions

```typescript
interface SendEmailOptions {
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
```

### CreateCampaignOptions

```typescript
interface CreateCampaignOptions {
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
```

### SendTransactionalOptions

```typescript
interface SendTransactionalOptions {
  toEmail: string;       // recipient email address (single)
  subject: string;
  htmlBody?: string;     // required unless plainBody is provided
  plainBody?: string;    // required if htmlBody is omitted
  fromName?: string;     // optional, uses brand default
  fromEmail?: string;    // optional, uses brand default (must be allowed domain)
  replyTo?: string;      // optional, uses brand default
}
```

### SendTransactionalResponse

```typescript
interface SendTransactionalResponse {
  status: "success" | "error";
  message: string;
  error_info?: string;   // additional error details on failure
  code?: number;         // HTTP status code on failure
}
```

## Error Handling

The SDK throws errors for invalid API keys, missing required parameters, and other API errors. Make sure to wrap your API calls in try-catch blocks:

```typescript
try {
  const response = await skrybe.sendEmail({
    // ... options
  });
} catch (error) {
  console.error('Error sending email:', error.message);
}
```

## License

MIT 