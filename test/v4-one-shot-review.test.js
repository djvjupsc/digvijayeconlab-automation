'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {main,parseFormats,nonPublished}=require('../scripts/v4-one-shot-review');

test('One-shot batch requires specific format order and deduplicates nothing implicitly',()=>{
  assert.deepEqual(parseFormats(['--formats=short,medium,long']),['short','medium','long']);
  assert.deepEqual(parseFormats(['--formats=short']),['short']);
  assert.throws(()=>parseFormats(['--formats=long,short']),/ordered/);
  assert.throws(()=>parseFormats(['--formats=short,short']),/invalid formats/);
  assert.throws(()=>parseFormats(['--formats=short,medium,unknown']),/invalid formats/);
  assert.throws(()=>parseFormats([]),/Usage/);
});
test('No explicit user opt-in means no model, HyperFrames or filesystem work',async()=>{
  const previous=process.env.DVE_V4_REVIEW_BATCH_ENABLED;
  process.env.DVE_V4_REVIEW_BATCH_ENABLED='false';
  try{
    await assert.rejects(main(['--formats=short,medium,long']),/disabled/);
  } finally{
    if(previous===undefined)delete process.env.DVE_V4_REVIEW_BATCH_ENABLED;
    else process.env.DVE_V4_REVIEW_BATCH_ENABLED=previous;
  }
});
test('Output manifests must keep publishing and upload disabled',async()=>{
  assert.doesNotThrow(async()=>{await nonPublished({publishingAuthorized:false,autoUpload:false});});
  await assert.rejects(nonPublished({publishingAuthorized:true,autoUpload:false}),/safety gates/);
  await assert.rejects(nonPublished({publishingAuthorized:false,autoUpload:true}),/safety gates/);
});
test('Batch cannot silently publish or use paid model alternatives',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../scripts/v4-one-shot-review.js'),'utf8');
  assert.doesNotMatch(source,/require\(['"](?:openai|@google\/genai|replicate|elevenlabs)['"]\)/);
  assert.doesNotMatch(source,/youtube\.videos\.insert|publishVideo\(|scheduleVideo\(|eSpeak\(/);
  assert.match(source,/review_required/);
  assert.match(source,/DVE_V4_REVIEW_BATCH_ENABLED/);
});
