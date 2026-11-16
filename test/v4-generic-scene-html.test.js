'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {createSceneHTML,interpolate}=require('../utils/v4-generic-scene-html');

const curve={
  type:'curve-pair',
  title:'मांग और आपूर्ति संतुलन',
  xLabel:'मात्रा Q',
  yLabel:'कीमत P',
  curves:[
    {name:'Demand D',points:[[0,90],[50,50],[100,10]]},
    {name:'Supply S',points:[[0,10],[50,50],[100,90]]}
  ],
  equilibrium:{x:50,y:50,label:'P* Q*'}
};
const scene=visual=>({name:'अलग अर्थशास्त्र अवधारणा',visual});
const render=(visual,options={})=>createSceneHTML(scene(visual),{topicTitle:'अर्थशास्त्र का अध्ययन',duration:10,...options});
function inlineScript(html){
  const found=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  return found[found.length-1]?.[1];
}
test('Typed demand/supply diagrams have real curves, matching equilibrium and GSAP animation',()=>{
  const html=render(curve);
  assert.match(html,/Demand D/);
  assert.match(html,/Supply S/);
  assert.match(html,/P\* Q\*/);
  assert.match(html,/polyline class="curve"/);
  assert.match(html,/window\.__timelines\.main=tl/);
  assert.match(html,/src="assets\/gsap\.min\.js"/);
  assert.match(html,/strokeDashoffset:0/);
  assert.match(html,/const seconds=10\.000/);
  assert.doesNotMatch(html,/https?:\/\//);
  assert.doesNotMatch(html,/upload|fetch\(|eSpeak|paid api/i);
  assert.doesNotThrow(()=>new vm.Script(inlineScript(html)));
});
test('Invalid equilibrium coordinates cannot invent a crossing',()=>{
  const bad=structuredClone(curve);
  bad.equilibrium.x=70;
  assert.throws(()=>render(bad),/equilibrium not on all provided curves/);
});
test('Graph interpolation stays inside source point range',()=>{
  assert.equal(interpolate([[0,20],[50,40],[100,80]],25),30);
  assert.equal(interpolate([[0,20],[50,40]],90),null);
});
test('Unsupported diagram types are blocked without fake illustration',()=>{
  assert.throws(()=>render({type:'rocket',title:'Fake'}),/unsupported visual/);
  assert.throws(()=>render({...curve,curves:[]}),/curve count/);
});
test('User-supplied strings are HTML escaped, not executable code',()=>{
  const html=createSceneHTML({
    name:'<img src=x onerror=alert(1)>',
    visual:{type:'concept-map',title:'<script>bad</script>',nodes:['price < value','A&B']}
  },{topicTitle:'<script>alert(1)</script>',duration:8});
  assert.doesNotMatch(html,/<img src=x/);
  assert.doesNotMatch(html,/<script>alert\(1\)<\/script>/);
  assert.match(html,/&lt;script&gt;/);
  assert.match(html,/A&amp;B/);
  assert.doesNotThrow(()=>new vm.Script(inlineScript(html)));
});
test('Concept map, comparison, timeline and equations produce topic visuals',()=>{
  for(const visual of [
    {type:'concept-map',title:'Concepts',nodes:['price','demand']},
    {type:'flow',title:'Policy flow',nodes:['RBI','Banks','Loans']},
    {type:'comparison',title:'Approaches',nodes:['Classical','Keynesian']},
    {type:'timeline',title:'History',events:[{label:'2000',text:'First point'},{label:'2010',text:'Second point'}]},
    {type:'equation',title:'Economics formula',formula:'Y = C + I + G'}
  ]){
    const html=render(visual);
    assert.doesNotThrow(()=>new vm.Script(inlineScript(html)));
    assert.match(html,/शिक्षण ड्राफ्ट/);
  }
});
test('Voice/video duration boundaries are hard validation',()=>{
  assert.throws(()=>render(curve,{duration:2}),/duration invalid/);
  assert.throws(()=>render(curve,{duration:121}),/duration invalid/);
});
