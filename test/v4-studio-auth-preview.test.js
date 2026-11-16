'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'../dashboard/v4-studio.html'),'utf8');
const inline=source.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(inline,'Studio inline JS must exist');
const js=inline[1];
const between=(left,right)=>{
  const from=js.indexOf(left),to=js.indexOf(right,from);
  assert.ok(from>=0 && to>from,'Expected source range missing');
  return js.slice(from,to);
};

test('Studio client syntax compiles offline',()=>{
  assert.doesNotThrow(()=>new vm.Script(js));
});
test('media URL allowlist includes V4 pilot but rejects traversal/external URLs',()=>{
  const code=between('function asset(url){','async function protectedResponse(');
  const asset=vm.runInNewContext(code+'\nasset',Object.create(null));
  assert.equal(asset('/api/v4-pilot/assets/video.mp4'),'/api/v4-pilot/assets/video.mp4');
  assert.equal(asset('/api/v4-gallery/step196/video'),'/api/v4-gallery/step196/video');
  assert.equal(asset('/api/content/prod_123/asset/thumbnail'),'/api/content/prod_123/asset/thumbnail');
  for(const url of [
    'https://other.example/media.mp4',
    '//other.example/media.mp4',
    '/api/v4-pilot/assets/../../.env',
    '/api/v4-pilot/assets/video.mp4?api_key=secret',
    '/uploads/video.mp4'
  ])assert.equal(asset(url),null,url);
});
test('protected media requests send x-api-key in header, not media URL',async()=>{
  const code=between('async function protectedResponse(','async function mediaObjectUrl(');
  const sent=[];
  const ctx={
    key:()=> 'secret-not-in-url',
    fetch:async(url,opts)=>{
      sent.push({url,opts});
      return {status:200,ok:true};
    },
    prompt:()=>{throw Error('Unexpected prompt');}
  };
  const protectedResponse=vm.runInNewContext(code+'\nprotectedResponse',ctx);
  await protectedResponse('/api/v4-pilot/assets/video.mp4');
  assert.equal(sent.length,1);
  assert.equal(sent[0].url,'/api/v4-pilot/assets/video.mp4');
  assert.equal(sent[0].opts.headers['x-api-key'],'secret-not-in-url');
  assert.ok(!sent[0].url.includes('secret'));
});
test('pilot MP4, thumbnail and scene images all use authenticated fetch-backed blobs',()=>{
  assert.match(js,/setMediaSrc\(vid,data\.media\.video\)/);
  assert.match(js,/addAsset\(thumbCard,data\.media\.thumbnail,"img"\)/);
  assert.match(js,/addAsset\(item,src,"img"\)/);
  assert.match(js,/URL\.createObjectURL\(blob\)/);
  assert.match(js,/MEDIA_FILE_LIMIT=48\*1024\*1024/);
  assert.match(js,/MEDIA_SESSION_LIMIT=96\*1024\*1024/);
  assert.doesNotMatch(js,/vid\.src=data\.media\.video/);
  assert.doesNotMatch(js,/node\.src=u;/);
});
