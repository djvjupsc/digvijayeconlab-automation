'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {checkedInfo,SCENE,renderScene}=require('../scripts/v4-generic-scene-smoke');
const {createSceneHTML}=require('../utils/v4-generic-scene-html');
function streams(seconds=10){
  return {
    format:{duration:String(seconds)},
    streams:[{
      codec_type:'video',codec_name:'h264',
      width:1920,height:1080,r_frame_rate:'24/1'
    }]
  };
}
test('Smoke renders a distinct economics flow, never copies demand/supply diagrams',()=>{
  assert.equal(SCENE.visual.type,'flow');
  assert.deepEqual(SCENE.visual.nodes,['उत्पादन','आय','व्यय']);
  const html=createSceneHTML(SCENE,{
    topicTitle:'अर्थव्यवस्था का बुनियादी प्रवाह',duration:10
  });
  assert.match(html,/window\.__timelines\.main=tl/);
  assert.match(html,/assets\/gsap\.min\.js/);
  assert.match(html,/उत्पादन/);
  assert.match(html,/व्यय/);
  assert.doesNotMatch(html,/Demand D|Supply S|P\* Q\*/);
});
test('Silent 10-second MP4 quality gate checks dimensions, duration and codec',()=>{
  assert.deepEqual(checkedInfo(streams()),{
    duration:10,width:1920,height:1080,silent:true
  });
  assert.throws(()=>checkedInfo(streams(12)),/invalid silent review MP4/);
  assert.throws(()=>checkedInfo({...streams(),streams:[{
    codec_type:'video',codec_name:'h264',width:1280,height:720,r_frame_rate:'24/1'
  }]}),/invalid silent review MP4/);
  assert.throws(()=>checkedInfo({...streams(),streams:[
    ...streams().streams,{codec_type:'audio',codec_name:'aac'}
  ]}),/invalid silent review MP4/);
});
test('Explicit opt-in prevents accidental video rendering',async()=>{
  const saved=process.env.DVE_V4_SCENE_SMOKE_ENABLED;
  process.env.DVE_V4_SCENE_SMOKE_ENABLED='false';
  try{await assert.rejects(renderScene(),/disabled/);}
  finally{
    if(saved===undefined)delete process.env.DVE_V4_SCENE_SMOKE_ENABLED;
    else process.env.DVE_V4_SCENE_SMOKE_ENABLED=saved;
  }
});
test('Smoke worker has no publishing, TTS, remote API or scheduler integrations',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../scripts/v4-generic-scene-smoke.js'),'utf8');
  assert.doesNotMatch(source,/require\(['"](?:openai|@google\/genai|replicate)['"]\)/);
  assert.doesNotMatch(source,/require\(['"].*(?:publishing-scheduling-agent|jugnu-tts-worker)['"]\)/);
  assert.doesNotMatch(source,/youtube\.videos\.insert|https?:\/\/|eSpeak\(/i);
  assert.match(source,/publicationAuthorized:false/);
  assert.match(source,/publishingAuthorized:false/);
  assert.match(source,/autoUpload:false/);
  assert.match(source,/prior smoke output exists; refusing overwrite/);
});
