'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {
  validateLesson,wordCount,writeOnce
}=require('../scripts/v4-offline-course-pack');

function text(n,root='यह सिद्धांत उदाहरण आरेख मांग आपूर्ति संतुलन को समझाता') {
  const words=root.split(/\s+/u);
  return Array.from({length:n},(_,i)=>words[i%words.length]).join(' ');
}
function payload(){
  const scene=(i,n)=>({
    name:'Concept scene '+i,
    narration:text(n),
    claimIds:['claim-market'],
    visual:{type:'concept-map',title:'Market concept',nodes:['माँग','आपूर्ति','कीमत']}
  });
  return {
    schemaVersion:1,
    topicId:'market-equilibrium',
    title:'माँग और आपूर्ति से बाज़ार संतुलन',
    unit:'UGC NET Economics / Micro',
    language:'hi-IN',
    sources:[{id:'source-book',title:'Verified public study source',url:'https://example.org/economics',notes:'Source URL is for test only; no factual approval is implied'}],
    claims:[{id:'claim-market',statement:'माँग और आपूर्ति की परस्पर क्रिया कीमत के विश्लेषण में काम आती है',sourceIds:['source-book']}],
    variants:{
      long:{scenes:Array.from({length:6},(_,i)=>scene(i,190))},
      medium:{scenes:Array.from({length:4},(_,i)=>scene(i,115))},
      short:{scenes:Array.from({length:3},(_,i)=>scene(i,35))}
    },
    community:{text:text(45,'माँग आपूर्ति बाजार संतुलन पर प्रश्न अपने विचार बताइए'),claimIds:['claim-market']}
  };
}
test('Hindi whitespace word profiles are deterministic',()=>{
  const lesson=validateLesson(payload());
  assert.equal(lesson.variants.long.words,1140);
  assert.equal(lesson.variants.medium.words,460);
  assert.equal(lesson.variants.short.words,105);
  assert.equal(wordCount('कीमत  और\nमाँग'),3);
});
test('All outputs are fail-closed review drafts rather than fake MP4 or TTS',async()=>{
  const lesson=validateLesson(payload());
  assert.equal(lesson.quality.publishingAuthorized,false);
  assert.equal(lesson.quality.autoUpload,false);
  assert.equal(lesson.quality.noFallback,true);
  assert.equal(lesson.quality.hostV10AudioGenerated,false);
  for(const kind of ['long','medium','short']){
    assert.equal(lesson.variants[kind].publishingAuthorized,false);
    assert.ok(lesson.variants[kind].voiceQueue.every(x=>x.requestedWav===null));
  }
});
test('Every scene needs known claim references and a valid diagram',()=>{
  const d=payload();
  d.variants.short.scenes[0].claimIds=['unlisted'];
  assert.throws(()=>validateLesson(d),/claim reference/);
  d.variants.short.scenes[0].claimIds=['claim-market'];
  d.variants.short.scenes[0].visual={type:'random-stock-footage',title:'Wrong visual'};
  assert.throws(()=>validateLesson(d),/unsupported visual/);
});
test('Curve drawings must be grounded in bounded, ordered points',()=>{
  const d=payload();
  d.variants.short.scenes[0].visual={
    type:'curve',title:'Demand',xLabel:'Quantity',yLabel:'Price',
    curves:[{name:'D',points:[[0,90],[50,60],[80,20]]}]
  };
  assert.equal(validateLesson(d).variants.short.scenes[0].visual.curves[0].points.length,3);
  d.variants.short.scenes[0].visual.curves[0].points[2][0]=40;
  assert.throws(()=>validateLesson(d),/nonmonotone/);
});
test('Script length and missing community format are hard failures',()=>{
  const d=payload();
  d.variants.short.scenes[0].narration='बस थोड़े साधारण शब्द';
  assert.throws(()=>validateLesson(d),/short script length/);
  d.variants.short.scenes[0].narration=text(35);
  delete d.community;
  assert.throws(()=>validateLesson(d),/community post required/);
});
test('Sources cannot be local paths, HTTP or credential URLs',()=>{
  const d=payload();
  for(const url of ['file:///etc/passwd','http://example.org/','https://user:password@example.org/']){
    d.sources[0].url=url;
    assert.throws(()=>validateLesson(d),/source/);
  }
});
test('Write-once output creates long/medium/short/community drafts without touching existing output',async t=>{
  const root=await fs.mkdtemp(path.join(os.homedir(),'.v4-pack-test-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const lesson=validateLesson(payload());
  const first=await writeOnce(root,lesson);
  assert.equal(first.publishingAuthorized,false);
  assert.equal(first.videoRendered,false);
  const outputs=await fs.readdir(first.output);
  assert.deepEqual(outputs.sort(),[
    'claims.json','community-meta.json','community-post.md',
    'long','manifest.json','medium','short'
  ]);
  const manifest=JSON.parse(await fs.readFile(path.join(first.output,'manifest.json'),'utf8'));
  assert.equal(manifest.autoUpload,false);
  assert.equal(manifest.readiness,'script_and_storyboard_only');
  const storyboard=JSON.parse(await fs.readFile(path.join(first.output,'long','storyboard.json'),'utf8'));
  assert.equal(storyboard.scenes.length,6);
  assert.equal(storyboard.publishingAuthorized,false);
  assert.deepEqual((await fs.readdir(first.output)).filter(x=>x.endsWith('.mp4')),[]);
  await assert.rejects(writeOnce(root,lesson),/already exists/);
  const unchanged=JSON.parse(await fs.readFile(path.join(first.output,'manifest.json'),'utf8'));
  assert.equal(unchanged.inputDigest,manifest.inputDigest);
});
test('Symlink output directories cannot be used',async t=>{
  const root=await fs.mkdtemp(path.join(os.homedir(),'.v4-pack-symlink-test-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.mkdir(path.join(root,'safe'));
  await fs.symlink(path.join(root,'safe'),path.join(root,'linked'));
  await assert.rejects(writeOnce(path.join(root,'linked'),validateLesson(payload())),/unsafe output directory/);
});
