import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

import {
  ApiError,
  AuthenticationError,
  ConnectionError,
  InvalidRequestError,
  RateLimitError,
  Skrybe,
  SkrybeError,
  VERSION,
} from '../src/index.js'

import { startStub } from './helpers.js'

const KEY = 'test-api-key'

describe('Skrybe constructor', () => {
  it('requires an api key', () => {
    assert.throws(() => new Skrybe({ apiKey: '' }), InvalidRequestError)
  })

  it('defaults to the production API', async () => {
    const seen: string[] = []
    const skrybe = new Skrybe({
      apiKey: KEY,
      fetch: async (url) => {
        seen.push(url)
        return new Response('4')
      },
    })
    await skrybe.lists.activeSubscriberCount('abc')
    assert.deepEqual(seen, ['https://dashboard.skry.be/api/subscribers/active-subscriber-count.php'])
  })
})

describe('transport', () => {
  it('posts a form body with the api key and a User-Agent', async () => {
    const stub = await startStub([{ body: '4211' }])
    const seenHeaders: Record<string, string>[] = []
    const skrybe = new Skrybe({
      apiKey: KEY,
      baseUrl: `${stub.url}///`,
      fetch: (url, init) => {
        seenHeaders.push(init.headers as Record<string, string>)
        return fetch(url, init)
      },
    })

    assert.equal(await skrybe.lists.activeSubscriberCount('AbC892763xy'), 4211)
    assert.deepEqual(stub.received, [
      {
        method: 'POST',
        path: '/api/subscribers/active-subscriber-count.php',
        contentType: 'application/x-www-form-urlencoded',
        fields: { list_id: 'AbC892763xy', api_key: KEY },
        rawBody: 'list_id=AbC892763xy&api_key=test-api-key',
      },
    ])
    assert.equal(seenHeaders[0]?.['User-Agent'], `skrybe-sdk-ts/${VERSION}`)
  })

  it('turns a prose failure carried by HTTP 200 into a typed error', async () => {
    const stub = await startStub([{ body: 'Invalid API key' }])
    const skrybe = new Skrybe({ apiKey: 'wrong', baseUrl: stub.url })

    await assert.rejects(skrybe.lists.list(), (err: unknown) => {
      assert.ok(err instanceof AuthenticationError)
      assert.ok(err instanceof SkrybeError)
      assert.equal(err.type, 'authentication')
      assert.equal(err.code, 'invalid_api_key')
      assert.equal(err.status, 200)
      assert.ok(err.hint)
      return true
    })
  })

  it('classifies prose by kind', async () => {
    const cases: [string, new (...a: never[]) => SkrybeError, string][] = [
      ['List does not exist', ApiError, 'list_not_found'],
      ['List ID not passed', InvalidRequestError, 'list_id_invalid'],
      ['Quota exceeded. Please upgrade your plan.', RateLimitError, 'quota_exceeded'],
      ['Test send rate limit reached, try later', RateLimitError, 'rate_limited'],
      ['Unable to insert campaign', ApiError, 'operation_failed'],
      ['List already has a drip autoresponder', ApiError, 'drip_exists'],
    ]
    for (const [body, kind, code] of cases) {
      const stub = await startStub([{ body }])
      const skrybe = new Skrybe({ apiKey: KEY, baseUrl: stub.url })
      await assert.rejects(skrybe.lists.get('x'), (err: unknown) => {
        assert.ok(err instanceof kind, `${body} -> ${(err as Error).name}`)
        assert.equal((err as SkrybeError).code, code)
        return true
      })
    }
  })

  it('reads the error out of a JSON endpoint’s envelope and status', async () => {
    const stub = await startStub([{ status: 400, body: '{"ok":false,"error":"Invalid from_email"}' }])
    const skrybe = new Skrybe({ apiKey: KEY, baseUrl: stub.url })

    await assert.rejects(
      skrybe.emails.send({ fromName: 'a', fromEmail: 'b', replyTo: 'c', subject: 'd', htmlText: 'e', to: ['x@y.z'] }),
      (err: unknown) => {
        assert.ok(err instanceof InvalidRequestError)
        assert.equal(err.message, 'Invalid from_email')
        assert.equal(err.status, 400)
        return true
      },
    )
  })

  it('retries a read on 503, honouring Retry-After', async () => {
    const stub = await startStub([
      { status: 503, body: '', headers: { 'Retry-After': '0' } },
      { body: '7' },
    ])
    const skrybe = new Skrybe({ apiKey: KEY, baseUrl: stub.url })

    assert.equal(await skrybe.lists.activeSubscriberCount('x'), 7)
    assert.equal(stub.received.length, 2)
  })

  it('never retries a write', async () => {
    const stub = await startStub([{ status: 503, body: '', headers: { 'Retry-After': '0' } }])
    const skrybe = new Skrybe({ apiKey: KEY, baseUrl: stub.url })

    await assert.rejects(skrybe.campaigns.send(1, { listIds: ['a'] }), ApiError)
    assert.equal(stub.received.length, 1)
  })

  it('respects maxRetries: 0', async () => {
    const stub = await startStub([{ status: 503, body: '', headers: { 'Retry-After': '0' } }])
    const skrybe = new Skrybe({ apiKey: KEY, baseUrl: stub.url, maxRetries: 0 })

    await assert.rejects(skrybe.lists.activeSubscriberCount('x'))
    assert.equal(stub.received.length, 1)
  })

  it('times out as a ConnectionError', async () => {
    const stub = await startStub([{ body: '1', delayMs: 500 }])
    const skrybe = new Skrybe({ apiKey: KEY, baseUrl: stub.url, timeoutMs: 50 })

    await assert.rejects(skrybe.templates.delete(1), (err: unknown) => {
      assert.ok(err instanceof ConnectionError)
      assert.equal(err.code, 'timeout')
      return true
    })
  })

  it('reports an unreachable host as a ConnectionError', async () => {
    const skrybe = new Skrybe({
      apiKey: KEY,
      maxRetries: 0,
      fetch: async () => {
        throw new TypeError('fetch failed')
      },
    })
    await assert.rejects(skrybe.brands.list(), (err: unknown) => {
      assert.ok(err instanceof ConnectionError)
      assert.equal(err.code, 'network_error')
      assert.ok(err.cause instanceof TypeError)
      return true
    })
  })
})

describe('package', () => {
  it('reports the version package.json does', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
    assert.equal(VERSION, pkg.version)
  })

  it('has no runtime dependencies', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as Record<string, unknown>
    assert.equal(pkg.dependencies, undefined)
  })
})
