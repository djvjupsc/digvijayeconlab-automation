'use strict';

// Strictly offline and limited to the reviewed Demand/Supply pilot.
// No generic-topic substitution, TTS fallback, paid API, credentials access,
// uploads, Git operations, or publishing actions.
const fs = require('node:fs/promises');
const fssync = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const HOME = os.homedir();
const ROOT = path.join(HOME, 'digvijayeconlab-tools');
const ADAPTER = path.join(ROOT, 'dve-style-v4-adapter');
const SOURCE = path.join(ADAPTER, 'drafts', 'step196');
const EARLIER = path.join(ADAPTER, 'drafts', 'demand-supply-final-build-v1');
const PROJECT = path.resolve(__dirname, '..');
const OUTPUT_ROOT = path.join(PROJECT, 'data', 'v4-pilot');
const COMPLETED = path.join(OUTPUT_ROOT, 'demand-supply-v1');
const BROWSER = path.join(process.env.PREFIX || '/missing-termux-prefix', 'bin', 'chromium-browser');
const CLI = path.join(ROOT, 'hyperframes-cli', 'node_modules', '.bin', 'hyperframes');
const HOST = path.join(HOME, 'digvijayeconlab-automation', 'data', 'voices', '94ef2286-c02d-4d66-8690-051ab63b21f7.wav');
const APPROVED = path.join(ROOT, 'dve-style-v4', 'reviews', 'step163', 'v4-host-v10-approved-scene-10s.mp4');
const WAVS = [
  path.join(EARLIER, 'host-v10-line-1.wav'),
  path.join(EARLIER, 'host-v10-line-2.wav')
];

const PINNED = Object.freeze([
  [path.join(SOURCE, 'index.html'), '2929374e4d4f19d2715c09492484718c7a07bc03b8f2a2aed60fb2a5098ce807'],
  [path.join(SOURCE, 'digvijayeconlab-video-style.css'), '0dada425bac4d0df2bb61122eccb27bf4d92d01f75a41e55983266b19f36a2c4'],
  [path.join(SOURCE, 'assets', 'gsap.min.js'), '92bb9a96476f983d212a2bc4f54c889039c1696dd4461d40a736860938570fbb'],
  [APPROVED, 'cf3354cb10adec2de34c0805855a9895a31c7071afd56bc27e7842453ce3c4f7'],
  [HOST, '853e490009a5f5964ea402a8bbf8cfb3b58796596b13b296b5cd19235dd3c9a4'],
  [WAVS[0], '3e45c6b602b35ff18f62c1791bb73690df4a0ae15dd76e249d6cb05fd83506fd'],
  [WAVS[1], 'f895345b0fd90e2b4a9b8f7e0a8123470472196a702f69e45a5bca8e26ca4f38']
]);
const ASSETS = new Set(['video.mp4', 'thumbnail.jpg', 'frame-1.png', 'frame-2.png', 'frame-3.png', 'captions.srt', 'manifest.json']);
const RENDER_FILES = Object.freeze([
  'index.html',
  'digvijayeconlab-video-style.css',
  'assets/gsap.min.js',
  'scene.json', 'hyperframes.json', 'meta.json', 'package.json'
]);
const SPOKEN = Object.freeze([
  'कीमत बढ़ने पर माँग घटती और आपूर्ति बढ़ती है।',
  'वक्रों के मिलने पर संतुलन कीमत और मात्रा तय होती हैं।'
]);
const VIEWING_NOTE = 'The existing narration is not re-recorded. Its shorthand about demand/supply needs spoken-term review; on-screen P*/Q* clarifies quantity demanded/supplied. Publication is blocked.';

function isLocal(req) {
  const addr = String(req.socket?.remoteAddress || '');
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1' || /^127\./.test(addr);
}
async function isUnlinkedFile(file) {
  try { const stat = await fs.lstat(file); return stat.isFile() && !stat.isSymbolicLink(); }
  catch (_) { return false; }
}
async function sha256(file) {
  const data = await fs.readFile(file);
  return crypto.createHash('sha256').update(data).digest('hex');
}
async function requirePinned() {
  for (const [file, hash] of PINNED) {
    if (!await isUnlinkedFile(file)) throw Error('Missing or linked protected asset: ' + path.basename(file));
    if (await sha256(file) !== hash) throw Error('Protected asset hash mismatch: ' + path.basename(file));
  }
}
function srtTime(seconds) {
  const n = Math.round(seconds * 1000);
  const h = Math.floor(n / 3600000);
  const m = Math.floor(n / 60000) % 60;
  const s = Math.floor(n / 1000) % 60;
  const ms = n % 1000;
  return [h,m,s].map(x=>String(x).padStart(2,'0')).join(':') + ',' + String(ms).padStart(3,'0');
}
function narrationPlan(durations) {
  if (!Array.isArray(durations) || durations.length !== 2 || durations.some(d => !Number.isFinite(d) || d < .6 || d > 8)) {
    throw Error('Two verified Hindi narration durations are required');
  }
  const firstStart = 2.30;
  const secondStart = Math.max(5.85, firstStart + durations[0] + .16);
  const starts = [firstStart, secondStart];
  const ends = durations.map((v,i)=>starts[i]+v);
  if (ends[1] > 9.8 || ends[0] + .16 > starts[1]) throw Error('Narration cannot fit without shortening');
  return {starts,ends};
}
function toSRT(plan) {
  return SPOKEN.map((line,i)=>[i+1,srtTime(plan.starts[i])+' --> '+srtTime(plan.ends[i]),line,''].join('\n')).join('\n');
}
function withTimeout(binary, args, cwd, env, timeoutMs, log) {
  return new Promise((resolve,reject)=>{
    const child = spawn(binary,args,{
      cwd, env, shell:false,
      stdio:['ignore','pipe','pipe'],
      windowsHide:true
    });
    let tail = '';
    let finished = false;
    const timer = setTimeout(()=>{ child.kill('SIGKILL'); }, timeoutMs);
    function add(chunk) {
      const line = String(chunk);
      tail = (tail + line).slice(-18000);
      if (log) fssync.appendFileSync(log,line,{encoding:'utf8'});
    }
    child.stdout.on('data',add);
    child.stderr.on('data',add);
    child.once('error',err=>{
      if(finished)return;
      finished=true;clearTimeout(timer);reject(err);
    });
    child.once('close',(code,signal)=>{
      if(finished)return;
      finished=true;clearTimeout(timer);
      if(code===0)resolve(tail);
      else reject(Error(path.basename(binary)+' returned '+code+'/'+signal+': '+tail.slice(-1600)));
    });
  });
}
async function executable(file) {
  const st = await fs.stat(file); // Symlink launchers are valid when their targets are files.
  if (!st.isFile()) throw Error('Required executable missing: '+path.basename(file));
  await fs.access(file, fssync.constants.X_OK);
}
async function probeDuration(file) {
  const output=await withTimeout('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',file],PROJECT,process.env,30000);
  const n=Number(output.trim());
  if(!Number.isFinite(n))throw Error('FFprobe duration unavailable');
  return n;
}
async function probeVideo(file) {
  const output=await withTimeout('ffprobe',[
    '-v','error','-show_entries','format=duration:stream=codec_type,codec_name,width,height,r_frame_rate,nb_frames',
    '-of','json',file
  ],PROJECT,process.env,30000);
  const info=JSON.parse(output.slice(output.indexOf('{')));
  const videos=info.streams.filter(x=>x.codec_type==='video');
  const audios=info.streams.filter(x=>x.codec_type==='audio');
  const video=videos[0],audio=audios[0];
  if(videos.length!==1 || audios.length!==1 ||
     video.codec_name!=='h264' || video.width!==1920 || video.height!==1080 ||
     video.r_frame_rate!=='24/1' || Number(video.nb_frames)!==240 ||
     audio.codec_name!=='aac' ||
     Number(info.format.duration)<9.9 || Number(info.format.duration)>10.1) {
    throw Error('Final MP4 failed codec/dimension/duration quality gate');
  }
  return {duration:Number(info.format.duration),width:video.width,height:video.height,frames:240};
}
async function currentStatus() {
  try {
    const directory = await fs.lstat(COMPLETED).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
    if (!directory) return {state:'not_generated',publishingAuthorized:false};
    if(!directory.isDirectory() || directory.isSymbolicLink())return {state:'needs_attention',publishingAuthorized:false};
    if (!await isUnlinkedFile(path.join(COMPLETED,'manifest.json'))) return {state:'needs_attention',publishingAuthorized:false};
    const raw=JSON.parse(await fs.readFile(path.join(COMPLETED,'manifest.json'),'utf8'));
    if(raw.schemaVersion!==1 || raw.topicId!=='demand_supply_v1' || raw.publishingAuthorized!==false) {
      return {state:'needs_attention',publishingAuthorized:false};
    }
    for(const name of ['video.mp4','thumbnail.jpg','captions.srt','frame-1.png','frame-2.png','frame-3.png']) {
      if (!await isUnlinkedFile(path.join(COMPLETED,name))) return {state:'needs_attention',publishingAuthorized:false};
    }
    return {
      state:'review_required', publishingAuthorized:false,
      title:raw.title, quality:raw.quality,
      media:{
        video:'/api/v4-pilot/assets/video.mp4',
        thumbnail:'/api/v4-pilot/assets/thumbnail.jpg',
        captions:'/api/v4-pilot/assets/captions.srt',
        scenes:[1,2,3].map(i=>'/api/v4-pilot/assets/frame-'+i+'.png')
      }
    };
  } catch (_) {return {state:'needs_attention',publishingAuthorized:false};}
}
async function runPilot(progress=()=>{}) {
  const prior=await currentStatus();
  if (prior.state!=='not_generated') throw Error('Existing pilot must not be replaced');
  try { await fs.lstat(COMPLETED); throw Error('Pilot output already exists; preserving it'); }
  catch (e) { if(e.code!=='ENOENT') throw e; }
  await requirePinned();
  await executable(BROWSER);
  await executable(CLI);

  await fs.mkdir(OUTPUT_ROOT,{recursive:true,mode:0o700});
  const st=await fs.lstat(OUTPUT_ROOT);
  if(!st.isDirectory()||st.isSymbolicLink())throw Error('Unsafe output root');
  const temp=await fs.mkdtemp(path.join(OUTPUT_ROOT,'.building-'));
  const log=path.join(temp,'build.log');
  const report={schemaVersion:1,topicId:'demand_supply_v1',title:'मांग और आपूर्ति से बाजार संतुलन',format:'landscape_16_9',reviewRequired:true,publishingAuthorized:false,autoUpload:false,noFallback:true};
  try {
    progress('copy_verified_scene');
    await fs.mkdir(path.join(temp,'assets'),{recursive:true,mode:0o700});
    for(const name of RENDER_FILES){
      const src=path.join(SOURCE,name),dst=path.join(temp,name);
      if(!await isUnlinkedFile(src))throw Error('Unsafe template file: '+name);
      await fs.copyFile(src,dst,fssync.constants.COPYFILE_EXCL);
    }
    const env={...process.env,HYPERFRAMES_BROWSER_PATH:BROWSER,PRODUCER_LOW_MEMORY_MODE:'1'};
    progress('lint');
    const lint=await withTimeout(CLI,['lint'],temp,env,90000,log);
    if(!/0 error\(s\)/.test(lint))throw Error('Zero-error lint unconfirmed');

    progress('validate_voice');
    const durations=await Promise.all(WAVS.map(probeDuration));
    const plan=narrationPlan(durations);
    await fs.writeFile(path.join(temp,'captions.srt'),toSRT(plan),{flag:'wx'});

    progress('render_animation');
    const silent=path.join(temp,'silent.mp4');
    await withTimeout(CLI,[
      'render','.','--output',silent,'--format','mp4','--fps','24',
      '--resolution','landscape','--quality','looks','--workers','1',
      '--low-memory-mode','--no-browser-gpu','--experimental-fast-capture=false',
      '--browser-timeout','120','--protocol-timeout','300000','--strict'
    ],temp,env,720000,log);
    if(!await isUnlinkedFile(silent))throw Error('Animation render produced no MP4');

    progress('mix_narration');
    const output=path.join(temp,'video.mp4');
    const delays=plan.starts.map(x=>Math.round(x*1000));
    const filter='[1:a]aresample=24000,adelay='+delays[0]+':all=1[a1];' +
       '[2:a]aresample=24000,adelay='+delays[1]+':all=1[a2];' +
       '[a1][a2]amix=inputs=2:duration=longest:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,apad=pad_dur=10,atrim=0:10[a]';
    await withTimeout('ffmpeg',[
      '-nostdin','-hide_banner','-loglevel','error','-n',
      '-i',silent,'-i',WAVS[0],'-i',WAVS[1],
      '-filter_complex',filter,'-map','0:v:0','-map','[a]',
      '-c:v','copy','-c:a','aac','-b:a','160k','-t','10',
      '-movflags','+faststart',output
    ],temp,env,90000,log);
    report.media=await probeVideo(output);
    await withTimeout('ffmpeg',['-nostdin','-v','error','-i',output,'-f','null','-'],temp,env,90000,log);

    progress('capture_scene_previews');
    for(const [i,time] of [2.6,6.6,9.4].entries()){
      await withTimeout('ffmpeg',[
        '-nostdin','-v','error','-n','-ss',String(time),'-i',output,
        '-frames:v','1',path.join(temp,'frame-'+(i+1)+'.png')
      ],temp,env,60000,log);
    }
    await withTimeout('ffmpeg',[
      '-nostdin','-v','error','-n','-ss','9.4','-i',output,'-frames:v','1',
      '-vf','scale=1280:720', '-q:v','2',path.join(temp,'thumbnail.jpg')
    ],temp,env,60000,log);

    report.quality={
      animationRendered:true,voiceReferencePinned:true,voiceFilesReused:true,
      noPaidApi:true,captionTimingDerivedFromAudio:true,fullMediaDecodePass:true,
      humanVoiceReview:false,academicClaimsAttested:false,rightsReviewed:false,
      status:'review_required'
    };
    report.scenes=[
      {label:'Introduction',at:2.6,asset:'frame-1.png'},
      {label:'Demand and Supply',at:6.6,asset:'frame-2.png'},
      {label:'Equilibrium P* Q*',at:9.4,asset:'frame-3.png'}
    ];
    report.narrationReviewNote=VIEWING_NOTE;
    report.narrationCues=plan.starts.map((start,i)=>({start,end:plan.ends[i],text:SPOKEN[i]}));
    await requirePinned();
    for(const filename of ['video.mp4','captions.srt','thumbnail.jpg','frame-1.png','frame-2.png','frame-3.png']){
      if(!await isUnlinkedFile(path.join(temp,filename)))throw Error('Missing finished media: '+filename);
    }
    await fs.writeFile(path.join(temp,'manifest.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    if(await isUnlinkedFile(path.join(COMPLETED,'manifest.json')))throw Error('Completed pilot appeared concurrently');
    // First-to-complete wins. Never replace an existing approved/review asset.
    await fs.rename(temp,COMPLETED);
    progress('review_required');
    return await currentStatus();
  } catch(e){
    progress('failed');
    await fs.writeFile(path.join(temp,'failure.txt'),String(e.message).slice(0,4000)+'\n',{flag:'wx'}).catch(()=>{});
    throw e;
  }
}
function mountV4Pilot(app,requireAPIKey) {
  let running=false,stage='idle',error=null;
  app.get('/api/v4-pilot/status',async(req,res)=>{
    if(!isLocal(req))return res.status(403).json({error:'Local-only'});
    const completed=await currentStatus();
    return res.json({...completed,stage,error,runnerAvailable:process.env.DVE_V4_PILOT_ENABLED==='true',running,publishingAuthorized:false});
  });
  app.post('/api/v4-pilot/generate',requireAPIKey,async(req,res)=>{
    if(!isLocal(req))return res.status(403).json({error:'Local-only'});
    if(!process.env.API_KEY) return res.status(503).json({error:'API_KEY must be configured for generation'});
    if(process.env.DVE_V4_PILOT_ENABLED!=='true')return res.status(503).json({error:'Local pilot disabled; device readiness not attested'});
    if(running) return res.status(409).json({error:'V4 pilot already running'});
    const existing=await currentStatus();
    if(existing.state!=='not_generated')return res.status(409).json({error:'V4 pilot already exists; no overwrite'});
    running=true;stage='queued';error=null;
    res.status(202).json({accepted:true,state:'queued',publishingAuthorized:false});
    setImmediate(()=>{
      runPilot(s=>{stage=s;}).catch(e=>{error=String(e.message).slice(0,300);stage='failed';})
        .finally(()=>{running=false;});
    });
  });
  app.get('/api/v4-pilot/assets/:name',async(req,res)=>{
    if(!isLocal(req))return res.status(403).end();
    const name=String(req.params.name||'');
    if(!ASSETS.has(name))return res.status(404).end();
    if((await currentStatus()).state!=='review_required')return res.status(404).end();
    try{
      const file=path.join(COMPLETED,name);
      if(!await isUnlinkedFile(file))return res.status(404).end();
      res.setHeader('Cache-Control','private, no-store');
      res.setHeader('X-Content-Type-Options','nosniff');
      return res.sendFile(file);
    } catch(_){return res.status(404).end();}
  });
}
module.exports={mountV4Pilot,runPilot,narrationPlan,toSRT,currentStatus,isLocal};
