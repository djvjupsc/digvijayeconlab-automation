'use strict';

// Read-only loopback readiness dashboard. Never runs third-party programs,
// TTS, media generation, uploads, Git commands, or shell code.
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const HOME = os.homedir();
const ROOT = path.join(HOME, 'digvijayeconlab-tools');
const TOOLS = path.join(ROOT, 'dve-style-v4-adapter');
const MAIN = path.join(HOME, 'digvijayeconlab-automation');

const INPUTS = [
  { id: 'v4_html', title: 'V4 isolated scene source', file: path.join(TOOLS, 'drafts', 'step196', 'index.html'), sha: '2929374e4d4f19d2715c09492484718c7a07bc03b8f2a2aed60fb2a5098ce807' },
  { id: 'v4_css', title: 'V4 approved stylesheet', file: path.join(TOOLS, 'drafts', 'step196', 'digvijayeconlab-video-style.css'), sha: '0dada425bac4d0df2bb61122eccb27bf4d92d01f75a41e55983266b19f36a2c4' },
  { id: 'local_gsap', title: 'Local GSAP runtime', file: path.join(TOOLS, 'drafts', 'step196', 'assets', 'gsap.min.js'), sha: '92bb9a96476f983d212a2bc4f54c889039c1696dd4461d40a736860938570fbb' },
  { id: 'approved_video', title: 'Approved Repo Rate reference', file: path.join(ROOT, 'dve-style-v4', 'reviews', 'step163', 'v4-host-v10-approved-scene-10s.mp4'), sha: 'cf3354cb10adec2de34c0805855a9895a31c7071afd56bc27e7842453ce3c4f7' },
  { id: 'host_v10', title: 'Host V10 protected voice reference', file: path.join(MAIN, 'data', 'voices', '94ef2286-c02d-4d66-8690-051ab63b21f7.wav'), sha: '853e490009a5f5964ea402a8bbf8cfb3b58796596b13b296b5cd19235dd3c9a4' }
];
const RUNNERS = [
  { id: 'chromium', title: 'Local Chromium', file: path.join(process.env.PREFIX || '/nonexistent', 'bin', 'chromium-browser') },
  { id: 'hyperframes', title: 'HyperFrames CLI', file: path.join(ROOT, 'hyperframes-cli', 'node_modules', '.bin', 'hyperframes') },
  { id: 'jugnu_worker', title: 'Local Jugnu TTS worker', file: path.join(MAIN, 'scripts', 'jugnu_tts_worker.py') }
];

function isLocal(req) {
  const s = String(req.socket.remoteAddress || '');
  return s === '::1' || s === '127.0.0.1' || s === '::ffff:127.0.0.1' || /^127\./.test(s);
}
async function verifySource(entry) {
  try {
    const stat = await fs.lstat(entry.file);
    if (!stat.isFile() || stat.isSymbolicLink()) return {id:entry.id, label:entry.title, status:'blocked', reason:'File missing or is a symlink'};
    const contents = await fs.readFile(entry.file);
    const hash = crypto.createHash('sha256').update(contents).digest('hex');
    return {
      id:entry.id, label:entry.title,
      status:hash===entry.sha ? 'verified' : 'blocked',
      reason:hash===entry.sha ? 'Pinned file verified' : 'File changed; review required'
    };
  } catch (_) { return {id:entry.id,label:entry.title,status:'blocked',reason:'File not available'}; }
}
async function verifyRunner(entry) {
  try {
    const stat = await fs.stat(entry.file); // Executable launchers may be symlinks.
    if (!stat.isFile()) throw Error('Not a regular file');
    if (entry.id!=='jugnu_worker') await fs.access(entry.file, require('node:fs').constants.X_OK);
    else await fs.access(entry.file, require('node:fs').constants.R_OK);
    return {id:entry.id,label:entry.title,status:'present',reason:'Installed; execution not tested'};
  } catch (_) { return {id:entry.id,label:entry.title,status:'blocked',reason:'Dependency unavailable'}; }
}
async function getReadiness() {
  const checks = [...await Promise.all(INPUTS.map(verifySource)), ...await Promise.all(RUNNERS.map(verifyRunner))];
  return {
    checks,
    referenceAssetsVerified:INPUTS.every(entry=>checks.some(c=>c.id===entry.id && c.status==='verified')),
    offlineDependenciesPresent:RUNNERS.every(entry=>checks.some(c=>c.id===entry.id && c.status==='present')),
    v4AutomatedGenerationVerified:false,
    v4AutomatedGenerationEnabled:false,
    publishingEnabled:false,
    notes:[
      'Checks confirm local files, not voice quality or completed device deployment.',
      'The local 06:00 main scheduler is separate and is not proof of V4 generation.',
      'No V4 automation, TTS, uploads or paid API calls are triggered by this endpoint.'
    ]
  };
}
function mountLocalV4Readiness(app) {
  app.get('/api/v4-readiness',async(req,res)=>{
    if (!isLocal(req)) return res.status(403).json({error:'Local access only'});
    try { return res.json(await getReadiness()); }
    catch (_) { return res.status(500).json({error:'Local readiness unavailable'}); }
  });
}
module.exports={getReadiness,mountLocalV4Readiness};
