import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { ApiError, InvalidRequestError, Skrybe } from '../src/index.js'

import { phpNumberedPayload, startStub, type Reply } from './helpers.js'

const KEY = 'test-api-key'

async function setup(replies: Reply[]) {
  const stub = await startStub(replies)
  return { stub, skrybe: new Skrybe({ apiKey: KEY, baseUrl: stub.url }) }
}

/** The fields of the only request, less the api key every request carries. */
function sent(stub: { received: { fields: Record<string, string> }[] }) {
  assert.equal(stub.received.length, 1)
  const { api_key, ...rest } = stub.received[0]!.fields
  assert.equal(api_key, KEY)
  return rest
}

describe('emails', () => {
  it('send posts recipients as JSON strings inside a form body', async () => {
    const { stub, skrybe } = await setup([{ body: '{"ok":true,"message":"Queued","data":{"campaign_id":"c1"}}' }])

    const result = await skrybe.emails.send({
      fromName: 'Ada',
      fromEmail: 'ada@example.com',
      replyTo: 'ada@example.com',
      subject: 'Hi',
      htmlText: '<p>Hi [recipient.first]</p>',
      to: ['a@example.com'],
      recipientVariables: { 'a@example.com': { first: 'A' } },
      trackOpens: 1,
    })

    assert.deepEqual(result, { message: 'Queued', campaignId: 'c1' })
    assert.equal(stub.received[0]?.path, '/api/emails/send.php')
    assert.deepEqual(sent(stub), {
      from_name: 'Ada',
      from_email: 'ada@example.com',
      reply_to: 'ada@example.com',
      subject: 'Hi',
      html_text: '<p>Hi [recipient.first]</p>',
      to: '["a@example.com"]',
      'recipient-variables': '{"a@example.com":{"first":"A"}}',
      track_opens: '1',
    })
  })

  it('send refuses before any request when there is nobody to send to, or too many', async () => {
    const { stub, skrybe } = await setup([{ body: '{}' }])
    const base = { fromName: 'a', fromEmail: 'b', replyTo: 'c', subject: 'd', htmlText: 'e' }

    await assert.rejects(skrybe.emails.send(base), InvalidRequestError)
    const many = Array.from({ length: 251 }, (_, i) => `u${i}@example.com`)
    await assert.rejects(skrybe.emails.send({ ...base, to: many }), InvalidRequestError)
    assert.equal(stub.received.length, 0)
  })

  it('sendTransactional posts raw JSON, the one endpoint that reads php://input', async () => {
    const { stub, skrybe } = await setup([{ body: '{"status":"success","message":"Sent","message_id":"m1"}' }])

    const result = await skrybe.emails.sendTransactional({ toEmail: 'a@example.com', subject: 'OTP', plainBody: '1234' })

    assert.deepEqual(result, { message: 'Sent', messageId: 'm1' })
    assert.equal(stub.received[0]?.contentType, 'application/json')
    assert.deepEqual(JSON.parse(stub.received[0]!.rawBody), {
      to_email: 'a@example.com',
      subject: 'OTP',
      plain_body: '1234',
      api_key: KEY,
    })
  })

  it('sendTransactional needs a body', async () => {
    const { skrybe } = await setup([{ body: '{}' }])
    await assert.rejects(skrybe.emails.sendTransactional({ toEmail: 'a@b.c', subject: 's' }), InvalidRequestError)
  })
})

describe('campaigns', () => {
  const draft = { fromName: 'a', fromEmail: 'b@c.d', replyTo: 'b@c.d', title: 't', subject: 's', htmlText: 'h' }

  it('create returns the new id from the json=1 answer', async () => {
    const { stub, skrybe } = await setup([{ body: '{"status":"Campaign created","campaign_id":"42"}' }])

    assert.deepEqual(await skrybe.campaigns.create({ ...draft, listIds: ['L1', 'L2'] }), {
      outcome: 'created',
      campaignId: '42',
    })
    const fields = sent(stub)
    assert.equal(fields.json, '1')
    assert.equal(fields.list_ids, 'L1,L2')
    assert.equal(fields.send_campaign, undefined)
  })

  it('create reports sending and scheduled outcomes', async () => {
    const sending = await setup([{ body: 'Campaign created and now sending' }])
    assert.deepEqual(await sending.skrybe.campaigns.create({ ...draft, listIds: ['L'], send: true }), {
      outcome: 'sending',
    })
    assert.equal(sent(sending.stub).send_campaign, '1')

    const scheduled = await setup([{ body: 'Campaign scheduled' }])
    assert.deepEqual(await scheduled.skrybe.campaigns.create({ ...draft, scheduleDateTime: 'June 1, 2027 6:05pm' }), {
      outcome: 'scheduled',
    })
  })

  it('create does not mistake an unknown body for success', async () => {
    const { skrybe } = await setup([{ body: '<html>Bad gateway</html>' }])
    await assert.rejects(skrybe.campaigns.create(draft), (err: unknown) => {
      assert.ok(err instanceof ApiError)
      assert.equal(err.code, 'unexpected_response')
      return true
    })
  })

  it('list reads the numbered records, and "No campaigns found" as empty', async () => {
    const row = { id: 3, title: 'T', status: 'sent' }
    const { stub, skrybe } = await setup([{ body: JSON.stringify({ campaign1: row }) }])
    assert.deepEqual(await skrybe.campaigns.list({ status: 'sent', limit: 10 }), [row])
    assert.deepEqual(sent(stub), { status: 'sent', limit: '10' })

    const empty = await setup([{ body: 'No campaigns found' }])
    assert.deepEqual(await empty.skrybe.campaigns.list(), [])
  })

  it('listAll walks pages until a short one', async () => {
    const page = (n: number) =>
      JSON.stringify(Object.fromEntries(Array.from({ length: n }, (_, i) => [`campaign${i + 1}`, { id: i }])))
    const { stub, skrybe } = await setup([{ body: page(100) }, { body: page(3) }])

    assert.equal((await skrybe.campaigns.listAll()).length, 103)
    assert.deepEqual(
      stub.received.map((r) => r.fields.page),
      ['1', '2'],
    )
  })

  it('send and schedule pass recipients, and dry_run only when asked', async () => {
    const s = await setup([{ body: '{"status":"sending","campaign_id":5,"recipients":10}' }])
    await s.skrybe.campaigns.send(5, { listIds: ['A'], segmentIds: [7], excludeListIds: ['B'] })
    assert.deepEqual(sent(s.stub), { campaign_id: '5', list_ids: 'A', segment_ids: '7', exclude_list_ids: 'B' })

    const sc = await setup([{ body: '{"status":"dry_run","campaign_id":5,"recipients":10,"scheduled_at":1,"timezone":"Africa/Lagos"}' }])
    await sc.skrybe.campaigns.schedule(5, { listIds: ['A'], at: '2027-06-15 18:05', timezone: 'Africa/Lagos', dryRun: true })
    assert.deepEqual(sent(sc.stub), {
      campaign_id: '5',
      list_ids: 'A',
      schedule_date_time: '2027-06-15 18:05',
      schedule_timezone: 'Africa/Lagos',
      dry_run: '1',
    })
  })

  it('each campaign endpoint posts to its own path', async () => {
    const calls: [string, (s: Skrybe) => Promise<unknown>][] = [
      ['/api/campaigns/get-campaign.php', (s) => s.campaigns.get(1, { includeContent: true })],
      ['/api/campaigns/stats.php', (s) => s.campaigns.stats(1)],
      ['/api/campaigns/test-send.php', (s) => s.campaigns.testSend(1, ['a@b.c'])],
      ['/api/campaigns/unschedule.php', (s) => s.campaigns.unschedule(1)],
      ['/api/campaigns/update-campaign.php', (s) => s.campaigns.update(1, { subject: 'x' })],
      ['/api/campaigns/duplicate-campaign.php', (s) => s.campaigns.duplicate(1)],
      ['/api/campaigns/delete-campaign.php', (s) => s.campaigns.delete(1)],
      ['/api/campaigns/get-activity.php', (s) => s.campaigns.activity(1, { type: 'clicks' })],
    ]
    for (const [path, call] of calls) {
      const { stub, skrybe } = await setup([{ body: '{"campaign_id":1}' }])
      await call(skrybe)
      assert.equal(stub.received[0]?.path, path)
      assert.equal(stub.received[0]?.fields.campaign_id, '1')
    }
  })
})

describe('lists', () => {
  it('list survives an unescaped quote in a name', async () => {
    const { skrybe } = await setup([{ body: phpNumberedPayload('list', [{ id: 'A1', name: 'Q4 "Big" Push' }]) }])
    assert.deepEqual(await skrybe.lists.list(), [{ id: 'A1', name: 'Q4 "Big" Push' }])
  })

  it('list returns [] for a brand without lists', async () => {
    const { skrybe } = await setup([{ body: 'No lists found' }])
    assert.deepEqual(await skrybe.lists.list(), [])
  })

  it('activeSubscriberCount never reports a failure as zero', async () => {
    const { skrybe } = await setup([{ body: '<b>Warning</b>' }])
    await assert.rejects(skrybe.lists.activeSubscriberCount('A1'), ApiError)
  })

  it('manages custom fields', async () => {
    const r = await setup([{ body: '{"id":"A1"}' }])
    await r.skrybe.lists.renameCustomField('A1', 'Birthday', 'DOB')
    assert.equal(r.stub.received[0]?.path, '/api/lists/rename-custom-field.php')
    assert.deepEqual(sent(r.stub), { list_id: 'A1', name: 'Birthday', new_name: 'DOB' })

    const a = await setup([{ body: '{"id":"A1"}' }])
    await a.skrybe.lists.addCustomField('A1', { name: 'DOB', type: 'date' })
    assert.deepEqual(sent(a.stub), { list_id: 'A1', name: 'DOB', type: 'date' })
  })
})

describe('subscribers', () => {
  it('subscribe posts to the root endpoint in plain-text mode, custom fields without spaces', async () => {
    const { stub, skrybe } = await setup([{ body: '1' }])

    const outcome = await skrybe.subscribers.subscribe({
      listId: 'A1',
      email: 'a@example.com',
      name: 'Ada',
      gdpr: true,
      fields: { 'Favourite colour': 'blue', email: 'forged@example.com' },
    })

    assert.equal(outcome, 'subscribed')
    assert.equal(stub.received[0]?.path, '/subscribe')
    assert.deepEqual(sent(stub), {
      Favouritecolour: 'blue',
      email: 'a@example.com',
      list: 'A1',
      boolean: 'true',
      name: 'Ada',
      gdpr: 'true',
    })
  })

  it('subscribe reports an existing address rather than throwing', async () => {
    const { skrybe } = await setup([{ body: 'Already subscribed.' }])
    assert.equal(await skrybe.subscribers.subscribe({ listId: 'A1', email: 'a@b.c' }), 'already_subscribed')
  })

  it('unsubscribe, delete and status use their own field names', async () => {
    const u = await setup([{ body: 'true' }])
    await u.skrybe.subscribers.unsubscribe({ listId: 'A1', email: 'a@b.c' })
    assert.equal(u.stub.received[0]?.path, '/unsubscribe')
    assert.deepEqual(sent(u.stub), { email: 'a@b.c', list: 'A1', boolean: 'true' })

    const d = await setup([{ body: 'true' }])
    await d.skrybe.subscribers.delete({ listId: 'A1', email: 'a@b.c' })
    assert.deepEqual(sent(d.stub), { list_id: 'A1', email: 'a@b.c' })

    const s = await setup([{ body: 'Soft bounced\n' }])
    assert.equal(await s.skrybe.subscribers.status({ listId: 'A1', email: 'a@b.c' }), 'Soft bounced')
  })

  it('does not report an unrecognised body as success', async () => {
    const { skrybe } = await setup([{ body: 'Something new' }])
    await assert.rejects(skrybe.subscribers.unsubscribe({ listId: 'A1', email: 'a@b.c' }), ApiError)
  })

  it('listAll walks pages of 1000', async () => {
    const page = (n: number) => JSON.stringify({ subscribers: Array.from({ length: n }, () => ({})), total: 1001 })
    const { stub, skrybe } = await setup([{ body: page(1000) }, { body: page(1) }])
    assert.equal((await skrybe.subscribers.listAll('A1', { status: 'active' })).length, 1001)
    assert.deepEqual(stub.received[1]?.fields, { list_id: 'A1', status: 'active', page: '2', limit: '1000', api_key: KEY })
  })
})

describe('templates', () => {
  it('create maps camelCase onto the API fields', async () => {
    const { stub, skrybe } = await setup([{ body: '{"id":9,"name":"Welcome"}' }])
    assert.deepEqual(await skrybe.templates.create({ name: 'Welcome', htmlText: '<p/>', editor: 'html' }), {
      id: 9,
      name: 'Welcome',
    })
    assert.deepEqual(sent(stub), { name: 'Welcome', html_text: '<p/>', editor: 'html' })
  })

  it('list unwraps the templates array', async () => {
    const { skrybe } = await setup([{ body: '{"templates":[{"id":1}]}' }])
    assert.deepEqual(await skrybe.templates.list(), [{ id: 1 }])
  })
})

describe('autoresponders', () => {
  it('create posts the type and list', async () => {
    const { stub, skrybe } = await setup([{ body: '{"id":4,"name":"Birthdays","type":"annually"}' }])
    await skrybe.autoresponders.create({ name: 'Birthdays', type: 'annually', listId: 'A1', customField: 'Birthday' })
    assert.equal(stub.received[0]?.path, '/api/autoresponders/create-autoresponder.php')
    assert.deepEqual(sent(stub), { name: 'Birthdays', type: 'annually', list_id: 'A1', custom_field: 'Birthday' })
  })

  it('createEmail sends enabled only when asked', async () => {
    const { stub, skrybe } = await setup([{ body: '{"id":8,"autoresponder_id":4,"when":"+3 days"}' }])
    await skrybe.autoresponders.createEmail(4, { subject: 'Day 3', htmlText: '<p/>', when: '+3 days' })
    assert.equal(stub.received[0]?.path, '/api/autoresponders/create-autoresponder-email.php')
    assert.deepEqual(sent(stub), { autoresponder_id: '4', subject: 'Day 3', html_text: '<p/>', when: '+3 days' })
  })

  it('surfaces the server’s when validation as an invalid request', async () => {
    const { skrybe } = await setup([{ body: 'when must be immediately, or a delay such as +3 days' }])
    await assert.rejects(
      skrybe.autoresponders.createEmail(4, { subject: 's', htmlText: 'h', when: 'soon' }),
      (err: unknown) => err instanceof InvalidRequestError && err.code === 'invalid_when',
    )
  })

  it('list unwraps the autoresponders array', async () => {
    const { stub, skrybe } = await setup([{ body: '{"autoresponders":[{"id":1}]}' }])
    assert.deepEqual(await skrybe.autoresponders.list({ listId: 'A1' }), [{ id: 1 }])
    assert.deepEqual(sent(stub), { list_id: 'A1' })
  })
})

describe('brands, sms and stats', () => {
  it('brands.list reads the numbered payload', async () => {
    const { skrybe } = await setup([{ body: phpNumberedPayload('brand', [{ id: '86', name: 'Cafe One' }]) }])
    assert.deepEqual(await skrybe.brands.list(), [{ id: '86', name: 'Cafe One' }])
  })

  it('sms.send posts to, message and type', async () => {
    const { stub, skrybe } = await setup([{ body: '{"id":1,"to":"+2348031234567","status":"sent","segments":1}' }])
    await skrybe.sms.send({ to: '0803 123 4567', message: 'Your code is 1234', type: 'transactional' })
    assert.deepEqual(sent(stub), { to: '0803 123 4567', message: 'Your code is 1234', type: 'transactional' })
  })

  it('stats.totalEmailsSent is a GET without the api key', async () => {
    const { stub, skrybe } = await setup([{ body: '{"total_emails_sent":123}' }])
    assert.equal(await skrybe.stats.totalEmailsSent(), 123)
    assert.equal(stub.received[0]?.method, 'GET')
    assert.deepEqual(stub.received[0]?.fields, {})
  })
})
