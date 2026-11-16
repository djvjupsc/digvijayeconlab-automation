'use strict';

// Explicit opt-in only. No server route, cron, scheduler or YouTube upload.
// A separate device QA must approve any rendered WAV before video production.
const {runHostV10}=require('../utils/v4-host-v10-voice-queue');

async function main(args){
  if(process.env.DVE_V4_NEW_VOICE_ENABLED!=='true')
    throw Error('STOP: local V4 Host V10 production disabled; set DVE_V4_NEW_VOICE_ENABLED=true only after device checks');
  if(args.length!==2)
    throw Error('Usage: node scripts/v4-render-host-v10.js <topic-slug> <long|medium|short>');
  const [topic,format]=args;
  const result=await runHostV10(topic,format);
  console.log(JSON.stringify(result,null,2));
  console.log('REVIEW REQUIRED: listen for natural Hindi, pronunciation, clipping and scene continuity');
  console.log('NO YOUTUBE UPLOAD / NO PUBLICATION AUTHORIZATION');
}
if(require.main===module)main(process.argv.slice(2)).catch(e=>{
  console.error('STOP:',e.message);process.exitCode=1;
});
module.exports={main};
