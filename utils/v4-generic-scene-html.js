'use strict';

// Topic-specific diagram HTML composer. Offline/pure: no file IO, TTS, paid
// APIs, video generation, service changes or publishing.
const {validateVisual}=require('../scripts/v4-offline-course-pack');
const ESC={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
function esc(v){return String(v).replace(/[&<>"']/g,c=>ESC[c]);}
function interpolate(points,x){
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i];
    if(x>=a[0]&&x<=b[0])return a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0]);
  }
  return null;
}
function diagram(v){
  if(v.type==='curve'||v.type==='curve-pair'){
    const point=p=>[Math.round(165+p[0]*9),Math.round(550-p[1]*4.4)];
    let out='<g class="axes"><path d="M165 90 V550 H1160"/>'+
      '<text x="1100" y="610">'+esc(v.xLabel)+'</text><text x="42" y="80">'+esc(v.yLabel)+'</text></g>';
    for(let i=0;i<=4;i++)out+='<path class="gridline" d="M165 '+(550-i*110)+' H1160"/>';
    v.curves.forEach((c,i)=>{
      const points=c.points.map(p=>point(p).join(',')).join(' ');
      const end=point(c.points[c.points.length-1]);
      out+='<polyline class="curve" points="'+points+'" stroke="'+(i?'#f3c66d':'#60dce8')+'"/>';
      out+='<text class="reveal curve-label" x="'+Math.min(end[0]+15,1200)+'" y="'+Math.max(end[1]-18,50)+'">'+esc(c.name)+'</text>';
    });
    if(v.equilibrium){
      const e=v.equilibrium;
      if(v.curves.some(c=>{
        const y=interpolate(c.points,e.x);
        return y===null||Math.abs(y-e.y)>4;
      }))throw Error('V4_SCENE equilibrium not on all provided curves');
      const p=point([e.x,e.y]);
      out+='<g class="reveal eq"><path d="M'+p[0]+' '+p[1]+' V550 M'+p[0]+' '+p[1]+' H165"/>'+
        '<circle cx="'+p[0]+'" cy="'+p[1]+'" r="12"/>'+
        '<text x="'+(p[0]+20)+'" y="'+(p[1]-22)+'">'+esc(e.label)+'</text></g>';
    }
    return out;
  }
  if(['concept-map','flow','comparison'].includes(v.type)){
    const columns=v.type==='comparison'?Math.min(v.nodes.length,3):3;
    return v.nodes.map((n,i)=>{
      const x=48+(i%columns)*395,y=76+Math.floor(i/columns)*170;
      return '<g class="reveal card"><rect x="'+x+'" y="'+y+'" width="355" height="130" rx="23"/>'+
        '<text x="'+(x+177)+'" y="'+(y+70)+'" text-anchor="middle" textLength="'+Math.min(320,n.length*20)+'" lengthAdjust="spacingAndGlyphs">'+esc(n)+'</text></g>';
    }).join('');
  }
  if(v.type==='timeline'){
    const step=Math.min(120,950/(v.events.length-1));
    const end=100+step*(v.events.length-1);
    return '<path class="track" d="M100 320 H'+end+'"/>'+
      v.events.map((e,i)=>{
        const x=Math.round(100+i*step);
        return '<g class="reveal tick"><circle cx="'+x+'" cy="320" r="13"/>'+
          '<text x="'+x+'" y="270" text-anchor="middle">'+esc(e.label)+'</text>'+
          '<text x="'+x+'" y="385" text-anchor="middle" textLength="'+Math.min(110,e.text.length*13)+'" lengthAdjust="spacingAndGlyphs">'+esc(e.text)+'</text></g>';
      }).join('');
  }
  if(v.type==='equation'){
    return '<text class="reveal formula" x="640" y="325" text-anchor="middle" textLength="'+Math.min(1080,v.formula.length*35)+'" lengthAdjust="spacingAndGlyphs">'+esc(v.formula)+'</text>';
  }
  throw Error('V4_SCENE unknown diagram type');
}
const CSS=[
'html,body{margin:0;width:1920px;height:1080px;overflow:hidden;background:#06192b;color:#f0f8ff;font-family:system-ui,"Noto Sans Devanagari",sans-serif}',
'*{box-sizing:border-box}',
'body{background:radial-gradient(circle at 82% 9%,#245173,transparent 46%),linear-gradient(142deg,#071728,#12314b);position:relative}',
'.outline{position:absolute;inset:34px;border:1px solid #385778;border-radius:36px}',
'.brand{position:absolute;left:98px;top:58px;color:#f3c773;font-size:31px;font-weight:800}',
'.label{position:absolute;right:96px;top:66px;color:#70e1e6;font-size:23px;letter-spacing:2px}',
'h1{position:absolute;left:110px;right:110px;top:130px;margin:0;font-size:54px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
'h2{position:absolute;left:110px;right:110px;top:209px;margin:0;color:#b9d8e9;font-size:35px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
'.stage{position:absolute;left:115px;top:287px;width:1690px;height:650px;border:1px solid #2d6183;border-radius:28px;background:linear-gradient(135deg,#102f4b,#081c33);overflow:hidden}',
'.halo{position:absolute;right:-140px;top:-190px;width:580px;height:580px;border:1px solid #66dce534;border-radius:50%;box-shadow:0 0 0 60px #57dce708,0 0 0 130px #57dce708;animation:breath 5s ease-in-out infinite alternate}',
'@keyframes breath{to{transform:scale(1.15);opacity:.5}}',
'svg{width:100%;height:100%;position:relative}',
'.axes{fill:none;stroke:#aad1e5;stroke-width:4}.axes text{fill:#caeffa;stroke:none;font-size:29px}',
'.gridline{stroke:#34516f;stroke-width:2;opacity:.65}',
'.curve{fill:none;stroke-width:10;stroke-linejoin:round;stroke-linecap:round;stroke-dasharray:2400;stroke-dashoffset:2400}',
'.curve-label,.eq text{fill:#ffe3a2;font-size:29px;font-weight:750}',
'.eq path{stroke:#f3c76d;stroke-width:3;stroke-dasharray:12 8;fill:none}.eq circle{fill:#ffe0a3}',
'.card rect{fill:#163f5f;stroke:#67dde9;stroke-width:3}.card text{fill:#f0fcff;font-size:27px;font-weight:650}',
'.track{stroke:#60dce8;stroke-width:7}.tick circle{fill:#f3c76d}.tick text{fill:#effaff;font-size:27px}',
'.formula{fill:#ffe1a0;font-size:63px;font-weight:850}',
'.footer{position:absolute;left:110px;right:110px;bottom:75px;display:flex;justify-content:space-between;font-size:23px;color:#afcbde}',
'.progress{position:absolute;bottom:0;left:0;width:100%;height:6px;background:#f4c66c;transform-origin:left}'
].join('\n');
function createSceneHTML(scene,options={}){
  if(!scene||typeof scene!=='object'||Array.isArray(scene))throw Error('V4_SCENE scene required');
  const title=options.topicTitle,name=scene.name,duration=options.duration;
  if(typeof title!=='string'||title.length<3||title.length>200||typeof name!=='string'||name.length<3||name.length>130)throw Error('V4_SCENE title invalid');
  if(!Number.isFinite(duration)||duration<3||duration>120)throw Error('V4_SCENE duration invalid');
  const v=validateVisual(scene.visual,'V4_SCENE');
  return [
    '<!doctype html><html lang="hi"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<style>',CSS,'</style><script src="assets/gsap.min.js"></script></head><body>',
    '<div class="outline"></div><div class="brand">DigvijayEconLab</div>',
    '<div class="label">ECONOMICS • हिंदी</div>',
    '<h1 class="reveal">',esc(title),'</h1><h2 class="reveal">',esc(name),'</h2>',
    '<div class="stage"><div class="halo"></div><svg viewBox="0 0 1280 650" role="img" aria-label="',esc(v.title),'">',
    diagram(v),'</svg></div>',
    '<div class="footer"><span>',esc(v.title),'</span><span>शिक्षण ड्राफ्ट • प्रकाशन प्रतिबंधित</span></div>',
    '<div class="progress"></div>',
    '<script>',
    "if(!window.gsap)throw Error('V4_LOCAL_GSAP_REQUIRED');",
    'window.__timelines=window.__timelines||{};',
    'const seconds=',duration.toFixed(3),';',
    'const tl=gsap.timeline({paused:true});',
    "tl.fromTo('.reveal',{opacity:0,y:35},{opacity:1,y:0,stagger:0.14,duration:0.72,ease:'power2.out'},0.18);",
    "tl.to('.curve',{strokeDashoffset:0,duration:Math.min(3.4,seconds*0.42),stagger:0.2,ease:'power2.inOut'},0.7);",
    "tl.fromTo('.stage',{scale:0.97},{scale:1,duration:Math.min(4,seconds*0.65),ease:'power1.out'},0);",
    "tl.to('.progress',{scaleX:0,duration:seconds,ease:'none'},0);",
    'window.__timelines.main=tl;',
    "if(Math.abs(tl.duration()-seconds)>0.005)throw Error('V4_TIMELINE_DURATION_MISMATCH');",
    '</script></body></html>'
  ].join('');
}
module.exports={createSceneHTML,esc,interpolate};
