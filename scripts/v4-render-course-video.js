'use strict';

// One explicit offline review draft only; separate from the production server.
const {renderCourseVideo}=require('../utils/v4-offline-course-renderer');
async function main(args){
  if(process.env.DVE_V4_NEW_VIDEO_ENABLED!=='true')
    throw Error('STOP: local V4 new-topic video render disabled; device QA and DVE_V4_NEW_VIDEO_ENABLED=true required');
  if(args.length!==2)
    throw Error('Usage: node scripts/v4-render-course-video.js <topic-slug> <long|medium|short>');
  const result=await renderCourseVideo(args[0],args[1],{
    progress:stage=>process.stdout.write('V4 STAGE: '+stage+'\n')
  });
  console.log(JSON.stringify(result,null,2));
  console.log('Review-only: independent academic, rights and voice checks remain required');
}
if(require.main===module)main(process.argv.slice(2)).catch(e=>{
  console.error('STOP:',e.message);process.exitCode=1;
});
module.exports={main};
