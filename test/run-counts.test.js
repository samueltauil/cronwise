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

test('GET and POST /explain validate run counts', async () => {
  await withServer(async (baseUrl) => {
    const expression = '* * * * *';
    const get = async (count) => fetch(`${baseUrl}/explain?expression=${encodeURIComponent(expression)}&count=${count}`);
    const post = async (count, raw = false) => fetch(`${baseUrl}/explain`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: raw ? `{"expression":"${expression}","count":${count}}` : JSON.stringify({ expression, count }),
    });

    for (const response of [await get('abc'), await get(''), await get('1.5'), await get('0'), await get('-1'), await get('101'), await get('1&count=2')]) {
      assert.equal(response.status, 400, 'expected 400 for invalid GET count');
    }
    for (const response of [await post('"abc"'), await post('1.5', true), await post(0), await post(-1), await post(101), await post('true', true), await post('null', true)]) {
      assert.equal(response.status, 400, 'expected 400 for invalid POST count');
    }

    for (const [response, expected] of [[await get('1'), 1], [await get('100'), 100], [await fetch(`${baseUrl}/explain?expression=${encodeURIComponent(expression)}`), 5], [await post(1), 1], [await post(100), 100], [await post(undefined), 5]]) {
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.nextRuns.length, expected);
    }
  });
});
