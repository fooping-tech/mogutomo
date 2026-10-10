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
  "    observeMouth,stageFor,soundNotes,resetGesture,updateCameraLayout,snapToCameraFrame,buildVoxelPet,drawVoxelCharacter,createSoundClip",
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
  const events=[
    mouthFrame(app,.03),mouthFrame(app,.03),
    mouthFrame(app,.35),mouthFrame(app,.35),
    mouthFrame(app,.03),mouthFrame(app,.03)
  ];
  return events.includes('bite')?'bite':events.includes('cooldown')?'cooldown':events.at(-1);
}

test('syntax and privacy invariants',()=>{
  assert.doesNotThrow(()=>new Function(script));
  assert.doesNotMatch(html,/HandLandmarker/);
  assert.match(html,/録画・アップロードしません/);
});

test('mouth open -> close awards XP, startup guard, shorter cooldown and long holds',()=>{
  const app=makeApp();app.click('startPlaying');
  mouthFrame(app,.35);mouthFrame(app,.35);mouthFrame(app,.03);mouthFrame(app,.03);
  assert.equal(app.state().xp[0],0,'Do not count a mouth already open at startup');
  assert.equal(mouthCycle(app),'bite');
  assert.equal(app.state().xp[0],10);
  assert.equal(mouthCycle(app),'cooldown','Another cycle within the short cooldown is suppressed');
  assert.equal(app.state().xp[0],10);
  app.advance(1300);
  assert.equal(mouthCycle(app),'bite','Bites are accepted without waiting 8.5 seconds');
  assert.equal(app.state().xp[0],20);
  app.testing.resetGesture();
  app.advance(1300);
  mouthFrame(app,.03);mouthFrame(app,.03);
  mouthFrame(app,.35);mouthFrame(app,.35);
  mouthFrame(app,.35,4800);mouthFrame(app,.03);mouthFrame(app,.03);
  assert.equal(app.state().xp[0],30,'A slow assisted feeding is still counted');
  app.testing.resetGesture();
  app.advance(1300);
  mouthFrame(app,.03);mouthFrame(app,.03);
  mouthFrame(app,.35);mouthFrame(app,.35);
  mouthFrame(app,.35,10500);mouthFrame(app,.03);mouthFrame(app,.03);
  assert.equal(app.state().xp[0],30,'Extremely long open-mouth holds do not count');
  app.get('autoPraise').checked=false;
  mouthCycle(app);
  assert.equal(app.state().xp[0],30,'Manual-only setting disables recognition rewards');
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

test('camera states sit outside the face video and fit on short screens',()=>{
  const blockStart=html.indexOf('<div class="camera-view-layout">');
  const blockEnd=html.indexOf('id="manualFallback"',blockStart);
  const left=html.indexOf('class="camera-side camera-side-left"',blockStart);
  const face=html.indexOf('id="faceChip"',blockStart);
  const status=html.indexOf('id="detectionState"',blockStart);
  const video=html.indexOf('id="video"',blockStart);
  const mouth=html.indexOf('id="mouthChip"',blockStart);
  const right=html.indexOf('class="camera-side camera-side-right"',blockStart);
  assert.ok(blockStart>=0 && left>blockStart&&face>left&&status>face&&video>status,
    'Left rail is beside, not inside, the video');
  assert.ok(right>video&&mouth>right&&mouth<blockEnd,
    'Right mouth indicator is beside the video');
  assert.match(html,/\.app\.camera-active \.stage\{height:clamp\(160px,25svh,230px\)\}/);
  assert.match(html,/@media\(max-height:690px\)/);
});

test('camera autofocus scrolls to a centered two-view frame under the sticky XP header',()=>{
  const app=makeApp();
  let scroll=null;
  app.window.innerHeight=760;
  app.window.scrollY=0;
  app.window.scrollTo=options=>{scroll=options;};
  app.get('growthCard').getBoundingClientRect=()=>({top:0,height:85});
  app.get('playFrame').getBoundingClientRect=()=>({top:400,height:470});
  app.testing.updateCameraLayout(true);
  app.testing.snapToCameraFrame();
  assert.ok(scroll,'Must scroll on camera-on frame');
  assert.equal(scroll.top,209);
  assert.equal(scroll.behavior,'smooth');
  app.click('cameraStopInline');
  assert.equal(app.get('cameraSession').hidden,true,'Inline close should leave camera mode');
  app.testing.updateCameraLayout(false);
  scroll=null;
  app.testing.snapToCameraFrame();
  assert.equal(scroll,null,'Camera off must not cause additional automatic scroll');
});

test('brief strong aah -> closed bite works at lower frame rates',()=>{
  const app=makeApp();app.click('startPlaying');
  mouthFrame(app,.05,145);mouthFrame(app,.05,145);
  const start=mouthFrame(app,.36,145);
  const result=mouthFrame(app,.05,145);
  assert.equal(start,'open');
  assert.equal(result,'bite','Just one clearly open frame can be sufficient');
  assert.equal(app.state().xp[0],10);
});

test('moderate one-frame mouth movement works with two closed frames',()=>{
  const app=makeApp();app.click('startPlaying');
  mouthFrame(app,.13);mouthFrame(app,.14);
  const begin=mouthFrame(app,.245,130);
  const close1=mouthFrame(app,.13,130);
  const close2=mouthFrame(app,.13,130);
  assert.equal(begin,'open');
  assert.equal(close1,'closing');
  assert.equal(close2,'bite');
  assert.equal(app.state().xp[0],10);
});

test('small mouth movements and noisy single peaks are not rewarded',()=>{
  const app=makeApp();app.click('startPlaying');
  mouthFrame(app,.05);mouthFrame(app,.05);
  mouthFrame(app,.13);mouthFrame(app,.05);mouthFrame(app,.05);
  assert.equal(app.state().xp[0],0,'Talking-sized movement does not count');
  mouthFrame(app,.19);mouthFrame(app,.05);mouthFrame(app,.05);
  assert.equal(app.state().xp[0],0,'Isolated small peaks do not count');
});

test('recognition meter and camera status expose rearm/open/closed stages',()=>{
  const app=makeApp();app.click('startPlaying');
  assert.equal(mouthFrame(app,.12),'arming');
  assert.equal(mouthFrame(app,.12),'arming');
  assert.equal(mouthFrame(app,.12),'face');
  assert.equal(mouthFrame(app,.30),'open');
  assert.match(app.get('mouthMeterFill').style.height,/\d+%/);
  const states=['arming','face','open','closing','bite','cooldown'];
  for(const name of states)assert.match(html,new RegExp(name+':|'+name+'\\x27'),'status '+name);
  assert.doesNotMatch(html,/lastPraiseAt < 8500/);
});

test('six 3D voxel species have distinct geometry and evolving silhouettes',()=>{
  const app=makeApp();app.click('startPlaying');
  const species=['rabbit','bear','cat','fox','chick','secret'];
  const shapes=[];
  for(const sp of species){
    const levels=[1,4,7,10].map(lv=>app.testing.buildVoxelPet(sp,lv));
    assert.ok(levels.every(shape=>shape.cells.size>45),sp+' builds a real collection of cubes');
    assert.ok(levels[3].cells.size>levels[0].cells.size,sp+' has significantly more geometry at final level');
    assert.notEqual(levels[0].stageIndex,levels[3].stageIndex);
    assert.ok(levels[0].unit>=levels[3].unit,'Larger characters fit in the viewport');
    shapes.push([...levels[3].cells.keys()].sort().join('|'));
  }
  assert.equal(new Set(shapes).size,6,'All six silhouettes must be geometrically distinct');
  assert.match(html,/\.voxel-canvas\{display:block/);
  assert.doesNotMatch(html,/class="ear left"/);
});

test('voxel canvas renders shaded 3D cube faces and keeps XP and camera working',()=>{
  const app=makeApp();
  let filled=0,lines=0,shades=new Set();
  const ctx={
    imageSmoothingEnabled:true,clearRect(){},beginPath(){},moveTo(){},lineTo(){lines++;},
    closePath(){},fill(){filled++;shades.add(this.fillStyle);},
    stroke(){},fillRect(){filled++;shades.add(this.fillStyle);}
  };
  app.get('voxelCanvas').getContext=()=>ctx;
  assert.equal(app.testing.drawVoxelCharacter(),true);
  assert.ok(filled>50,'The baby is assembled from dozens of visible cube faces');
  assert.ok(lines>50,'Cube geometry uses visible polygons');
  assert.ok(shades.size>=5,'Different faces have different lighting/materials');
  assert.equal(ctx.imageSmoothingEnabled,false,'Pixel-perfect rendering');
  app.click('startPlaying');app.click('ateButton');
  assert.equal(app.state().xp[0],10,'XP continues to work after drawing');
  assert.ok(filled>100,'The voxel renderer is repainted on growth');
});

test('voxel game audio has original block textures and a valid PCM WAV',()=>{
  const app=makeApp();app.click('startPlaying');
  const notes=app.testing.soundNotes;
  assert.equal(notes('munch')[0][5],'wood');
  assert.equal(notes('praise')[0][5],'pluck');
  assert.equal(notes('levelUp')[0][5],'chip');
  assert.ok(notes('comboFever').length>notes('praise').length);
  const types=Array.from({length:6},(_,i)=>notes('happyVoice',i)[0][5]);
  assert.equal(new Set(types).size,6,'Every creature has its own timbre');
  const wav=app.testing.createSoundClip('munch');
  assert.match(wav,/blob:test-/,'Local generated sound is encoded as an audio Blob');
  assert.match(html,/tag\(0,'RIFF'\)/);
  assert.match(html,/signal=Math\.round\(signal\*/,'Waveforms are bit-crushed');
});
