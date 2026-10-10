'use strict';
/**
 * Dependency-free DOM smoke tests for mogutomo.
 * Run: node --test tests/smoke.test.cjs
 * iOS camera/video and sound hardware still require an actual device check.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script,'Inline script exists');
const marker='  if(!hadSave)presentWelcome();\n})();';
assert.ok(script.includes(marker),'Test-injection anchor still present');
const source=script.replace(marker,[
  "  window.__testing={",
  "    getState:()=>({xp:[...petXP],events:[...achievements],selected:selectedPet,session:sessionBites,secret:secretUnlocked,volume,voice:soundOn,auto:$('autoPraise').checked}),",
  "    observeMouth,stageFor,soundNotes,resetGesture,updateCameraLayout",
  "  };",
  marker
].join('\n'));
let idCounter=0;
function makeApp(memory=new Map(),opts={}){
  const handlers=new Map(),nodes=new Map();
  let clock=10000,confirmCalls=0,audioCalls=0;
  class ClassList{
    constructor(){this.items=new Set();}
    add(...args){args.forEach(x=>this.items.add(x));}
    remove(...args){args.forEach(x=>this.items.delete(x));}
    contains(x){return this.items.has(x);}
    toggle(x,force){if(force===undefined)force=!this.contains(x);force?this.add(x):this.remove(x);return force;}
  }
  class Element{
    constructor(id){
      this.id=id;this.checked=true;this.disabled=false;
      this.hidden=['welcomeOverlay','settingsOverlay','dexOverlay','cameraSession','manualFallback'].includes(id);
      this.classList=new ClassList();this.dataset={};this.textContent='';this.innerHTML='';
      this.value='60';this.style={width:'',setProperty(){}};
      this.offsetWidth=260;this.clientWidth=190;this.clientHeight=230;
      this.videoWidth=640;this.videoHeight=480;this.childNodes=[];
    }
    addEventListener(type,fn){handlers.set(this.id+':'+type,fn);}
    setAttribute(){}
    getBoundingClientRect(){return{width:260};}
    querySelector(){return get('food');}
    querySelectorAll(){return[];}
    getContext(){return{setTransform(){},clearRect(){},setLineDash(){},beginPath(){},ellipse(){},fill(){},stroke(){}};}
    replaceChildren(...nodes){this.childNodes=nodes;}
    appendChild(node){this.childNodes.push(node);return node;}
    focus(){}pause(){}
    play(){audioCalls++;return Promise.resolve();}
  }
  function get(id){if(!nodes.has(id))nodes.set(id,new Element(id));return nodes.get(id);}
  const document={
    hidden:false,getElementById:get,querySelectorAll(){return[];},
    addEventListener(type,cb){handlers.set('document:'+type,cb);},
    createDocumentFragment(){return new Element('fragment');},
    createElement(type){return new Element(type);},
    body:{appendChild(){}}
  };
  const window={
    devicePixelRatio:1,isSecureContext:true,
    matchMedia(){return {matches:!!opts.reducedMotion};},
    confirm(){confirmCalls++;return opts.confirm!==false;},
    addEventListener(){}
  };
  const storage={
    getItem(key){return memory.has(key)?memory.get(key):null;},
    setItem(key,value){memory.set(key,value);}
  };
  class MockBlob{constructor(parts,opts){this.parts=parts;this.type=opts.type;}}
  const URL={createObjectURL(){return 'blob:test-'+(++idCounter);}};
  const navigator={userAgent:'iPhone',hardwareConcurrency:8,deviceMemory:8,vibrate(){}};
  const performance={now(){return clock;}};
  const app=new Function('document','window','localStorage','navigator','performance',
    'Blob','URL','setTimeout','clearTimeout','requestAnimationFrame','cancelAnimationFrame',source);
  app(document,window,storage,navigator,performance,MockBlob,URL,()=>1,()=>{},()=>1,()=>{});
  function fire(id,type,object={}){
    const handler=handlers.get(id+':'+type);
    assert.ok(handler,'Missing '+id+':'+type+' event');
    handler({target:get(id),...object});
  }
  return {
    get,fire,window,memory,
    click:id=>fire(id,'click'),
    change:id=>fire(id,'change'),
    input:id=>fire(id,'input'),
    advance:ms=>(clock+=ms),
    clock:()=>clock,
    state:()=>window.__testing.getState(),
    testing:window.__testing,
    confirmCalls:()=>confirmCalls,
    audioCalls:()=>audioCalls
  };
}
function faceWithOpenness(ratio){
  const landmarks=Array.from({length:478},()=>({x:.5,y:.5}));
  landmarks[234]={x:.27,y:.5};landmarks[454]={x:.73,y:.5};
  landmarks[61]={x:.43,y:.5};landmarks[291]={x:.57,y:.5};
  const gap=ratio*(.57-.43)*640/480;
  landmarks[13]={x:.5,y:.5-gap/2};
  landmarks[14]={x:.5,y:.5+gap/2};
  return landmarks;
}
function mouthFrame(app,ratio,ms=155){
  const time=app.advance(ms);
  return app.testing.observeMouth(faceWithOpenness(ratio),time);
}
function mouthCycle(app){
  mouthFrame(app,.03);mouthFrame(app,.03);
  mouthFrame(app,.35);mouthFrame(app,.35);
  mouthFrame(app,.03);return mouthFrame(app,.03);
}

test('syntax and privacy invariants',()=>{
  assert.doesNotThrow(()=>new Function(script));
  assert.doesNotMatch(html,/HandLandmarker/);
  assert.match(html,/録画・アップロードしません/);
});

test('mouth open -> close awards XP, debounce and cooldown block duplicates',()=>{
  const app=makeApp();app.click('startPlaying');
  mouthFrame(app,.35);mouthFrame(app,.35);mouthFrame(app,.03);mouthFrame(app,.03);
  assert.equal(app.state().xp[0],0,'Do not count a mouth already open at startup');
  assert.equal(mouthCycle(app),'bite');
  assert.equal(app.state().xp[0],10);
  assert.equal(mouthCycle(app),'face','Second cycle is within auto cooldown');
  assert.equal(app.state().xp[0],10);
  app.advance(9000);
  assert.equal(mouthCycle(app),'bite');
  assert.equal(app.state().xp[0],20);
  app.testing.resetGesture();
  app.advance(9000);
  mouthFrame(app,.03);mouthFrame(app,.03);
  mouthFrame(app,.35);mouthFrame(app,.35);
  mouthFrame(app,.35,4500);mouthFrame(app,.03);mouthFrame(app,.03);
  assert.equal(app.state().xp[0],20,'Long open-mouth hold must not count');
  app.get('autoPraise').checked=false;
  mouthCycle(app);
  assert.equal(app.state().xp[0],20,'Manual-only setting disables recognition rewards');
});

test('timeless combo and fever only change effects, not XP amount',()=>{
  const app=makeApp();app.click('startPlaying');
  for(let i=0;i<3;i++)app.click('ateButton');
  assert.match(app.get('comboPill').textContent,/NICE/);
  for(let i=0;i<2;i++)app.click('ateButton');
  assert.match(app.get('comboPill').textContent,/GREAT/);
  for(let i=0;i<5;i++)app.click('ateButton');
  assert.equal(app.state().xp[0],100);
  assert.equal(app.state().session,10);
  assert.match(app.get('comboPill').textContent,/FEVER/);
  assert.equal(app.get('stage').classList.contains('fever-mode'),true);
  assert.equal(app.state().events.includes('combo_10'),true);
});

test('5 originals evolve through level ten and unlock a sixth species',()=>{
  const app=makeApp();app.click('startPlaying');
  assert.equal(app.testing.stageFor(1).id,'seed');
  assert.equal(app.testing.stageFor(4).id,'child');
  assert.equal(app.testing.stageFor(6).id,'young');
  assert.equal(app.testing.stageFor(7).id,'grown');
  assert.equal(app.testing.stageFor(10).id,'legend');
  for(let i=0;i<5;i++){
    app.fire('petCollection','click',{
      target:{closest:()=>({dataset:{petIndex:String(i)}})}
    });
    for(let j=0;j<27;j++)app.click('ateButton');
  }
  assert.ok(app.state().xp.slice(0,5).every(x=>x===270));
  assert.equal(app.state().secret,true);
  assert.equal(app.state().selected,5);
  assert.equal(app.state().events.includes('secret_unlocked'),true);
  assert.equal(app.state().events.includes('collection_complete'),true);
  app.click('openDex');
  assert.match(app.get('dexGrid').innerHTML,/ルミナ/);
  assert.ok(!app.get('dexGrid').innerHTML.includes(' disabled'));
});

test('six creature calls differ in pitch, length and voice style',()=>{
  const app=makeApp();app.click('startPlaying');
  const variants=Array.from({length:6},(_,i)=>JSON.stringify(app.testing.soundNotes('happyVoice',i)));
  assert.equal(new Set(variants).size,6);
  assert.match(html,/bearJoy|catJoy|foxJoy|chickJoy|secretJoy/);
});

test('character selection, browser persistence, settings, onboarding and reset',()=>{
  const storage=new Map(),app=makeApp(storage);
  assert.equal(app.get('welcomeOverlay').hidden,false);
  app.click('startPlaying');
  app.click('ateButton');
  app.click('nextPet');app.click('openDex');
  app.fire('dexGrid','click',{target:{closest:()=>({dataset:{petIndex:'3'},disabled:false})}});
  assert.equal(app.state().selected,3);
  app.click('openSettings');
  app.get('settingsVolume').value='35';app.input('settingsVolume');
  app.get('settingsVoice').checked=false;app.change('settingsVoice');
  app.get('settingsAuto').checked=false;app.change('settingsAuto');
  const restored=makeApp(storage);
  assert.equal(restored.state().xp[0],10);
  assert.equal(restored.state().selected,3);
  assert.equal(restored.state().volume,.35);
  assert.equal(restored.state().voice,false);
  assert.equal(restored.state().auto,false);
  assert.equal(restored.state().session,0,'Session combo does not persist');
  assert.equal(restored.get('welcomeOverlay').hidden,true);
  restored.click('resetGrowth');
  assert.ok(restored.state().xp.every(x=>x===0));
  assert.equal(restored.state().secret,false);
  assert.equal(restored.state().events.length,0);
  assert.equal(restored.confirmCalls(),1);
  assert.ok(makeApp(storage).state().xp.every(x=>x===0));
});

test('reduced motion avoids confetti, while manual fallback remains usable',()=>{
  const app=makeApp(new Map(),{reducedMotion:true});
  app.click('startPlaying');app.click('ateButton');
  assert.equal(app.state().xp[0],10);
  assert.equal(app.get('app').classList.contains('quality-low'),true);
});

test('camera preview occupies the button slot without covering avatar; manual fallback stays accessible',()=>{
  const stagePos=html.indexOf('<div class="stage" id="stage">');
  const stageEnd=html.indexOf('  </section>',stagePos);
  const controlsPos=html.indexOf('<section class="controls"');
  const controlsEnd=html.indexOf('  </section>',controlsPos);
  const previewPos=html.indexOf('id="preview"');
  assert.ok(stagePos>=0&&stageEnd>stagePos&&controlsPos>stageEnd,
    'Stage and controls are separate areas');
  assert.ok(previewPos>controlsPos&&previewPos<controlsEnd,
    'Video preview is inside the controls, not the stage');
  assert.match(html,/\.app\.camera-active \.controls>\.action\{display:none\}/);
  assert.match(html,/\.camera-session \.preview\.expanded\{/);
  const app=makeApp();
  assert.equal(app.get('cameraSession').hidden,true);
  app.testing.updateCameraLayout(true);
  assert.equal(app.get('cameraSession').hidden,false);
  assert.equal(app.get('manualFallback').hidden,true);
  assert.equal(app.get('app').classList.contains('camera-active'),true);
  app.testing.updateCameraLayout(true,true);
  assert.equal(app.get('manualFallback').hidden,false);
  app.click('startPlaying');
  app.click('manualFallback');
  assert.equal(app.state().xp[0],10,'Fallback should still grant ordinary XP');
  app.testing.updateCameraLayout(false);
  assert.equal(app.get('cameraSession').hidden,true);
  assert.equal(app.get('manualFallback').hidden,true);
  assert.equal(app.get('app').classList.contains('camera-active'),false);
});
