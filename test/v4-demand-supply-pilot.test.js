'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const pilot=require('../utils/v4-demand-supply-pilot');

function api() {
  const routes=new Map();
  const app={
    get(path,handler){routes.set('GET '+path,handler);},
    post(path,...handlers){routes.set('POST '+path,handlers[handlers.length-1]);}
  };
  pilot.mountV4Pilot(app,()=>((_req,_res,next)=>next()));
  return routes;
}
function response(){
  return {
    code:200,body:null,finished:false,
    status(n){this.code=n;return this;},
    json(body){this.body=body;return this;},
    end(){this.finished=true;return this;}
  };
}
test('Narration fits the known 10-second V4 scene',()=>{
  const p=pilot.narrationPlan([3.04,3.52]);
  assert.equal(p.starts[0],2.30);
  assert.equal(p.starts[1],5.85);
  assert.ok(Math.abs(p.ends[1]-9.37)<0.001);
  const srt=pilot.toSRT(p);
  assert.match(srt,/00:00:02,300 --> 00:00:05,340/);
  assert.match(srt,/00:00:05,850 --> 00:00:09,370/);
  assert.match(srt,/माँग घटती/);
});
test('Overlong voice segments cannot be cut or accelerated silently',()=>{
  assert.throws(()=>pilot.narrationPlan([7,3.3]),/cannot fit/i);
  assert.throws(()=>pilot.narrationPlan([0.1,3.3]),/required/i);
  assert.throws(()=>pilot.narrationPlan([3.1]),/required/i);
});
test('Pilot creates only explicit local routes',()=>{
  assert.deepEqual([...api().keys()],[
    'GET /api/v4-pilot/status',
    'POST /api/v4-pilot/generate',
    'GET /api/v4-pilot/assets/:name'
  ]);
});
test('Remote clients cannot inspect or invoke the pilot',async()=>{
  const routes=api();
  for(const name of routes.keys()){
    const r=response();
    await routes.get(name)({socket:{remoteAddress:'192.168.1.11'},params:{name:'video.mp4'}},r);
    assert.equal(r.code,403);
  }
});
test('Pilot is disabled until explicitly enabled on device',async()=>{
  const routes=api(),r=response();
  const prev=process.env.DVE_V4_PILOT_ENABLED;
  const apiKey=process.env.API_KEY;
  process.env.DVE_V4_PILOT_ENABLED='false';
  process.env.API_KEY='test-only';
  try{
    await routes.get('POST /api/v4-pilot/generate')(
      {socket:{remoteAddress:'127.0.0.1'}},r
    );
    assert.equal(r.code,503);
    assert.match(r.body.error,/disabled/);
  }finally{
    if(prev===undefined)delete process.env.DVE_V4_PILOT_ENABLED;
    else process.env.DVE_V4_PILOT_ENABLED=prev;
    if(apiKey===undefined)delete process.env.API_KEY;
    else process.env.API_KEY=apiKey;
  }
});
test('No protected voice assets can be fetched from pilot media route',async()=>{
  const r=response();
  await api().get('GET /api/v4-pilot/assets/:name')(
    {socket:{remoteAddress:'127.0.0.1'},params:{name:'../voices/host.wav'}},r
  );
  assert.equal(r.code,404);
  assert.equal(r.finished,true);
});
test('V4 status always marks publication unauthorised',async()=>{
  const r=response();
  await api().get('GET /api/v4-pilot/status')(
    {socket:{remoteAddress:'127.0.0.1'}},r
  );
  assert.equal(r.code,200);
  assert.equal(r.body.publishingAuthorized,false);
});
