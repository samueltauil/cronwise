import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

async function withServer(run) {
  const server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://localhost:${server.address().port}`;
  try {
    await run(baseUrl);
  } finally {
    server.close();
  }
}

test('GET /health reports the service is up', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok', service: 'cronwise' });
  });
});

test('GET /explain rejects a missing expression', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/explain`);
    assert.equal(response.status, 400);
  });
});

test('GET /explain expands @macros', async () => {
  await withServer(async (baseUrl) => {
    const params = new URLSearchParams({ expression: '@daily' });
    const response = await fetch(`${baseUrl}/explain?${params}`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.expression, '@daily');
    assert.equal(body.normalized, '0 0 * * *');
  });
});

test('GET /explain accepts comma-separated lists', async () => {
  await withServer(async (baseUrl) => {
    const params = new URLSearchParams({ expression: '0,15,30,45 * * * *' });
    const response = await fetch(`${baseUrl}/explain?${params}`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.normalized, '0,15,30,45 * * * *');
  });
});

test('GET /explain rejects inverted ranges', async () => {
  await withServer(async (baseUrl) => {
    const params = new URLSearchParams({ expression: '30-10 * * * *' });
    const response = await fetch(`${baseUrl}/explain?${params}`);
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.field, 'minute');
    assert.match(body.error, /inverted/);
  });
});

test('GET /explain resolves month name aliases', async () => {
  await withServer(async (baseUrl) => {
    const params = new URLSearchParams({ expression: '0 9 1 jan,mar,dec *' });
    const response = await fetch(`${baseUrl}/explain?${params}`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.match(body.description, /in January, March, and December/);
  });
});

test('POST /explain/batch preserves names and order with mixed results', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/explain/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobs: [
          { name: ' backup ', schedule: '0 3 * * *' },
          { name: 'bad-minute', schedule: '60 * * * *' },
          { name: 'hourly', schedule: '@hourly' },
          { name: 'empty', schedule: '' },
        ],
        count: 2,
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body.results.map((result) => result.name), [' backup ', 'bad-minute', 'hourly', 'empty']);
    assert.equal(body.results[0].explanation.nextRuns.length, 2);
    assert.equal(body.results[0].explanation.normalized, '0 3 * * *');
    assert.equal(body.results[0].error, undefined);
    assert.equal(body.results[1].explanation, undefined);
    assert.equal(body.results[1].error.field, 'minute');
    assert.match(body.results[1].error.message, /out of range/);
    assert.equal(body.results[2].explanation.normalized, '0 * * * *');
    assert.match(body.results[3].error.message, /non-empty string/);
    assert.equal(body.results[3].error.field, undefined);
  });
});

test('POST /explain/batch rejects malformed envelopes', async () => {
  const job = { name: 'backup', schedule: '@daily' };
  const invalidBodies = [
    null, [], 'jobs', {}, { jobs: null }, { jobs: {} }, { jobs: [] },
    { jobs: Array.from({ length: 51 }, (_, index) => ({ ...job, name: `job-${index}` })) },
    ...[null, [], 'job', 1, true].map((value) => ({ jobs: [value] })),
    ...[undefined, null, '', '   ', 1, true].map((name) => ({ jobs: [{ ...job, name }] })),
    ...[undefined, null, 1, [], {}, true].map((schedule) => ({ jobs: [{ ...job, schedule }] })),
    { jobs: [job, job] },
    ...[null, 0, -1, 101, 1.5, '5', '', true, [], {}].map((count) => ({ jobs: [job], count })),
  ];

  await withServer(async (baseUrl) => {
    for (const payload of invalidBodies) {
      const response = await fetch(`${baseUrl}/explain/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      assert.equal(response.status, 400, JSON.stringify(payload));
    }
  });
});

test('POST /explain/batch isolates inherited macro and alias names as cron errors', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/explain/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobs: [
          { name: 'prototype-macro', schedule: '__proto__' },
          { name: 'constructor-macro', schedule: 'constructor' },
          { name: 'prototype-month', schedule: '0 3 * __proto__ *' },
          { name: 'constructor-weekday', schedule: '0 3 * * constructor' },
          { name: 'valid', schedule: '@daily' },
        ],
      }),
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    for (const result of body.results.slice(0, 4)) {
      assert.equal(typeof result.error.message, 'string');
      assert.equal(result.explanation, undefined);
    }
    assert.equal(body.results[2].error.field, 'month');
    assert.equal(body.results[3].error.field, 'dayOfWeek');
    assert.equal(body.results[4].explanation.normalized, '0 0 * * *');
  });
});

test('POST /explain/batch reports envelope fields before processing jobs', async () => {
  await withServer(async (baseUrl) => {
    for (const [payload, field] of [
      [{ jobs: [] }, 'jobs'],
      [{ jobs: [{ name: 'bad', schedule: '' }], count: 0 }, 'count'],
      [{ jobs: [{ name: 'bad', schedule: '' }, { name: 'bad', schedule: '@daily' }] }, 'jobs[1].name'],
      [{ jobs: [{ name: 'bad', schedule: '' }, { name: 'missing' }] }, 'jobs[1].schedule'],
    ]) {
      const response = await fetch(`${baseUrl}/explain/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      assert.equal(response.status, 400);
      assert.equal(body.field, field);
      assert.equal(typeof body.error, 'string');
      assert.equal(body.results, undefined);
    }
  });
});

test('POST /explain/batch accepts count boundaries and defaults with up to 50 jobs', async () => {
  await withServer(async (baseUrl) => {
    for (const count of [undefined, 1, 100]) {
      const jobs = Array.from({ length: 50 }, (_, index) => ({
        name: `job-${index}`, schedule: '* * * * *',
      }));
      const response = await fetch(`${baseUrl}/explain/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobs, count }),
      });
      const body = await response.json();
      assert.equal(response.status, 200);
      assert.deepEqual(body.results.map((result) => result.name), jobs.map((job) => job.name));
      for (const result of body.results) {
        assert.equal(result.explanation.nextRuns.length, count ?? 5);
      }
    }
  });
});

test('batch captures one starting instant and matches the single-job response', async (t) => {
  const RealDate = Date;
  let captures = 0;
  t.mock.method(globalThis, 'Date', class extends RealDate {
    constructor(...args) {
      if (args.length === 0) {
        super(RealDate.UTC(2026, 0, 1, 0, captures++));
      } else {
        super(...args);
      }
    }
  });

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/explain/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobs: [
          { name: 'first', schedule: '* * * * *' },
          { name: 'second', schedule: '* * * * *' },
        ],
      }),
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(captures, 1);
    assert.deepEqual(body.results[0].explanation, body.results[1].explanation);
    assert.equal(body.results[0].explanation.nextRuns[0], '2026-01-01T00:01:00.000Z');

    captures = 0;
    const single = await fetch(`${baseUrl}/explain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expression: '* * * * *' }),
    });
    assert.equal(single.status, 200);
    assert.deepEqual(await single.json(), body.results[0].explanation);
  });
});
