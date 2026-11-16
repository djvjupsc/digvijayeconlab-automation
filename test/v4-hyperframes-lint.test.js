'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {isCleanHyperframesLint,assertCleanHyperframesLint}=require('../utils/v4-hyperframes-lint');

test("Accepts the EXACT clean output observed on the owner's Android Termux CLI",()=>{
  const actual='◆  Linting .building-7hJSd5/index.html\n\n◇  0 errors, 0 warnings\n';
  assert.equal(isCleanHyperframesLint(actual),true);
  assert.equal(assertCleanHyperframesLint(actual),true);
});
test('Accepts clear older pluralization and ANSI colored success summaries',()=>{
  assert.equal(isCleanHyperframesLint('◇  0 error(s), 0 warning(s)\n'),true);
  assert.equal(isCleanHyperframesLint('\x1b[32m◇  0 errors, 0 warnings\x1b[0m\r\n'),true);
});
test('Rejects lint errors, warnings, missing summary, ambiguity and unrelated success strings',()=>{
  for(const log of [
    '',
    'Successfully linted',
    '◇ 4 errors, 0 warnings',
    '◇ 0 errors, 3 warnings',
    '◇ 10 errors, 0 warnings',
    '◇ 0 errors, 0 warnings\n◇ 4 errors, 0 warnings',
    '◇ 0 errors, 0 warnings\n◇ 0 errors, 0 warnings',
    '✗ something failed\n◇ 0 errors, 0 warnings',
    '◇ 0 errors',
    'rendering completed',
    'NO ERRORS',
    0,
    null
  ]) {
    assert.equal(isCleanHyperframesLint(log),false,String(log));
    assert.throws(()=>assertCleanHyperframesLint(log),/summary not confirmed/);
  }
});
test('Both isolated smoke and production renderer share a single strict parser',()=>{
  const root=path.join(__dirname,'..');
  for(const relative of ['scripts/v4-generic-scene-smoke.js','utils/v4-offline-course-renderer.js']){
    const src=fs.readFileSync(path.join(root,relative),'utf8');
    assert.match(src,/assertCleanHyperframesLint\(lint\)/);
    assert.doesNotMatch(src,/if\(!\/0 error/);
  }
});
