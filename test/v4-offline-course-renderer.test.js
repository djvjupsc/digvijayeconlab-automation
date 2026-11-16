'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {validateVoiceManifest,captionsForScenes,srt}=require('../utils/v4-offline-course-renderer');
const {main}=require('../scripts/v4-render-course-video');

function fixture(){
  const lines=['यह मांग और आपूर्ति की व्याख्या है।','बाजार में संतुलन कीमत तथा मात्रा के संबंध को दर्शाता है।'];
  const story={topicId:'lesson-micro',format:'short',
    scenes:lines.map((text,i)=>({index:i+1,text}))};
  const voice={
    schemaVersion:1,topicId:'lesson-micro',format:'short',voice:'host-v10',
    referenceSha256:'853e490009a5f5964ea402a8bbf8cfb3b58796596b13b296b5cd19235dd3c9a4',
    voiceQualityReviewed:false,publishingAuthorized:false,autoUpload:false,
    scenes:lines.map((text,i)=>({
      index:i+1,output:'scene-'+String(i+1).padStart(2,'0')+'.wav',
      userVoiceReviewRequired:true,
      segments:[{text,duration:3}]
    }))
  };
  return {story,voice};
}
test('Voice manifest must match exact scene transcript and remain unpublished',()=>{
  const {story,voice}=fixture();
  assert.equal(validateVoiceManifest(voice,story),true);
  voice.scenes[0].segments[0].text='incorrect text';
  assert.throws(()=>validateVoiceManifest(voice,story),/differ from script/);
});
test('Altered voice reference hash and preapproved voice are blocked',()=>{
  const {story,voice}=fixture();
  voice.referenceSha256='bad';
  assert.throws(()=>validateVoiceManifest(voice,story),/safety gates/);
  voice.referenceSha256='853e490009a5f5964ea402a8bbf8cfb3b58796596b13b296b5cd19235dd3c9a4';
  voice.voiceQualityReviewed=true;
  assert.throws(()=>validateVoiceManifest(voice,story),/safety gates/);
});
test('Caption entries maintain per-scene timestamps and original Hindi',()=>{
  const {voice}=fixture();
  const captions=captionsForScenes(voice,[6,6]);
  assert.match(captions,/00:00:01,200 --> 00:00:04,200/);
  assert.match(captions,/00:00:07,200 --> 00:00:10,200/);
  assert.match(captions,/मांग और आपूर्ति/);
  assert.equal(srt(11.005),'00:00:11,005');
});
test('Audio caption timing is rejected if segments overrun the scene',()=>{
  const {voice}=fixture();
  voice.scenes[1].segments[0].duration=20;
  assert.throws(()=>captionsForScenes(voice,[6,6]),/past rendered scene/);
});
test('V4 review-only video CLI requires explicit device opt-in',async()=>{
  const prior=process.env.DVE_V4_NEW_VIDEO_ENABLED;
  process.env.DVE_V4_NEW_VIDEO_ENABLED='false';
  try{await assert.rejects(main(['lesson-micro','short']),/disabled/);}
  finally{
    if(prior===undefined)delete process.env.DVE_V4_NEW_VIDEO_ENABLED;
    else process.env.DVE_V4_NEW_VIDEO_ENABLED=prior;
  }
});
test('Renderer is isolated from production DB, publishing routes and paid providers',()=>{
  const code=fs.readFileSync(path.join(__dirname,'../utils/v4-offline-course-renderer.js'),'utf8');
  assert.doesNotMatch(code,/publishing-scheduling-agent|youtube\.videos\.insert|require\(['"]openai['"]\)|require\(['"]@google\/genai['"]\)/);
  assert.match(code,/publishingAuthorized:false/);
  assert.match(code,/autoUpload:false/);
  assert.match(code,/never overwrite/);
});
