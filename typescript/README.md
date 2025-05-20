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