'use strict';

// Local-only, read-only gallery for isolated V4 drafts.
// No credentials, audio references, scripts or arbitrary filesystem paths are served.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const ROOT = path.join(os.homedir(), 'digvijayeconlab-tools', 'dve-style-v4-adapter', 'drafts');
const DOWNLOADS = path.join(os.homedir(), 'storage', 'downloads');
const FOLDER = /^(?:step[0-9]{2,4}|demand-supply-final-build-v[0-9]+|dve-final-recovery-v2-[a-z0-9]+)$/;
const FRAME = /^(?:frame|final|raw|screenshot|preview|graph|motion|scene)[-_.a-zA-Z0-9]{0,90}\.(?:png|jpe?g|webp)$/i;
const MEDIA = /\.(?:mp4|png|jpg|jpeg|webp)$/i;

function isLocal(req) {
  const address = String(req.socket.remoteAddress || '');
  return address === '127.0.0.1' || address === '::1' ||
    address === '::ffff:127.0.0.1' || /^127\./.test(address);
}
async function regularFile(root, name) {
  if (!name || name.includes('/') || name.includes('\\') || name === '.' || name === '..') return null;
  const candidate = path.join(root, name);
  try {
    const stat = await fs.lstat(candidate);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 600 * 1024 * 1024) return null;
    const actualRoot = await fs.realpath(root);
    const actual = await fs.realpath(candidate);
    if (!actual.startsWith(actualRoot + path.sep)) return null;
    return { path: actual, size: stat.size };
  } catch (_) {
    return null;
  }
}
async function directory(root, name) {
  if (!FOLDER.test(name)) return null;
  try {
    const dir = path.join(root, name);
    const st = await fs.lstat(dir);
    if (!st.isDirectory() || st.isSymbolicLink()) return null;
    const actualRoot = await fs.realpath(root);
    const actualDir = await fs.realpath(dir);
    if (!actualDir.startsWith(actualRoot + path.sep)) return null;
    return dir;
  } catch (_) { return null; }
}
function best(files, choices) {
  for (const name of choices) if (files.includes(name)) return name;
  return null;
}
function urlFor(id, kind, file) {
  if (kind === 'frame') return '/api/v4-gallery/' + encodeURIComponent(id) + '/frame/' + encodeURIComponent(file);
  return '/api/v4-gallery/' + encodeURIComponent(id) + '/' + kind;
}
async function itemForFolder(root, name) {
  const dir = await directory(root, name);
  if (!dir) return null;
  const names = (await fs.readdir(dir)).filter(n => MEDIA.test(n) && !n.includes('/') && !n.includes('\\'));
  const valid = [];
  for (const n of names.slice(0, 160)) if (await regularFile(dir, n)) valid.push(n);
  const videos = valid.filter(n => /\.mp4$/i.test(n));
  const video = best(videos, ['final-landscape.mp4','final-short.mp4','final.mp4','video-only.mp4','silent.mp4']) ||
    videos.find(n => /(?:timing-fixed|relationship|v4).*\.mp4$/i.test(n)) || videos[0] || null;
  const images = valid.filter(n => FRAME.test(n));
  const thumbnail = best(valid, ['thumbnail.jpg','thumbnail.png','frame-9p4.png','final-9p4.png','preview.png']) ||
    images[images.length-1] || null;
  const scenes = images.slice(0, 24).map((n,i) => ({
    id: 'frame-' + (i+1), title: n.replace(/\.[^.]+$/,'').replace(/[-_]/g,' '),
    image: urlFor(name,'frame',n)
  }));
  if (!video && !thumbnail && !scenes.length) return null;
  const st = await fs.stat(dir);
  return {
    id: name, title: name.replace(/[-_]/g,' '), updatedAt: st.mtime.toISOString(),
    status: 'local_review_only', source: 'local_v4_drafts',
    video: video ? urlFor(name,'video') : null,
    thumbnail: thumbnail ? urlFor(name,'thumbnail') : null,
    scenes, __files: { video, thumbnail, frames: images }, __dir: dir
  };
}
async function downloadItem() {
  // Only these known export names are eligible; never enumerate personal Downloads.
  const candidates = [
    ['DigvijayEconLab-DemandSupply-Corrected-Shorts-9x16.mp4',
      'DigvijayEconLab-DemandSupply-Vertical-Cover.jpg'],
    ['DemandSupply-Landscape-Review.mp4',
      'DemandSupply-Landscape-Thumbnail.jpg']
  ];
  let name=null,thumb=null,video=null,thumbnail=null;
  for (const [v,t] of candidates) {
    const found=await regularFile(DOWNLOADS,v);
    if (found) {
      name=v;thumb=t;video=found;
      thumbnail=await regularFile(DOWNLOADS,t);
      break;
    }
  }
  if (!video && !thumbnail) return null;
  return {
    id:'downloads', title:'Demand & Supply — exported review',
    status:'local_review_only', source:'android_downloads',
    updatedAt: new Date(Math.max(video ? (await fs.stat(video.path)).mtimeMs:0,
      thumbnail ? (await fs.stat(thumbnail.path)).mtimeMs:0)).toISOString(),
    video: video ? urlFor('downloads','video') : null,
    thumbnail: thumbnail ? urlFor('downloads','thumbnail') : null,
    scenes:[], __files:{video:video?name:null,thumbnail:thumbnail?thumb:null,frames:[]},__dir:DOWNLOADS
  };
}
async function items() {
  const found=[];
  try {
    const names=await fs.readdir(ROOT);
    for (const name of names.filter(n=>FOLDER.test(n)).slice(0,80)) {
      const item=await itemForFolder(ROOT,name);
      if (item) found.push(item);
    }
  } catch (_) {
    // Fresh installations can legitimately have no V4 workspace.
  }
  const download=await downloadItem();
  if (download) found.push(download);
  found.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  return found.slice(0,40);
}
function publicItem(item) {
  const {__files,__dir,...safe}=item;
  return safe;
}
function mountLocalV4Gallery(app) {
  app.get('/api/v4-gallery', async (req,res)=>{
    if (!isLocal(req)) return res.status(403).json({error:'Local access only'});
    try { return res.json({items:(await items()).map(publicItem),publishingEnabled:false}); }
    catch (_) { return res.status(500).json({error:'Gallery temporarily unavailable'}); }
  });
  app.get('/api/v4-gallery/:id/:kind/:file?', async (req,res)=>{
    if (!isLocal(req)) return res.status(403).end();
    const id=String(req.params.id||'');
    if (id!=='downloads' && !FOLDER.test(id)) return res.status(404).end();
    const kind=String(req.params.kind||'');
    if (!['video','thumbnail','frame'].includes(kind)) return res.status(404).end();
    try {
      const record=(await items()).find(item=>item.id===id);
      if (!record) return res.status(404).end();
      const name=kind==='frame' ? String(req.params.file||'') : record.__files[kind];
      if (!name || (kind==='frame' && (!FRAME.test(name) || !record.__files.frames.includes(name)))) {
        return res.status(404).end();
      }
      const found=await regularFile(record.__dir,name);
      if (!found) return res.status(404).end();
      res.setHeader('Cache-Control','private, no-store');
      res.setHeader('X-Content-Type-Options','nosniff');
      return res.sendFile(found.path);
    } catch (_) { return res.status(404).end(); }
  });
}
module.exports={mountLocalV4Gallery};
