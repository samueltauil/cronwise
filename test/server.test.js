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
