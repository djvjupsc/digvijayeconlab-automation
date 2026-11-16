'use strict';

// Device-only, opt-in Host V10 rendering from reviewed storyboards. No API,
// remote model, eSpeak, reference mutation, scheduler, or publishing fallback.
// Never replaces an existing WAV or other user output.
const fs=require('node:fs/promises');
const fssync=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const readline=require('node:readline');
const {validateVisual}=require('../scripts/v4-offline-course-pack');

const HOME=os.homedir();
const PROJECT=path.join(HOME,'digvijayeconlab-automation');
const ROOT=path.join(PROJECT,'data','v4-course-drafts');
const HOST=path.join(PROJECT,'data','voices','94ef2286-c02d-4d66-8690-051ab63b21f7.wav');
const WORKER=path.join(PROJECT,'scripts','jugnu_tts_worker.py');
const PINNED={
  host:'853e490009a5f5964ea402a8bbf8cfb3b58796596b13b296b5cd19235dd3c9a4',
  worker:'9f5ebd741189c4320cb9c4f6109142da1bea626024dfb3370b711996df0b0a7b'
};
const TOPIC=/^[a-z][a-z0-9-]{2,63}$/;
const FORMATS=new Set(['long','medium','short']);
function stop(message){throw Error('V4_HOST_V10: '+message);}
function words(text){return String(text).trim().split(/\s+/u).filter(Boolean);}
function splitNarration(text,maxWords=12){
  if(typeof text!=='string'||!text.trim()||text.length>24000)stop('narration must contain bounded text');
  if(!Number.isSafeInteger(maxWords)||maxWords<8||maxWords>18)stop('invalid chunk limit');
  const tokens=words(text);
  if(tokens.some(t=>t.length>100))stop('oversize narration word');
  const chunks=[];
  let current=[];
  for(const token of tokens){
    current.push(token);
    const atBoundary=/[।!?]$/u.test(token);
    if(current.length>=maxWords || (current.length>=8 && atBoundary)){
      chunks.push(current.join(' '));current=[];
    }
  }
  if(current.length){
    // Avoid a one-word final request when possible.
    if(current.length<3 && chunks.length && words(chunks[chunks.length-1]).length+current.length<=18)
      chunks[chunks.length-1]+=' '+current.join(' ');
    else chunks.push(current.join(' '));
  }
  return chunks;
}
function validateStoryboard(data,topicId,format){
  if(!TOPIC.test(topicId)||!FORMATS.has(format))stop('invalid topic or format');
  if(!data||data.schemaVersion!==1||data.topicId!==topicId||data.format!==format||data.publishingAuthorized!==false)
    stop('expected unpublished V4 course storyboard');
  if(!Array.isArray(data.scenes)||!data.scenes.length||data.scenes.length>24)stop('invalid scenes');
  if(!Array.isArray(data.voiceQueue)||data.voiceQueue.length!==data.scenes.length)stop('incomplete Host V10 queue');
  const limits={long:[1050,1500],medium:[400,650],short:[75,140]};
  const textWords=data.scenes.reduce((sum,s)=>sum+words(s.narration).length,0);
  if(textWords<limits[format][0]||textWords>limits[format][1]||data.words!==textWords)
    stop('script length differs from approved profile');
  const scenes=data.scenes.map((s,i)=>{
    const q=data.voiceQueue[i];
    if(!s||!q||s.index!==i+1||q.scene!==i+1||q.speaker!=='host-v10'||
       q.text!==s.narration||q.voiceSynthesisVerified!==false||q.requestedWav!==null ||
       !Array.isArray(s.claimIds)||!s.claimIds.length||!s.visual||typeof s.name!=='string'||
       s.audioFile!==null||s.reviewRequired!==true)stop('scene/voice queue mismatch');
    return {index:i+1,text:s.narration,chunks:splitNarration(s.narration),
      name:s.name,visual:validateVisual(s.visual,'V4_SCENE_'+(i+1))};
  });
  return {topicId,format,scenes};
}
async function sha(file,expected){
  const st=await fs.lstat(file);
  if(!st.isFile()||st.isSymbolicLink())stop('protected input missing or linked');
  const actual=crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
  if(actual!==expected)stop('protected input hash mismatch: '+path.basename(file));
}
function checkedProcess(binary,args,opts,timeout){
  return new Promise((resolve,reject)=>{
    const child=spawn(binary,args,{...opts,shell:false,stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='',done=false;
    const timer=setTimeout(()=>child.kill('SIGKILL'),timeout);
    child.stdout.on('data',b=>{stdout=(stdout+String(b)).slice(-12000);});
    child.stderr.on('data',b=>{stderr=(stderr+String(b)).slice(-4000);});
    function finish(err){if(done)return;done=true;clearTimeout(timer);err?reject(err):resolve(stdout);}
    child.once('error',finish);
    child.once('close',(code,signal)=>finish(code===0?null:Error('Local command failed: '+String(code)+'/'+String(signal)+' '+stderr.slice(-180))));
  });
}

// Match the owner's known working Termux adapter's native Pocket TTS and
// SentencePiece search paths. The bootstrap reader_high voice is deliberately
// distinct from the pinned Host V10 voice used for EVERY inference request:
// the Python worker loads its bootstrap voice without truncation, whereas its
// per-request reference path uses get_state_for_audio_prompt(..., truncate=True).
function buildJugnuWorkerEnv(reference=HOST,base=process.env){
  if(typeof reference!=='string'||!reference.trim())stop('missing Host V10 reference');
  const env={...base};
  const pythonPaths=[
    path.join(HOME,'jugnu-pocket-tts-test','pydantic-python-test'),
    path.join(HOME,'sentencepiece-build-test','python-extension-test'),
    env.PYTHONPATH
  ];
  env.PYTHONPATH=pythonPaths.filter(Boolean).join(path.delimiter);
  const libraryPaths=[
    path.join(HOME,'sentencepiece-build-test','build-pic','src'),
    env.PREFIX ? path.join(env.PREFIX,'lib') : null,
    env.LD_LIBRARY_PATH
  ];
  env.LD_LIBRARY_PATH=libraryPaths.filter(Boolean).join(path.delimiter);
  env.OMP_NUM_THREADS=env.OMP_NUM_THREADS||'2';
  env.MKL_NUM_THREADS=env.MKL_NUM_THREADS||'2';
  env.JUGNU_MODEL_CONFIG=env.JUGNU_TTS_CONFIG||
    path.join(HOME,'jugnu-pocket-tts-test','downloads','config.local.yaml');
  env.JUGNU_REFERENCE_AUDIO=env.JUGNU_TTS_REFERENCE||
    path.join(HOME,'jugnu-pocket-tts-inspect','docs','audio','voices','reader_high.mp3');
  env.JUGNU_WORKER_IDLE_SECONDS=env.JUGNU_TTS_IDLE_TIMEOUT_SECONDS||'120';
  env.HF_HUB_OFFLINE='1';
  env.TRANSFORMERS_OFFLINE='1';
  env.PYTHONUNBUFFERED='1';
  return env;
}
function termuxPython(base=process.env){
  return base.JUGNU_TTS_PYTHON ||
    path.join(base.PREFIX||'/data/data/com.termux/files/usr','bin','python3.14');
}

class JugnuClient {
  constructor({python=termuxPython(),worker=WORKER,reference=HOST,timeoutMs=900000}={}){
    this.python=python;this.worker=worker;this.reference=reference;this.timeoutMs=timeoutMs;
    this.child=null;this.lines=null;this.pending=null;this.ready=false;this.readyPending=null;
  }
  async start(){
    if(this.child)stop('worker already started');
    const env=buildJugnuWorkerEnv(this.reference);
    const child=spawn(this.python,[this.worker],{
      cwd:PROJECT,env,shell:false,stdio:['pipe','pipe','pipe']
    });
    this.child=child;
    let stderr='';
    child.stderr.on('data',b=>{stderr=(stderr+String(b)).slice(-1000);});
    child.once('error',e=>this.rejectAll(e));
    child.once('close',(code)=>this.rejectAll(Error('Jugnu exited '+code+' '+stderr.slice(-150))));
    this.lines=readline.createInterface({input:child.stdout});
    this.lines.on('line',line=>{
      let msg;
      try{msg=JSON.parse(line);}
      catch(_){this.rejectAll(Error('Malformed Jugnu JSON reply'));return;}
      if(!this.ready){
        if(msg.ready===true && msg.sample_rate===24000){
          this.ready=true;
          if(this.readyPending){this.readyPending.resolve(msg);this.readyPending=null;}
        }else if(msg.ready===false)this.rejectAll(Error('Jugnu startup rejected'));
        return;
      }
      if(this.pending){
        const p=this.pending;this.pending=null;clearTimeout(p.timer);
        if(typeof msg.error==='string')p.reject(Error('Jugnu inference rejected'));
        else p.resolve(msg);
      }
    });
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.rejectAll(Error('Jugnu startup timeout'));},180000);
      this.readyPending={
        resolve:m=>{clearTimeout(timer);resolve(m);},
        reject:e=>{clearTimeout(timer);reject(e);}
      };
    });
  }
  rejectAll(error){
    if(this.readyPending){this.readyPending.reject(error);this.readyPending=null;}
    if(this.pending){clearTimeout(this.pending.timer);this.pending.reject(error);this.pending=null;}
    this.ready=false;
  }
  async generate(text,output){
    if(!this.ready||!this.child||this.pending)stop('Jugnu worker unavailable/busy');
    if(await fs.stat(output).then(()=>true,e=>e.code==='ENOENT'?false:Promise.reject(e)))stop('WAV target exists');
    const promise=new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{
        this.rejectAll(Error('Jugnu inference timeout'));
        this.child.kill('SIGKILL');
      },this.timeoutMs);
      this.pending={resolve,reject,timer};
      this.child.stdin.write(JSON.stringify({
        text,output_path:output,reference_audio:this.reference
      })+'\n',e=>{
        if(e)this.rejectAll(e);
      });
    });
    const result=await promise;
    if(result.output_path!==output || result.sample_rate!==24000 ||
       !Number.isFinite(result.duration)||result.duration<=0||result.duration>90 ||
       !Number.isSafeInteger(result.size)||result.size<44)stop('unexpected Jugnu result metadata');
    const st=await fs.lstat(output);
    if(!st.isFile()||st.isSymbolicLink()||st.size!==result.size)stop('inconsistent WAV output');
    const fd=await fs.open(output,'r');
    try{
      const head=Buffer.alloc(44);
      await fd.read(head,0,44,0);
      if(head.toString('ascii',0,4)!=='RIFF'||head.toString('ascii',8,12)!=='WAVE'||head.readUInt32LE(24)!==24000)
        stop('invalid WAV header');
    }finally{await fd.close();}
    return {duration:result.duration,size:result.size};
  }
  async close(){
    if(!this.child)return;
    const child=this.child;this.child=null;this.ready=false;
    try{child.stdin.end();}catch(_){}
    if(child.exitCode===null)child.kill('SIGTERM');
    this.lines?.close();
  }
}
async function source(root,topic,format){
  if(!TOPIC.test(topic)||!FORMATS.has(format))stop('invalid folder selector');
  const dir=path.join(root,topic,format);
  let cur=await fs.realpath(root);
  for(const part of [topic,format]){
    const file=path.join(cur,part);
    const stat=await fs.lstat(file);
    if(!stat.isDirectory()||stat.isSymbolicLink())stop('unsafe storyboard folder');
    cur=file;
  }
  const file=path.join(dir,'storyboard.json');
  const st=await fs.lstat(file);
  if(!st.isFile()||st.isSymbolicLink()||st.size>350000)stop('unsafe storyboard file');
  return {dir,story:validateStoryboard(JSON.parse(await fs.readFile(file,'utf8')),topic,format)};
}
async function runHostV10(topic,format,{root=ROOT,clientFactory=()=>new JugnuClient()}={}){
  const {dir,story}=await source(root,topic,format);
  await sha(HOST,PINNED.host);
  await sha(WORKER,PINNED.worker);
  const output=path.join(dir,'host-v10');
  try{await fs.lstat(output);stop('voice output already exists; no overwrite');}
  catch(e){if(e.code!=='ENOENT')throw e;}
  const staging=await fs.mkdtemp(path.join(dir,'.voice-building-'));
  let client=null;
  try{
    client=clientFactory();
    if(!client || typeof client.start!=='function'||typeof client.generate!=='function'||typeof client.close!=='function')
      stop('invalid local Jugnu interface');
    await client.start();
    const manifest={schemaVersion:1,topicId:topic,format,
      voice:'host-v10',referenceSha256:PINNED.host,
      voiceQualityReviewed:false,publishingAuthorized:false,autoUpload:false,scenes:[]};
    for(const scene of story.scenes){
      const folder=path.join(staging,'scene-'+String(scene.index).padStart(2,'0'));
      await fs.mkdir(folder,{mode:0o700});
      const clips=[];
      for(let i=0;i<scene.chunks.length;i++){
        const name='chunk-'+String(i+1).padStart(3,'0')+'.wav';
        const outputFile=path.join(folder,name);
        const meta=await client.generate(scene.chunks[i],outputFile);
        clips.push({name,duration:meta.duration,size:meta.size});
      }
      const concat=clips.map(c=>"file '"+c.name+"'").join('\n')+'\n';
      const list=path.join(folder,'concat.txt');
      await fs.writeFile(list,concat,{flag:'wx',mode:0o600});
      const sceneOut=path.join(staging,'scene-'+String(scene.index).padStart(2,'0')+'.wav');
      await checkedProcess('ffmpeg',['-nostdin','-v','error','-n','-f','concat','-safe','1','-i',list,
        '-ac','1','-ar','24000','-c:a','pcm_s16le',sceneOut],
        {cwd:folder,env:process.env},180000);
      const result=await fs.lstat(sceneOut);
      if(!result.isFile()||result.size<1000)stop('scene voice concatenation failed');
      manifest.scenes.push({index:scene.index,output:path.basename(sceneOut),
        chunks:clips.length,estimatedDuration:clips.reduce((s,c)=>s+c.duration,0),
        segments:clips.map((c,i)=>({text:scene.chunks[i],duration:c.duration})),
        userVoiceReviewRequired:true});
    }
    await fs.writeFile(path.join(staging,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',
      {flag:'wx',mode:0o600});
    try{await fs.lstat(output);stop('voice output appeared during production');}
    catch(e){if(e.code!=='ENOENT')throw e;}
    await fs.rename(staging,output);
    return {output,scenes:story.scenes.length,publishingAuthorized:false,reviewRequired:true};
  }catch(e){
    await fs.writeFile(path.join(staging,'FAILED.txt'),String(e.message).slice(0,500),
      {flag:'wx',mode:0o600}).catch(()=>{});
    throw e;
  }finally{
    if(client)await client.close().catch(()=>{});
  }
}
module.exports={splitNarration,validateStoryboard,JugnuClient,runHostV10,PINNED,buildJugnuWorkerEnv,termuxPython};
