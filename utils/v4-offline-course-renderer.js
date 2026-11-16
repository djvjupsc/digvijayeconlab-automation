'use strict';

// Offline scene-based HyperFrames + FFmpeg renderer for an isolated, reviewed
// topic draft. Does not generate facts, call remote services, publish or modify
// the fixed Demand/Supply pilot. Device-side rendering is not yet validated.
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {createSceneHTML}=require('./v4-generic-scene-html');
const {assertCleanHyperframesLint}=require('./v4-hyperframes-lint');
const {validateStoryboard,splitNarration}=require('./v4-host-v10-voice-queue');

const HOME=os.homedir();
const PROJECT=path.join(HOME,'digvijayeconlab-automation');
const PACK=path.join(PROJECT,'data','v4-course-drafts');
const SOURCE=path.join(HOME,'digvijayeconlab-tools','dve-style-v4-adapter','drafts','step196');
const HYPERFRAMES=path.join(HOME,'digvijayeconlab-tools','hyperframes-cli','node_modules','.bin','hyperframes');
const BROWSER=path.join(process.env.PREFIX||'/missing-termux-prefix','bin','chromium-browser');
const GSAP_HASH='92bb9a96476f983d212a2bc4f54c889039c1696dd4461d40a736860938570fbb';
const FILES=['hyperframes.json','package.json','digvijayeconlab-video-style.css'];
const PROFILES=new Set(['long','medium','short']);
const FINAL_LIMITS=Object.freeze({short:300,medium:1500,long:3600});
const SLUG=/^[a-z][a-z0-9-]{2,63}$/;
function stop(msg){throw Error('V4_OFFLINE_RENDER: '+msg);}
function srt(seconds){
  const n=Math.round(seconds*1000),h=Math.floor(n/3600000),m=Math.floor(n/60000)%60,
    s=Math.floor(n/1000)%60,ms=n%1000;
  return [h,m,s].map(x=>String(x).padStart(2,'0')).join(':')+','+String(ms).padStart(3,'0');
}
function captionsForScenes(voice,sceneDurations){
  if(!Array.isArray(voice.scenes)||voice.scenes.length!==sceneDurations.length)
    stop('scene caption timing mismatch');
  let sequence=0,cursor=0;
  const lines=[];
  for(const [i,scene] of voice.scenes.entries()){
    let start=cursor+1.2;
    for(const seg of scene.segments){
      if(typeof seg.text!=='string'||!Number.isFinite(seg.duration)||seg.duration<=0)stop('invalid audio segment');
      const end=start+seg.duration;
      if(end>cursor+sceneDurations[i]+0.2)stop('caption runs past rendered scene');
      lines.push(String(++sequence),srt(start)+' --> '+srt(end),seg.text,'');
      start=end;
    }
    cursor+=sceneDurations[i];
  }
  return lines.join('\n')+'\n';
}
async function fileRegular(file,max=250*1024*1024){
  const st=await fs.lstat(file);
  if(!st.isFile()||st.isSymbolicLink()||st.size<1||st.size>max)stop('invalid file: '+path.basename(file));
  return st;
}
async function run(binary,args,cwd,timeout=720000,env=process.env){
  return new Promise((resolve,reject)=>{
    const child=spawn(binary,args,{cwd,env,shell:false,stdio:['ignore','pipe','pipe']});
    let out='',done=false;
    const timer=setTimeout(()=>{child.kill('SIGKILL');},timeout);
    const add=b=>{out=(out+String(b)).slice(-12000);};
    child.stdout.on('data',add);child.stderr.on('data',add);
    const finish=(err)=>{
      if(done)return;
      done=true;clearTimeout(timer);
      err?reject(err):resolve(out);
    };
    child.once('error',finish);
    child.once('close',(code,signal)=>{
      if(code===0)finish(null);
      else finish(Error('Local '+path.basename(binary)+' failed: '+String(code)+' / '+String(signal)+'; '+out.slice(-1500)));
    });
  });
}
async function probe(file){
  const out=await run('ffprobe',['-v','error','-show_entries',
    'format=duration:stream=codec_type,codec_name,width,height,r_frame_rate,channels,sample_rate',
    '-of','json',file],PROJECT,30000);
  const p=JSON.parse(out.slice(out.indexOf('{')));
  return {
    duration:Number(p.format.duration),
    video:p.streams.find(x=>x.codec_type==='video'),
    audio:p.streams.find(x=>x.codec_type==='audio')
  };
}
function checkVideo(p,wantAudio,maxDuration=180){
  if(!Number.isFinite(maxDuration)||maxDuration<3||maxDuration>3600)
    stop('invalid duration ceiling');
  if(!p||!p.video||p.video.codec_name!=='h264'||p.video.width!==1920||p.video.height!==1080||
      p.video.r_frame_rate!=='24/1'||!Number.isFinite(p.duration)||p.duration<2||p.duration>maxDuration)
    stop('video quality/codec profile mismatch');
  if(wantAudio && (!p.audio||p.audio.codec_name!=='aac'))stop('missing AAC voice in render');
}
function checkAssembledDuration(format,parts,duration){
  if(!Object.hasOwn(FINAL_LIMITS,format)||!Array.isArray(parts)||parts.length<1||
     parts.length>24||parts.some(d=>!Number.isFinite(d)||d<2||d>120)||
     !Number.isFinite(duration))
    stop('invalid assembled duration inputs');
  const expected=parts.reduce((sum,d)=>sum+d,0);
  if(duration>FINAL_LIMITS[format]||
     Math.abs(duration-expected)>Math.max(.75,parts.length*.18))
    stop('assembled video duration mismatch');
  return expected;
}
function validateVoiceManifest(voice,story){
  if(!voice||voice.schemaVersion!==1||voice.topicId!==story.topicId||
    voice.format!==story.format||voice.voice!=='host-v10' ||
    voice.referenceSha256!=='853e490009a5f5964ea402a8bbf8cfb3b58796596b13b296b5cd19235dd3c9a4'||
    voice.voiceQualityReviewed!==false||voice.publishingAuthorized!==false||voice.autoUpload!==false)
    stop('voice manifest fails review-only safety gates');
  if(!Array.isArray(voice.scenes)||voice.scenes.length!==story.scenes.length)stop('missing scene voice');
  for(const [i,s] of voice.scenes.entries()){
    const expected=story.scenes[i];
    if(s.index!==expected.index||s.output!=='scene-'+String(i+1).padStart(2,'0')+'.wav'||
       !Array.isArray(s.segments)||!s.segments.length||
       s.segments.length!==splitNarration(expected.text).length||s.userVoiceReviewRequired!==true)
      stop('unsafe voice scene entry');
    const normalize=t=>t.trim().replace(/\s+/gu,' ');
    if(normalize(s.segments.map(x=>x.text).join(' '))!==normalize(expected.text))
      stop('voice chunks differ from script');
    if(s.segments.some(seg=>!Number.isFinite(seg.duration)||seg.duration<=0||seg.duration>90))
      stop('invalid voice segment duration');
  }
  return true;
}
async function checkAssets(){
  await fileRegular(path.join(SOURCE,'assets','gsap.min.js'),3*1024*1024);
  const actual=crypto.createHash('sha256')
    .update(await fs.readFile(path.join(SOURCE,'assets','gsap.min.js'))).digest('hex');
  if(actual!==GSAP_HASH)stop('unapproved local GSAP runtime');
  for(const name of FILES)await fileRegular(path.join(SOURCE,name),2*1024*1024);
  for(const executable of [HYPERFRAMES,BROWSER]){
    const stat=await fs.stat(executable);
    if(!stat.isFile())stop('local browser or HyperFrames unavailable');
    await fs.access(executable,require('node:fs').constants.X_OK);
  }
}
async function readInputs(topic,format){
  if(!SLUG.test(topic)||!PROFILES.has(format))stop('invalid topic/format');
  const dir=path.join(PACK,topic,format);
  for(const p of [PACK,path.join(PACK,topic),dir,path.join(dir,'host-v10')]){
    const stat=await fs.lstat(p);
    if(!stat.isDirectory()||stat.isSymbolicLink())stop('unsafe draft or voice directory');
  }
  const packManifestFile=path.join(PACK,topic,'manifest.json');
  await fileRegular(packManifestFile,200000);
  const packManifest=JSON.parse(await fs.readFile(packManifestFile,'utf8'));
  if(packManifest.topicId!==topic||packManifest.schemaVersion!==1||
     typeof packManifest.title!=='string'||packManifest.title.length<3||packManifest.title.length>200||
     packManifest.publishingAuthorized!==false||packManifest.autoUpload!==false||
     packManifest.readiness!=='script_and_storyboard_only')stop('unsafe lesson pack manifest');
  const rawFile=path.join(dir,'storyboard.json');
  const voiceFile=path.join(dir,'host-v10','manifest.json');
  await fileRegular(rawFile,350000);
  await fileRegular(voiceFile,300000);
  const data=JSON.parse(await fs.readFile(rawFile,'utf8'));
  const story=validateStoryboard(data,topic,format);
  const voice=JSON.parse(await fs.readFile(voiceFile,'utf8'));
  validateVoiceManifest(voice,story);
  const durations=[];
  for(const entry of voice.scenes){
    const wav=path.join(dir,'host-v10',entry.output);
    await fileRegular(wav,250*1024*1024);
    const info=await probe(wav);
    if(!info.audio||info.audio.codec_name!=='pcm_s16le'||info.audio.channels!==1||
      Number(info.audio.sample_rate)!==24000||!Number.isFinite(info.duration)||
      info.duration<1||info.duration>116)stop('invalid Host V10 WAV format/duration');
    const approximated=entry.segments.reduce((a,s)=>a+s.duration,0);
    if(Math.abs(info.duration-approximated)>0.75)stop('WAV and chunk timing differ');
    durations.push(info.duration);
  }
  return {dir,story,voice,durations,title:packManifest.title};
}
async function renderCourseVideo(topic,format,{progress=()=>{}}={}){
  const {dir,story,voice,durations,title}=await readInputs(topic,format);
  await checkAssets();
  const completed=path.join(dir,'v4-video');
  try{await fs.lstat(completed);stop('video draft already exists; never overwrite');}
  catch(e){if(e.code!=='ENOENT')throw e;}
  const stage=await fs.mkdtemp(path.join(dir,'.video-building-'));
  const videoFiles=[],actualLengths=[];
  const env={...process.env,HYPERFRAMES_BROWSER_PATH:BROWSER,
    PRODUCER_LOW_MEMORY_MODE:'1',HF_HUB_OFFLINE:'1',TRANSFORMERS_OFFLINE:'1'};
  try{
    for(const [i,scene] of story.scenes.entries()){
      const length=Math.ceil((durations[i]+2.4)*24)/24;
      if(length>120)stop('scene duration over 120s; split narration into smaller scenes');
      progress('render_scene_'+(i+1));
      const folder=path.join(stage,'scene-'+String(i+1).padStart(2,'0'));
      await fs.mkdir(path.join(folder,'assets'),{recursive:true,mode:0o700});
      for(const name of FILES)await fs.copyFile(path.join(SOURCE,name),path.join(folder,name),require('node:fs').constants.COPYFILE_EXCL);
      await fs.copyFile(path.join(SOURCE,'assets','gsap.min.js'),
        path.join(folder,'assets','gsap.min.js'),require('node:fs').constants.COPYFILE_EXCL);
      const html=createSceneHTML(
        {name:scene.name,visual:story.scenes[i].visual},
        {topicTitle:title,duration:length}
      );
      await fs.writeFile(path.join(folder,'index.html'),html,{flag:'wx',mode:0o600});
      await fs.writeFile(path.join(folder,'meta.json'),JSON.stringify({
        id:topic+'-'+format+'-scene-'+String(i+1),name:title+' — '+scene.name,
        createdAt:new Date().toISOString()
      },null,2),{flag:'wx',mode:0o600});
      await fs.writeFile(path.join(folder,'scene.json'),JSON.stringify({
        slug:topic,chapter:story.topicId,subtitle:scene.name,
        intro_parts:{left:'Economics',right:format},intro_subtitle:scene.name,
        steps:[],caveat:'Academic review required',footer:'DigvijayEconLab',
        narration_lines:splitNarration(scene.text)
      },null,2),{flag:'wx',mode:0o600});
      const silent=path.join(folder,'silent.mp4');
      const lint=await run(HYPERFRAMES,['lint'],folder,90000,env);
      assertCleanHyperframesLint(lint);
      await run(HYPERFRAMES,[
        'render','.','--output',silent,'--format','mp4','--fps','24',
        '--resolution','landscape','--quality','looks','--workers','1',
        '--low-memory-mode','--no-browser-gpu','--experimental-fast-capture=false',
        '--browser-timeout','120','--protocol-timeout','300000','--strict'
      ],folder,720000,env);
      await fileRegular(silent,400*1024*1024);
      checkVideo(await probe(silent),false);
      const audio=path.join(dir,'host-v10',voice.scenes[i].output);
      const output=path.join(stage,'scene-'+String(i+1).padStart(2,'0')+'.mp4');
      await run('ffmpeg',[
        '-nostdin','-v','error','-n','-i',silent,'-i',audio,
        '-filter_complex','[1:a]adelay=1200:all=1,apad=pad_dur=120,atrim=0:'+length.toFixed(3)+'[a]',
        '-map','0:v:0','-map','[a]','-c:v','copy','-c:a','aac','-b:a','160k',
        '-t',length.toFixed(3),'-movflags','+faststart',output
      ],folder,120000,env);
      const p=await probe(output);
      checkVideo(p,true);
      if(Math.abs(p.duration-length)>0.2)stop('rendered clip length changed unexpectedly');
      actualLengths.push(p.duration);
      videoFiles.push(output);
      const preview=path.join(stage,'scene-'+String(i+1).padStart(2,'0')+'.png');
      await run('ffmpeg',['-nostdin','-v','error','-n',
        '-ss',String(Math.max(0.5,length/2)),'-i',output,'-frames:v','1',preview],
        folder,60000,env);
      await fileRegular(preview,15*1024*1024);
    }
    progress('assemble_video');
    const concatList=path.join(stage,'concat.txt');
    await fs.writeFile(concatList,
      videoFiles.map(x=>"file '"+path.basename(x)+"'").join('\n')+'\n',{flag:'wx',mode:0o600});
    const final=path.join(stage,'video.mp4');
    await run('ffmpeg',['-nostdin','-v','error','-n','-f','concat','-safe','1','-i',concatList,
      '-c','copy','-movflags','+faststart',final],stage,240000,env);
    const metadata=await probe(final);
    checkVideo(metadata,true,FINAL_LIMITS[format]);
    checkAssembledDuration(format,actualLengths,metadata.duration);
    const decodeTimeout=Math.min(1800000,Math.max(240000,Math.ceil(metadata.duration*1500)));
    await run('ffmpeg',['-nostdin','-v','error','-i',final,'-f','null','-'],stage,decodeTimeout,env);
    const srtText=captionsForScenes(voice,actualLengths);
    await fs.writeFile(path.join(stage,'captions.srt'),srtText,{flag:'wx',mode:0o600});
    const thumb=path.join(stage,'thumbnail.jpg');
    await run('ffmpeg',['-nostdin','-v','error','-n',
      '-ss',String(Math.max(.5,metadata.duration*.6)),'-i',final,
      '-frames:v','1','-vf','scale=1280:720','-q:v','2',thumb],
      stage,60000,env);
    await fileRegular(thumb,20*1024*1024);
    const manifest={
      schemaVersion:1,topicId:topic,format,source:'typed-economics-storyboards',
      scenes:story.scenes.length,videoDuration:metadata.duration,rendered:true,
      mp4:'video.mp4',thumbnail:'thumbnail.jpg',captions:'captions.srt',
      naturalHostV10ReviewRequired:true,academicClaimsAttested:false,
      mediaRightsReviewed:false,reviewRequired:true,
      publishingAuthorized:false,autoUpload:false,
      quality:{technicalDecodePass:true,humanVoiceReview:false,
        academicReview:false,videoReview:false,status:'review_required'}
    };
    await fs.writeFile(path.join(stage,'manifest.json'),
      JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
    try{await fs.lstat(completed);stop('completed video appeared concurrently');}
    catch(e){if(e.code!=='ENOENT')throw e;}
    await fs.rename(stage,completed);
    progress('review_required');
    return {output:completed,seconds:metadata.duration,publishingAuthorized:false};
  }catch(e){
    progress('failed');
    await fs.writeFile(path.join(stage,'FAILED.txt'),String(e.message).slice(0,600),{flag:'wx'}).catch(()=>{});
    throw e;
  }
}
module.exports={renderCourseVideo,validateVoiceManifest,captionsForScenes,srt,checkVideo,checkAssembledDuration,FINAL_LIMITS};
