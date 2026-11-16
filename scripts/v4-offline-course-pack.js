'use strict';

// An isolated, deterministic, offline-FIRST planner for multi-format economics
// productions.  It does NOT render, synthesize speech, schedule or publish.
// The renderer must use this typed story/claim inventory rather than swapping
// unrelated text into the fixed Demand/Supply pilot.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const LENGTHS = Object.freeze({
  long: {min:1050,max:1500,minScenes:5,maxScenes:24},
  medium: {min:400,max:650,minScenes:4,maxScenes:14},
  short: {min:75,max:140,minScenes:3,maxScenes:7}
});
const LABEL = /^[a-z][a-z0-9-]{2,63}$/;
const MAX_INPUT = 1024*1024;
const MAX_TEXT = 120000;
const FORMATS = Object.freeze(['long','medium','short']);
const VISUALS = new Set(['concept-map','curve','curve-pair','flow','timeline','equation','comparison']);
const DEFAULT_ROOT = path.join(os.homedir(),'digvijayeconlab-automation','data','v4-course-drafts');

function fail(message) { throw Error('V4_TOPIC_PACK: '+message); }
function isObject(o) { return o!==null && typeof o==='object' && !Array.isArray(o); }
function string(x,label,min=1,max=MAX_TEXT) {
  if(typeof x!=='string' || x.trim().length<min || x.length>max || /[\u0000-\u0008\u000b\u000e-\u001f]/.test(x)) fail(label+' invalid');
  return x.trim();
}
function unique(items,label) {
  if(new Set(items).size!==items.length)fail('duplicate '+label);
}
function wordCount(text) {
  return String(text).trim().split(/\s+/u).filter(Boolean).length;
}
function validateVisual(input,context) {
  if(!isObject(input) || !VISUALS.has(input.type)) fail(context+' unsupported visual');
  const title=string(input.title,context+' visual title',3,120);
  if(input.type==='curve'||input.type==='curve-pair') {
    const xLabel=string(input.xLabel,context+' x axis',1,90);
    const yLabel=string(input.yLabel,context+' y axis',1,90);
    if(!Array.isArray(input.curves) || input.curves.length!==(input.type==='curve'?1:2)) fail(context+' curve count');
    const curves=input.curves.map((curve,i)=>{
      if(!isObject(curve))fail(context+' curve '+i);
      const name=string(curve.name,context+' curve label',1,60);
      if(!Array.isArray(curve.points)||curve.points.length<3||curve.points.length>30)fail(context+' curve points');
      let lastX=-1;
      const points=curve.points.map(point=>{
        if(!Array.isArray(point)||point.length!==2 || point.some(n=>!Number.isFinite(n)||n<0||n>100)||point[0]<=lastX)fail(context+' nonmonotone or out-of-range curve');
        lastX=point[0];
        return [...point];
      });
      return {name,points};
    });
    unique(curves.map(x=>x.name),context+' curve names');
    const equilibrium = input.equilibrium===undefined ? null : input.equilibrium;
    if(equilibrium!==null && (
      !isObject(equilibrium) ||
      !Number.isFinite(equilibrium.x) || equilibrium.x<0 || equilibrium.x>100 ||
      !Number.isFinite(equilibrium.y) || equilibrium.y<0 || equilibrium.y>100 ||
      typeof equilibrium.label!=='string' || equilibrium.label.length>60
    ))fail(context+' invalid equilibrium');
    return {type:input.type,title,xLabel,yLabel,curves,equilibrium};
  }
  if(input.type==='flow'||input.type==='concept-map'||input.type==='comparison') {
    if(!Array.isArray(input.nodes)||input.nodes.length<2||input.nodes.length>10)fail(context+' visual nodes');
    const nodes=input.nodes.map((n,i)=>string(n,context+' node '+i,2,90));
    unique(nodes,context+' nodes');
    return {type:input.type,title,nodes};
  }
  if(input.type==='timeline') {
    if(!Array.isArray(input.events)||input.events.length<2||input.events.length>12)fail(context+' timeline');
    return {type:input.type,title,events:input.events.map((e,i)=>{
      if(!isObject(e))fail(context+' event '+i);
      return {label:string(e.label,context+' event label',1,80),text:string(e.text,context+' event text',2,180)};
    })};
  }
  return {type:input.type,title,formula:string(input.formula,context+' formula',1,180)};
}
function validateLesson(input) {
  if(!isObject(input))fail('lesson must be object');
  if(input.schemaVersion!==1)fail('schemaVersion must be 1');
  const id=string(input.topicId,'topicId',3,64);
  if(!LABEL.test(id))fail('invalid topicId slug');
  const title=string(input.title,'title',4,200);
  const unit=string(input.unit,'unit',3,130);
  const language=string(input.language,'language',2,20);
  if(language!=='hi-IN')fail('Hindi language hi-IN required');
  if(!Array.isArray(input.sources)||input.sources.length<1||input.sources.length>40)fail('sources required');
  const sources=input.sources.map((s,i)=>{
    if(!isObject(s))fail('source '+i);
    const sourceId=string(s.id,'source id',3,64);
    if(!LABEL.test(sourceId))fail('invalid source id');
    const name=string(s.title,'source title',5,220);
    const url=string(s.url,'source URL',12,800);
    let parsed;
    try {parsed=new URL(url);}catch(_){fail('invalid source URL');}
    if(parsed.protocol!=='https:' || !parsed.hostname.includes('.') || parsed.username || parsed.password)fail('source must use public HTTPS URL without credentials');
    return {id:sourceId,title:name,url,notes:string(s.notes,'source notes',8,600)};
  });
  unique(sources.map(s=>s.id),'source IDs');
  const sourceIds=new Set(sources.map(s=>s.id));
  if(!Array.isArray(input.claims)||input.claims.length<1||input.claims.length>200)fail('claim inventory required');
  const claims=input.claims.map((c,i)=>{
    if(!isObject(c))fail('claim '+i);
    const id=string(c.id,'claim id',3,64);
    if(!LABEL.test(id))fail('invalid claim id');
    const statement=string(c.statement,'claim statement',8,500);
    if(!Array.isArray(c.sourceIds)||!c.sourceIds.length||c.sourceIds.length>12 || c.sourceIds.some(x=>!sourceIds.has(x)))fail('claim '+id+' needs valid sourceIds');
    return {id,statement,sourceIds:[...new Set(c.sourceIds)],reviewStatus:'unverified'};
  });
  unique(claims.map(c=>c.id),'claim IDs');
  const claimIds=new Set(claims.map(c=>c.id));
  if(!isObject(input.variants))fail('three video variants required');
  const variants={};
  for(const kind of FORMATS) {
    const config=LENGTHS[kind],raw=input.variants[kind];
    if(!isObject(raw)||!Array.isArray(raw.scenes)||raw.scenes.length<config.minScenes||raw.scenes.length>config.maxScenes)fail(kind+' scene count');
    const scenes=raw.scenes.map((scene,i)=>{
      if(!isObject(scene))fail(kind+' scene '+i);
      const name=string(scene.name,kind+' scene name',3,130);
      const narration=string(scene.narration,kind+' narration',8,24000);
      if(!Array.isArray(scene.claimIds)||scene.claimIds.length<1||scene.claimIds.length>20||scene.claimIds.some(x=>!claimIds.has(x)))fail(kind+' scene '+i+' missing supported claim reference');
      const visual=validateVisual(scene.visual,kind+' scene '+i);
      return {index:i+1,name,narration,claimIds:[...new Set(scene.claimIds)],visual,voice:'Host V10',audioFile:null,reviewRequired:true};
    });
    const narration=scenes.map(s=>s.narration).join('\n\n');
    const words=wordCount(narration);
    if(words<config.min || words>config.max)fail(kind+' script length '+words+' outside '+config.min+'-'+config.max);
    variants[kind]={
      format:kind,
      targetWords:{min:config.min,max:config.max},
      words,
      scenes,
      voiceQueue:scenes.map(s=>({scene:s.index,speaker:'host-v10',text:s.narration,requestedWav:null,voiceSynthesisVerified:false})),
      renderStatus:'blocked_pending_natural_host_v10_audio_and_device_qa',
      publishingAuthorized:false
    };
  }
  if(!isObject(input.community))fail('community post required');
  const post=string(input.community.text,'community post',50,1600);
  const count=wordCount(post);
  if(count<30||count>180)fail('community post length 30-180 words');
  if(!Array.isArray(input.community.claimIds)||!input.community.claimIds.length||input.community.claimIds.some(x=>!claimIds.has(x)))fail('community post claim references');
  return {
    schemaVersion:1,topicId:id,title,unit,language,
    sources,claims,variants,
    community:{text:post,words:count,claimIds:[...new Set(input.community.claimIds)],status:'review_required'},
    quality:{
      allClaimsIndependentlyVerified:false,claimInventoryAttested:false,
      hostV10AudioGenerated:false,motionRendered:false,
      humanVoiceReview:false,academicReview:false,rightsReviewed:false,
      publishingAuthorized:false,autoUpload:false,noFallback:true,
      status:'review_required'
    }
  };
}
async function safeInput(file) {
  const stat=await fs.lstat(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX_INPUT)fail('input must be a non-symlink JSON file under 1 MiB');
  const json=await fs.readFile(file,'utf8');
  return validateLesson(JSON.parse(json));
}
async function outputRoot(root) {
  const absolute=path.resolve(root);
  const home=await fs.realpath(os.homedir());
  if(absolute===home||!absolute.startsWith(home+path.sep))fail('output must remain inside the device home directory');
  // Do not traverse symlinks in the output parent chain.
  let p=home;
  for(const part of path.relative(home,absolute).split(path.sep)) {
    p=path.join(p,part);
    try{
      const s=await fs.lstat(p);
      if(!s.isDirectory()||s.isSymbolicLink())fail('unsafe output directory component');
    }catch(e){
      if(e.code==='ENOENT') await fs.mkdir(p,{mode:0o700});
      else throw e;
    }
  }
  return absolute;
}
async function writeOnce(root,lesson) {
  const dir=await outputRoot(root);
  const final=path.join(dir,lesson.topicId);
  try {await fs.lstat(final);fail('output already exists; never overwrite existing drafts');}
  catch(e){if(e.code!=='ENOENT')throw e;}
  const staging=await fs.mkdtemp(path.join(dir,'.v4-building-'));
  try{
    const summary={
      schemaVersion:1,topicId:lesson.topicId,title:lesson.title,unit:lesson.unit,
      createdAt:new Date().toISOString(),
      inputDigest:crypto.createHash('sha256').update(JSON.stringify(lesson)).digest('hex'),
      formats:['long','medium','short','community'],
      reviewRequired:true,publishingAuthorized:false,autoUpload:false,
      readiness:'script_and_storyboard_only',
      pending:[
        'Independent claim/source and rights attestations',
        'Natural Hindi Host V10 generation for every scene; no eSpeak/paid fallback',
        'Dynamic V4 storyboard rendering and media/audio sync device QA',
        'Human quality review prior to any separate publishing approval'
      ],
      quality:lesson.quality
    };
    const write=async(file,content)=>{
      const dest=path.join(staging,file);
      await fs.writeFile(dest,content,{flag:'wx',mode:0o600});
    };
    await write('manifest.json',JSON.stringify(summary,null,2)+'\n');
    await write('claims.json',JSON.stringify({sources:lesson.sources,claims:lesson.claims},null,2)+'\n');
    for(const format of FORMATS) {
      const variant=lesson.variants[format];
      const fdir=path.join(staging,format);
      await fs.mkdir(fdir,{mode:0o700});
      const script=variant.scenes.map(s=>'## '+s.index+'. '+s.name+'\n\n'+s.narration).join('\n\n');
      await write(format+'/script.md','# '+lesson.title+' — '+format+'\n\n'+script+'\n');
      await write(format+'/storyboard.json',JSON.stringify({
        schemaVersion:1,topicId:lesson.topicId,format,words:variant.words,
        scenes:variant.scenes,voiceQueue:variant.voiceQueue,
        renderStatus:variant.renderStatus,
        publishingAuthorized:false
      },null,2)+'\n');
    }
    await write('community-post.md',lesson.community.text+'\n');
    await write('community-meta.json',JSON.stringify(lesson.community,null,2)+'\n');
    try{await fs.lstat(final);fail('completed output appeared concurrently; refusing overwrite');}
    catch(e){if(e.code!=='ENOENT')throw e;}
    await fs.rename(staging,final);
    return {output:final,topicId:lesson.topicId,formats:summary.formats,
      videoRendered:false,voiceGenerated:false,publishingAuthorized:false};
  }catch(e){
    // Preserve failed working directory for diagnostics; never delete user material.
    await fs.writeFile(path.join(staging,'FAILED.txt'),String(e.message).slice(0,1000),{flag:'wx'}).catch(()=>{});
    throw e;
  }
}
async function main(argv) {
  if(argv.length<1 || argv.length>2 || argv.some(x=>x.startsWith('-')))fail('usage: node scripts/v4-offline-course-pack.js <topic.json> [output-root]');
  const input=await safeInput(path.resolve(argv[0]));
  const result=await writeOnce(argv[1]||DEFAULT_ROOT,input);
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
}
if(require.main===module)main(process.argv.slice(2)).catch(e=>{
  console.error('STOP:',e.message);process.exitCode=1;
});
module.exports={validateLesson,wordCount,validateVisual,safeInput,writeOnce,main,LENGTHS};
