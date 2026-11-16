'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {validateLesson}=require('../scripts/v4-offline-course-pack');
const {validateStoryboard}=require('../utils/v4-host-v10-voice-queue');

const file=path.join(__dirname,'../examples/v4-repo-rate-emi-2026.lesson.json');
const lesson=JSON.parse(fs.readFileSync(file,'utf8'));

test('Authored RBI-sourced Hindi draft contains all four fully independent formats',()=>{
  const data=validateLesson(lesson);
  assert.equal(data.topicId,'repo-rate-emi-v4-review-2026');
  assert.deepEqual(Object.keys(data.variants),['long','medium','short']);
  for(const f of ['long','medium','short']){
    assert.ok(data.variants[f].scenes.every(s=>s.visual&&s.visual.type));
    assert.equal(data.variants[f].publishingAuthorized,false);
    assert.ok(data.variants[f].voiceQueue.every(s=>s.voiceSynthesisVerified===false));
    assert.ok(data.variants[f].scenes.every(s=>s.claimIds.length));
  }
  assert.ok(data.community.words>=30);
  assert.equal(data.community.status,'review_required');
  assert.equal(data.quality.claimInventoryAttested,false);
  assert.equal(data.quality.humanVoiceReview,false);
  assert.equal(data.quality.academicReview,false);
  assert.equal(data.quality.publishingAuthorized,false);
});
test('All distinct topic storyboard graphics survive full lesson and voice validations',()=>{
  const data=validateLesson(lesson);
  for(const format of ['long','medium','short']){
    const v=data.variants[format];
    const story=validateStoryboard({
      schemaVersion:1,topicId:data.topicId,format,
      words:v.words,scenes:v.scenes,voiceQueue:v.voiceQueue,
      publishingAuthorized:false
    },data.topicId,format);
    assert.ok(story.scenes.every(s=>s.visual&&s.visual.title));
  }
});
test('Official RBI citations are listed but are explicitly NOT pre-attested',()=>{
  assert.ok(lesson.sources.length>=2);
  assert.ok(lesson.sources.every(s=>s.url.startsWith('https://') && s.url.includes('rbi.org.in')));
  const claims=validateLesson(lesson).claims;
  assert.ok(claims.every(c=>c.reviewStatus==='unverified'));
  assert.ok(claims.length>=5);
});
