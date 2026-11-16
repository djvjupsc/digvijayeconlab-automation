'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { getReadiness,mountLocalV4Readiness } = require('../utils/v4-local-readiness');

function api() {
  const routes = new Map();
  mountLocalV4Readiness({get(path, handler) { routes.set(path,handler); }});
  return routes;
}
function response() {
  return {
    code:200,body:null,
    status(code){this.code=code;return this;},
    json(data){this.body=data;return this;}
  };
}
test('readiness registers read-only endpoint',()=>{
  assert.deepEqual([...api().keys()],['/api/v4-readiness']);
});
test('readiness refuses remote callers',async()=>{
  const r=response();
  await api().get('/api/v4-readiness')({socket:{remoteAddress:'10.0.0.23'}},r);
  assert.equal(r.code,403);
  assert.equal(r.body.error,'Local access only');
});
test('readiness reports verification state without scheduling production',async()=>{
  const data=await getReadiness();
  assert.equal(data.v4AutomatedGenerationEnabled,false);
  assert.equal(data.v4AutomatedGenerationVerified,false);
  assert.equal(data.publishingEnabled,false);
  assert.ok(data.checks.length>=8);
  assert.ok(data.checks.every(c=>['verified','present','blocked'].includes(c.status)));
});
test('readiness offers local diagnostic information',async()=>{
  const r=response();
  await api().get('/api/v4-readiness')({socket:{remoteAddress:'127.0.0.1'}},r);
  assert.equal(r.code,200);
  assert.equal(r.body.publishingEnabled,false);
  assert.equal(r.body.checks.some(c=>c.id==='host_v10'),true);
});
