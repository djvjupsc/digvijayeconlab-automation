'use strict';

// The installed local HyperFrames CLI prints "◇  0 errors, 0 warnings".
// Earlier integration mistakenly expected literal "0 error(s)", thus stopping
// even after a clean exit. This parser is intentionally fail-closed: a clean
// subprocess exit AND an explicit, unambiguous zero-errors/zero-warnings
// summary are needed before a real render may begin.
function isCleanHyperframesLint(output){
  if(typeof output!=='string'||output.length===0||output.length>1000000)return false;
  const sanitized=output.replace(/\x1b\[[0-9;]*m/g,'');
  const lines=sanitized.split(/\r?\n/u).map(s=>s.trim()).filter(Boolean);
  const matches=[];
  for(const line of lines){
    const match=line.match(/^[◇◆]?\s*(\d+)\s+error(?:s|\(s\))?,\s*(\d+)\s+warning(?:s|\(s\))?$/iu);
    if(match)matches.push(match);
    if(/^[✗×]\s/u.test(line))return false;
  }
  return matches.length===1&&matches[0][1]==='0'&&matches[0][2]==='0';
}
function assertCleanHyperframesLint(output){
  if(!isCleanHyperframesLint(output)){
    const diagnostic=typeof output==='string'?output.slice(-3500):String(output);
    throw Error('V4_HYPERFRAMES_LINT: clean zero-errors/zero-warnings summary not confirmed: '+diagnostic);
  }
  return true;
}
module.exports={isCleanHyperframesLint,assertCleanHyperframesLint};
