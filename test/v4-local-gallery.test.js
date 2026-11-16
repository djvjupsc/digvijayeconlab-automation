'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { mountLocalV4Gallery } = require('../utils/v4-local-gallery');

function routes() {
  const handlers = new Map();
  mountLocalV4Gallery({ get(route, handler) { handlers.set(route, handler); } });
  return handlers;
}
function fakeResponse() {
  return {
    statusCode:200, body:null, ended:false,
    status(code) { this.statusCode=code; return this; },
    json(obj) { this.body=obj; return this; },
    end() { this.ended=true; return this; },
    sendFile() { throw Error('Unexpected file serving'); }
  };
}

test('V4 gallery is read-only and registers no mutating route', () => {
  const handlers=routes();
  assert.deepEqual([...handlers.keys()], [
    '/api/v4-gallery',
    '/api/v4-gallery/:id/:kind/:file?'
  ]);
});
test('gallery refuses non-loopback callers', async () => {
  const handler=routes().get('/api/v4-gallery');
  const res=fakeResponse();
  await handler({socket:{remoteAddress:'192.168.1.35'}},res);
  assert.equal(res.statusCode,403);
  assert.equal(res.body.error,'Local access only');
});
test('gallery never implies publishing is enabled', async () => {
  const handler=routes().get('/api/v4-gallery');
  const res=fakeResponse();
  await handler({socket:{remoteAddress:'127.0.0.1'}},res);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.publishingEnabled,false);
  assert.ok(Array.isArray(res.body.items));
});
test('media endpoint blocks traversal and audio/voice files', async () => {
  const handler=routes().get('/api/v4-gallery/:id/:kind/:file?');
  for (const params of [
    {id:'../../etc',kind:'video'},
    {id:'downloads',kind:'audio'},
    {id:'step196',kind:'frame',file:'../../../.env'}
  ]) {
    const res=fakeResponse();
    await handler({socket:{remoteAddress:'127.0.0.1'},params},res);
    assert.equal(res.statusCode,404);
    assert.equal(res.ended,true);
  }
});
