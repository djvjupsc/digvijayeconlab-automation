'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {splitNarration,validateStoryboard,PINNED}=require('../utils/v4-host-v10-voice-queue');
const {main}=require('../scripts/v4-render-host-v10');

function words(n){
  const pool=['माँग','आपूर्ति','बाजार','संतुलन','कीमत','मात्रा','और','नीति'];
  return Array.from({length:n},(_,i)=>pool[i%pool.length]).join(' ');
}
function story(format='short'){
  const counts={short:[35,35,35],medium:[115,115,115,115],long:[190,190,190,190,190,190]};
  const scenes=counts[format].map((n,i)=>({
    index:i+1,name:'Scene '+i,narration:words(n),claimIds:['source-claim'],
    visual:{type:'concept-map',title:'Concept',nodes:['A','B']},
    audioFile:null,reviewRequired:true
  }));
  return {
    schemaVersion:1,topicId:'economics-lesson',format,
    scenes,words:scenes.reduce((x,s)=>x+s.narration.split(/\s+/).length,0),
    voiceQueue:scenes.map(s=>({
      scene:s.index,speaker:'host-v10',text:s.narration,
      voiceSynthesisVerified:false,requestedWav:null
    })),publishingAuthorized:false
  };
}
test('Break long Hindi narration into bounded chunks without losing any word',()=>{
  const source=words(55)+'। '+words(42)+'।';
  const chunks=splitNarration(source);
  assert.ok(chunks.every(c=>c.split(/\s+/).length<=18));
  assert.equal(chunks.join(' '),source);
  assert.ok(chunks.length>6);
});
test('Reject malformed chunk limits, empty speech and excessive tokens',()=>{
  assert.throws(()=>splitNarration(''),/bounded text/);
  assert.throws(()=>splitNarration(words(30),19),/chunk limit/);
  assert.throws(()=>splitNarration('A'.repeat(101)),/oversize narration word/);
});
test('All three formats require identical narration and Host V10 voice queue',()=>{
  for(const format of ['short','medium','long']){
    const s=story(format);
    const out=validateStoryboard(s,s.topicId,format);
    assert.equal(out.scenes.length,s.scenes.length);
    assert.ok(out.scenes.every(c=>c.chunks.length>=1));
  }
});
test('Reject replacing required voice speaker and all publishing flags',()=>{
  const s=story();
  s.voiceQueue[0].speaker='espeak';
  assert.throws(()=>validateStoryboard(s,s.topicId,'short'),/queue mismatch/);
  s.voiceQueue[0].speaker='host-v10';
  s.publishingAuthorized=true;
  assert.throws(()=>validateStoryboard(s,s.topicId,'short'),/unpublished/);
  s.publishingAuthorized=false;
  s.voiceQueue[0].requestedWav='old-approved.wav';
  assert.throws(()=>validateStoryboard(s,s.topicId,'short'),/queue mismatch/);
});
test('Reject forged topic IDs, unreviewed queue state and changed script',()=>{
  const s=story();
  assert.throws(()=>validateStoryboard(s,'../../evil','short'),/invalid topic/);
  s.voiceQueue[1].text='Replacement narration';
  assert.throws(()=>validateStoryboard(s,s.topicId,'short'),/queue mismatch/);
});
test('The voice source is pinned to a known Host V10 reference and Python worker',()=>{
  assert.match(PINNED.host,/^[a-f0-9]{64}$/);
  assert.equal(PINNED.worker,'9f5ebd741189c4320cb9c4f6109142da1bea626024dfb3370b711996df0b0a7b');
});
test('Voice rendering is disabled unless explicitly opted in',async()=>{
  const prior=process.env.DVE_V4_NEW_VOICE_ENABLED;
  process.env.DVE_V4_NEW_VOICE_ENABLED='false';
  try{await assert.rejects(main(['economics-lesson','short']),/disabled/);}
  finally{
    if(prior===undefined)delete process.env.DVE_V4_NEW_VOICE_ENABLED;
    else process.env.DVE_V4_NEW_VOICE_ENABLED=prior;
  }
});
test('Voice runner does not import paid AI APIs or publishing modules',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../utils/v4-host-v10-voice-queue.js'),'utf8');
  assert.doesNotMatch(source,/require\(['"](?:openai|@google\/genai|elevenlabs|replicate)['"]\)/);
  assert.doesNotMatch(source,/publishing-scheduling-agent|youtube\.videos\.insert|\bespeak\s*\(|fetch\(/i);
});
