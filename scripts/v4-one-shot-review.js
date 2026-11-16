'use strict';

// ONE explicit, synchronous, offline, review-only Android handoff.
// Steps: isolated generic scene smoke => four-format RBI lesson pack =>
// selected Host V10 scene WAVs => GSAP/HyperFrames/FFmpeg video drafts.
// No publishing APIs, scheduler, paid providers, database, user credentials,
// content approval or overwrites are reachable here.
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {validateLesson,writeOnce}=require('./v4-offline-course-pack');
const {renderScene}=require('./v4-generic-scene-smoke');
const {validateStoryboard,runHostV10}=require('../utils/v4-host-v10-voice-queue');
const {renderCourseVideo,validateVoiceManifest}=require('../utils/v4-offline-course-renderer');

const PROJECT=path.join(os.homedir(),'digvijayeconlab-automation');
const SOURCE=path.join(PROJECT,'examples','v4-repo-rate-emi-2026.lesson.json');
const ROOT=path.join(PROJECT,'data','v4-course-drafts');
const SMOKE=path.join(PROJECT,'data','v4-scene-smoke','economics-flow-v1');
const REPORTS=path.join(PROJECT,'data','v4-review-reports');
const FORMATS=['short','medium','long'];

function stop(msg){throw Error('V4_ONE_SHOT: '+msg);}
function hash(data){return crypto.createHash('sha256').update(data).digest('hex');}
async function safeRegular(file,max=200*1024*1024){
  const s=await fs.lstat(file);
  if(!s.isFile()||s.isSymbolicLink()||s.size<1||s.size>max)stop('unsafe or missing file: '+path.basename(file));
  return s;
}
async function safeDirectory(file){
  const s=await fs.lstat(file);
  if(!s.isDirectory()||s.isSymbolicLink())stop('unsafe directory: '+path.basename(file));
}
async function exists(file){
  try{return await fs.lstat(file);}
  catch(e){if(e.code==='ENOENT')return null;throw e;}
}
async function nonPublished(manifest){
  if(!manifest||manifest.publishingAuthorized!==false||manifest.autoUpload!==false)
    stop('output manifest missing publishing safety gates');
}
function parseFormats(args){
  if(args.length!==1||!args[0].startsWith('--formats='))stop('Usage: node scripts/v4-one-shot-review.js --formats=short,medium,long');
  const formats=args[0].slice('--formats='.length).split(',').filter(Boolean);
  if(!formats.length||new Set(formats).size!==formats.length||formats.some(f=>!FORMATS.includes(f)))
    stop('invalid formats; use short,medium,long (unique)');
  if(formats[0]!=='short'||formats.some((f,i)=>FORMATS[i]!==f))stop('formats must be ordered short,medium,long');
  return formats;
}
function verifyReadOnlyOutput(directory,manifest,files){
  return Promise.all([
    safeDirectory(directory),
    nonPublished(manifest),
    ...files.map(f=>safeRegular(path.join(directory,f),400*1024*1024))
  ]);
}
async function probeSeconds(file){
  return new Promise((resolve,reject)=>{
    const child=spawn('ffprobe',['-v','error','-show_entries','format=duration',
      '-of','default=noprint_wrappers=1:nokey=1',file],{
      cwd:PROJECT,shell:false,stdio:['ignore','pipe','pipe']
    });
    let out='',done=false;
    const timer=setTimeout(()=>child.kill('SIGKILL'),30000);
    child.stdout.on('data',c=>{out=(out+String(c)).slice(-1000);});
    function complete(e){
      if(done)return;done=true;clearTimeout(timer);
      if(e)return reject(e);
      const seconds=Number(out.trim());
      if(!Number.isFinite(seconds)||seconds<=0)return reject(Error('invalid FFprobe duration'));
      resolve(seconds);
    }
    child.once('error',complete);
    child.once('close',(code)=>complete(code===0?null:Error('ffprobe did not succeed')));
  });
}
async function checkStorage(format){
  const base=path.join(PROJECT,'data');
  const stat=await fs.statfs(base);
  const remaining=Number(stat.bavail)*Number(stat.bsize);
  const required=format==='long'?900*1024*1024:
    format==='medium'?600*1024*1024:350*1024*1024;
  if(!Number.isFinite(remaining)||remaining<required)
    stop('insufficient local free storage before '+format+' stage; minimum reserve '+Math.ceil(required/(1024*1024))+' MiB');
  return Math.floor(remaining/1024/1024);
}
async function lessonPack(lesson){
  if(await exists(ROOT))await safeDirectory(ROOT);
  else await fs.mkdir(ROOT,{mode:0o700});
  const final=path.join(ROOT,lesson.topicId);
  let current=await exists(final);
  if(!current){
    const r=await writeOnce(ROOT,lesson);
    if(r.output!==final||r.publishingAuthorized!==false)stop('unexpected lesson pack result');
    current=await exists(final);
  }
  await safeDirectory(final);
  const manifestFile=path.join(final,'manifest.json');
  await safeRegular(manifestFile,250000);
  const manifest=JSON.parse(await fs.readFile(manifestFile,'utf8'));
  await nonPublished(manifest);
  const target=hash(JSON.stringify(lesson));
  if(manifest.topicId!==lesson.topicId||manifest.inputDigest!==target||
    manifest.readiness!=='script_and_storyboard_only'||manifest.quality?.status!=='review_required')
    stop('existing lesson pack differs from reviewed source; refusing overwrite');
  await safeRegular(path.join(final,'community-post.md'),50000);
  await safeRegular(path.join(final,'claims.json'),100000);
  return final;
}
async function verifiedSmoke(){
  const s=await exists(SMOKE);
  if(!s){
    const result=await renderScene({progress:stage=>process.stdout.write('SMOKE: '+stage+'\n')});
    if(result.output!==SMOKE||result.publishingAuthorized!==false)stop('unexpected smoke result');
  }
  await safeDirectory(SMOKE);
  const mf=path.join(SMOKE,'manifest.json');
  await safeRegular(mf,200000);
  const info=JSON.parse(await fs.readFile(mf,'utf8'));
  await nonPublished(info);
  if(info.status!=='review_required'||info.narrationGenerated!==false||
     info.technicalQA?.decoded!==true||info.technicalQA?.silent!==true)
    stop('smoke result has no valid review QA');
  await safeRegular(path.join(SMOKE,'video.mp4'),400*1024*1024);
  await safeRegular(path.join(SMOKE,'preview.png'),25*1024*1024);
  const seconds=await probeSeconds(path.join(SMOKE,'video.mp4'));
  if(seconds<9.7||seconds>10.3)stop('smoke video duration changed');
  return {output:SMOKE,seconds};
}
async function ensureVoice(lesson,format){
  const dir=path.join(ROOT,lesson.topicId,format);
  await safeDirectory(dir);
  const storyboardFile=path.join(dir,'storyboard.json');
  await safeRegular(storyboardFile,350000);
  const storyboard=JSON.parse(await fs.readFile(storyboardFile,'utf8'));
  const story=validateStoryboard(storyboard,lesson.topicId,format);
  const voiceDir=path.join(dir,'host-v10');
  if(!await exists(voiceDir)){
    const result=await runHostV10(lesson.topicId,format);
    if(result.output!==voiceDir||result.publishingAuthorized!==false)stop('unexpected Host V10 output');
  }
  await safeDirectory(voiceDir);
  const voiceFile=path.join(voiceDir,'manifest.json');
  await safeRegular(voiceFile,200000);
  const voice=JSON.parse(await fs.readFile(voiceFile,'utf8'));
  validateVoiceManifest(voice,story);
  for(const item of voice.scenes){
    await safeRegular(path.join(voiceDir,item.output),250*1024*1024);
  }
  return {output:voiceDir,scenes:voice.scenes.length,voiceQualityReviewed:false};
}
async function ensureVideo(lesson,format){
  const dir=path.join(ROOT,lesson.topicId,format,'v4-video');
  if(!await exists(dir)){
    const result=await renderCourseVideo(lesson.topicId,format,{
      progress:stage=>process.stdout.write(format.toUpperCase()+' VIDEO: '+stage+'\n')
    });
    if(result.output!==dir||result.publishingAuthorized!==false)stop('unexpected video result');
  }
  await safeDirectory(dir);
  const file=path.join(dir,'manifest.json');
  await safeRegular(file,250000);
  const info=JSON.parse(await fs.readFile(file,'utf8'));
  await nonPublished(info);
  if(info.status==='approved'||info.quality?.status!=='review_required'||
     info.quality?.videoReview!==false||info.quality?.humanVoiceReview!==false||
     info.quality?.technicalDecodePass!==true)
    stop('invalid staged video review state');
  await safeRegular(path.join(dir,'video.mp4'),600*1024*1024);
  await safeRegular(path.join(dir,'captions.srt'),350000);
  await safeRegular(path.join(dir,'thumbnail.jpg'),20*1024*1024);
  const seconds=await probeSeconds(path.join(dir,'video.mp4'));
  if(Math.abs(seconds-info.videoDuration)>1)stop('manifest duration not consistent with MP4');
  return {output:dir,seconds,rendered:true,publishingAuthorized:false};
}
async function main(args){
  const formats=parseFormats(args);
  if(process.env.DVE_V4_REVIEW_BATCH_ENABLED!=='true')
    stop('disabled: set DVE_V4_REVIEW_BATCH_ENABLED=true explicitly for local smoke+inference+render');
  await safeDirectory(PROJECT);
  await safeRegular(SOURCE,150000);
  const lesson=validateLesson(JSON.parse(await fs.readFile(SOURCE,'utf8')));
  await nonPublished(lesson.quality);
  if(lesson.topicId!=='repo-rate-emi-v4-review-2026')stop('unexpected input topic');
  await fs.mkdir(REPORTS,{recursive:true,mode:0o700});
  await safeDirectory(REPORTS);
  const reportDir=await fs.mkdtemp(path.join(REPORTS,'run-'));
  const report={schemaVersion:1,topicId:lesson.topicId,
    formatOrder:formats,startedAt:new Date().toISOString(),
    stages:[],status:'started',
    independentClaimVerification:false,humanVoiceReview:false,videoReview:false,
    publishingAuthorized:false,autoUpload:false};
  const mark=(stage,status,detail)=>{
    report.stages.push({stage,status,detail:detail||null,at:new Date().toISOString()});
    process.stdout.write('REVIEW BATCH '+stage+': '+status+(detail?' — '+String(detail):'')+'\n');
  };
  const store=async()=>{
    await fs.writeFile(path.join(reportDir,'report.json'),
      JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600}).catch(async e=>{
        if(e.code==='EEXIST')await fs.writeFile(path.join(reportDir,'report.json'),
          JSON.stringify(report,null,2)+'\n',{mode:0o600});else throw e;
      });
  };
  try{
    mark('device_smoke','started');
    await checkStorage('short');
    report.smoke=await verifiedSmoke();
    mark('device_smoke','technical_pass',report.smoke.output);
    mark('source_lesson','started');
    report.lesson=await lessonPack(lesson);
    mark('source_lesson','drafts_ready',report.lesson);
    report.outputs={};
    for(const format of formats){
      await checkStorage(format);
      mark(format+'_voice','started');
      const voice=await ensureVoice(lesson,format);
      mark(format+'_voice','wav_technical_complete_review_required',voice.output);
      mark(format+'_video','started');
      const video=await ensureVideo(lesson,format);
      report.outputs[format]={voice,video};
      mark(format+'_video','mp4_technical_complete_review_required',video.output);
    }
    report.status='technical_drafts_complete_review_required';
    mark('all','technical_drafts_complete_review_required');
    await store();
    console.log(JSON.stringify({report:path.join(reportDir,'report.json'),
      formats,outputs:report.outputs,community:path.join(report.lesson,'community-post.md'),
      publishingAuthorized:false,autoUpload:false,
      humanReviewRequired:true},null,2));
    return report;
  }catch(e){
    report.status='blocked';
    report.error=String(e.message).slice(0,800);
    mark('all','blocked',report.error);
    await store();
    console.error('V4_BATCH_REPORT:',path.join(reportDir,'report.json'));
    throw e;
  }
}
if(require.main===module)main(process.argv.slice(2)).catch(e=>{
  console.error('STOP:',e.message);process.exitCode=1;
});
module.exports={main,parseFormats,probeSeconds,nonPublished};
