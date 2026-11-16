'use strict';

// Explicit, one-time, review-only Android smoke check for the *new generic*
// V4 scene compositor. Uses a different topic and typed nodes, never reuses
// the fixed Demand/Supply visual or touches its approved artifacts.
// NO TTS, inference, YouTube, scheduler, credentials, or networking.
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {createSceneHTML}=require('../utils/v4-generic-scene-html');
const {assertCleanHyperframesLint}=require('../utils/v4-hyperframes-lint');

const HOME=os.homedir();
const PROJECT=path.join(HOME,'digvijayeconlab-automation');
const TEMPLATE=path.join(HOME,'digvijayeconlab-tools','dve-style-v4-adapter','drafts','step196');
const CLI=path.join(HOME,'digvijayeconlab-tools','hyperframes-cli','node_modules','.bin','hyperframes');
const BROWSER=path.join(process.env.PREFIX||'/missing-termux-prefix','bin','chromium-browser');
const ROOT=path.join(PROJECT,'data','v4-scene-smoke');
const FINAL=path.join(ROOT,'economics-flow-v1');
const PINNED_GSAP='92bb9a96476f983d212a2bc4f54c889039c1696dd4461d40a736860938570fbb';
const PINNED_CSS='0dada425bac4d0df2bb61122eccb27bf4d92d01f75a41e55983266b19f36a2c4';
const SCENE=Object.freeze({
  name:'उत्पादन, आय और व्यय का सरल प्रवाह',
  visual:{type:'flow',title:'आर्थिक गतिविधियों का अवधारणात्मक प्रवाह',
    nodes:['उत्पादन','आय','व्यय']}
});
function fail(msg){throw Error('V4_SCENE_SMOKE: '+msg);}
function noSymlink(stat){return stat.isFile()&&!stat.isSymbolicLink();}
async function checkFile(file,max=12*1024*1024){
  const stat=await fs.lstat(file);
  if(!noSymlink(stat)||stat.size<1||stat.size>max)fail('unsafe source: '+path.basename(file));
  return stat;
}
async function checkHash(file,expected){
  await checkFile(file);
  const actual=crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
  if(actual!==expected)fail('source hash mismatch: '+path.basename(file));
}
async function executable(file){
  const stat=await fs.stat(file); // CLI launchers may legitimately be symlinks.
  if(!stat.isFile())fail('executable missing: '+path.basename(file));
  await fs.access(file,require('node:fs').constants.X_OK);
}
async function command(binary,args,cwd,timeout=720000,env=process.env){
  return new Promise((resolve,reject)=>{
    let finished=false,out='';
    const child=spawn(binary,args,{cwd,env,shell:false,stdio:['ignore','pipe','pipe']});
    const timer=setTimeout(()=>child.kill('SIGKILL'),timeout);
    const add=b=>{out=(out+String(b)).slice(-8000);};
    child.stdout.on('data',add);child.stderr.on('data',add);
    function finish(error){
      if(finished)return;
      finished=true;
      clearTimeout(timer);
      error?reject(error):resolve(out);
    }
    child.once('error',finish);
    child.once('close',(code,signal)=>finish(code===0?null:Error(
      'local '+path.basename(binary)+' exit '+code+'/'+signal+': '+out.slice(-6500))));
  });
}
function checkedInfo(info){
  const videos=(info.streams||[]).filter(s=>s.codec_type==='video');
  const audios=(info.streams||[]).filter(s=>s.codec_type==='audio');
  const d=Number(info.format?.duration);
  if(videos.length!==1||audios.length!==0||
    videos[0].codec_name!=='h264'||videos[0].width!==1920||
    videos[0].height!==1080||videos[0].r_frame_rate!=='24/1'||
    !Number.isFinite(d)||d<9.7||d>10.3)fail('invalid silent review MP4 streams/duration');
  return {duration:d,width:videos[0].width,height:videos[0].height,silent:true};
}
async function renderScene({progress=()=>{}}={}){
  if(process.env.DVE_V4_SCENE_SMOKE_ENABLED!=='true')
    fail('disabled; requires explicit DVE_V4_SCENE_SMOKE_ENABLED=true');
  const root=path.join(PROJECT,'data');
  const st=await fs.lstat(root);
  if(!st.isDirectory()||st.isSymbolicLink())fail('unsafe project data directory');
  const src=await fs.lstat(TEMPLATE);
  if(!src.isDirectory()||src.isSymbolicLink())fail('unsafe template directory');
  await checkHash(path.join(TEMPLATE,'assets','gsap.min.js'),PINNED_GSAP);
  await checkHash(path.join(TEMPLATE,'digvijayeconlab-video-style.css'),PINNED_CSS);
  for(const file of ['hyperframes.json','meta.json','package.json'])await checkFile(path.join(TEMPLATE,file),1024*1024);
  await executable(CLI);await executable(BROWSER);
  try{
    const prior=await fs.lstat(ROOT);
    if(!prior.isDirectory()||prior.isSymbolicLink())fail('unsafe smoke output root');
  }catch(e){
    if(e.code!=='ENOENT')throw e;
    await fs.mkdir(ROOT,{mode:0o700});
  }
  try{await fs.lstat(FINAL);fail('prior smoke output exists; refusing overwrite');}
  catch(e){if(e.code!=='ENOENT')throw e;}
  const temp=await fs.mkdtemp(path.join(ROOT,'.building-'));
  try{
    await fs.mkdir(path.join(temp,'assets'),{mode:0o700});
    for(const file of ['hyperframes.json','package.json','digvijayeconlab-video-style.css']){
      await fs.copyFile(path.join(TEMPLATE,file),path.join(temp,file),require('node:fs').constants.COPYFILE_EXCL);
    }
    await fs.copyFile(path.join(TEMPLATE,'assets','gsap.min.js'),
      path.join(temp,'assets','gsap.min.js'),require('node:fs').constants.COPYFILE_EXCL);
    const html=createSceneHTML(SCENE,{topicTitle:'अर्थव्यवस्था का बुनियादी प्रवाह',duration:10});
    await fs.writeFile(path.join(temp,'index.html'),html,{flag:'wx',mode:0o600});
    await fs.writeFile(path.join(temp,'scene.json'),JSON.stringify({
      slug:'economics-flow-v1',chapter:'अर्थशास्त्र का परिचय',
      subtitle:SCENE.name,
      intro_parts:{left:'उत्पादन',right:'आय'},
      intro_subtitle:'सिर्फ एक अवधारणात्मक चित्र',
      steps:[
        {eyebrow:'अध्ययन',title:'उत्पादन',body:'उत्पादन की भूमिका',icon:'📊'},
        {eyebrow:'अध्ययन',title:'आय',body:'आय की भूमिका',icon:'₹'},
        {eyebrow:'अध्ययन',title:'व्यय',body:'व्यय की भूमिका',icon:'🧾'}
      ],
      caveat:'अवधारणात्मक परीक्षण, स्रोत और व्याख्या की समीक्षा बाकी',
      footer:'DigvijayEconLab',narration_lines:[]
    },null,2)+'\n',{flag:'wx',mode:0o600});
    await fs.writeFile(path.join(temp,'meta.json'),JSON.stringify({
      id:'economics-flow-v1',name:'V4 isolated generic concept-flow smoke',
      createdAt:new Date().toISOString()
    },null,2)+'\n',{flag:'wx',mode:0o600});
    const env={...process.env,HYPERFRAMES_BROWSER_PATH:BROWSER,
      PRODUCER_LOW_MEMORY_MODE:'1'};
    progress('offline_lint');
    const lint=await command(CLI,['lint'],temp,90000,env);
    assertCleanHyperframesLint(lint);
    progress('render_dynamic_scene');
    const video=path.join(temp,'video.mp4');
    await command(CLI,[
      'render','.','--output',video,'--format','mp4','--fps','24',
      '--resolution','landscape','--quality','looks','--workers','1',
      '--low-memory-mode','--no-browser-gpu',
      '--experimental-fast-capture=false',
      '--browser-timeout','120','--protocol-timeout','300000','--strict'
    ],temp,720000,env);
    await checkFile(video,400*1024*1024);
    progress('check_video_streams');
    const probe=await command('ffprobe',[
      '-v','error','-show_entries',
      'format=duration:stream=codec_type,codec_name,width,height,r_frame_rate',
      '-of','json',video
    ],temp,45000,env);
    const parsed=JSON.parse(probe.slice(probe.indexOf('{')));
    const videoInfo=checkedInfo(parsed);
    await command('ffmpeg',['-nostdin','-v','error','-i',video,'-f','null','-'],temp,120000,env);
    progress('capture_preview');
    await command('ffmpeg',[
      '-nostdin','-v','error','-n','-ss','6','-i',video,
      '-frames:v','1',path.join(temp,'preview.png')
    ],temp,45000,env);
    await checkFile(path.join(temp,'preview.png'),20*1024*1024);
    const report={
      schemaVersion:1,topicId:'economics-flow-v1',
      title:'अर्थव्यवस्था का बुनियादी प्रवाह',
      format:'landscape_16_9',genre:'generic-flow-animation-smoke',
      technicalQA:{...videoInfo,decoded:true,preview:true},
      narrationGenerated:false,voiceReviewRequired:true,
      academicReviewRequired:true,rightsReviewRequired:true,
      publicationAuthorized:false,publishingAuthorized:false,autoUpload:false,
      reviewRequired:true,status:'review_required'
    };
    await fs.writeFile(path.join(temp,'manifest.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
    try{await fs.lstat(FINAL);fail('output appeared concurrently');}
    catch(e){if(e.code!=='ENOENT')throw e;}
    await fs.rename(temp,FINAL);
    progress('review_required');
    return {output:FINAL,video:path.join(FINAL,'video.mp4'),
      preview:path.join(FINAL,'preview.png'),duration:videoInfo.duration,
      publishingAuthorized:false,voiceGenerated:false};
  }catch(e){
    await fs.writeFile(path.join(temp,'FAILED.txt'),String(e.message).slice(0,1500)+'\n',
      {flag:'wx',mode:0o600}).catch(()=>{});
    progress('failed');
    throw e;
  }
}
if(require.main===module)renderScene({
  progress:stage=>console.log('V4 STEP: '+stage)
}).then(x=>console.log(JSON.stringify(x,null,2))).catch(e=>{
  console.error('STOP:',e.message);process.exitCode=1;
});
module.exports={renderScene,checkedInfo,SCENE};
