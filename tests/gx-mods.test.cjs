'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {GxModLibrary,readPayload}=require('../browser/gx-mods.cjs');
const {offlineCss,matchedStyles}=require('../browser/gx-web-styles.cjs');

const color={h:284,s:72,l:49};
const theme={dark:{gx_accent:color,gx_secondary_base:{h:257,s:20,l:10}}};
const manifest={name:'Local fixture',version:'1',mod:{payload:{theme,wallpaper:{dark:{image:'art.png'}},shaders:{wave:{path:'shader.txt'}}}}};

test('GX inspection recognizes publisher themes and image variants without claiming shader support',()=>{
  const meta=readPayload(manifest,new Set(['art.png','shader.txt']));
  assert.deepEqual(meta.payload.theme[0].value.dark.accent,[284,72,49]);
  assert.deepEqual(meta.categories.map(item=>[item.key,item.supported]),[['theme',true],['wallpaper',true],['shaders',false]]);
  const unsafe={...manifest,mod:{payload:{wallpaper:{dark:{image:'../secret.png'}}}}};
  assert.throws(()=>readPayload(unsafe,new Set()),/Unsafe|escapes/);
});
test('web mods match declared HTTP pages and defer styles that request linked resources',()=>{
  const rules=[{matches:['https://*.example.test/*'],exclude:['https://help.example.test/*'],css:['sample.css']}];
  assert.deepEqual(matchedStyles(rules,'https://shop.example.test/item'),['sample.css']);
  for(const url of ['file:///private','https://help.example.test/','https://another.test/'])assert.deepEqual(matchedStyles(rules,url),[]);
  assert.match(offlineCss(Buffer.from('@media (min-width: 600px){h1{color:red}}')),/color:red/);
  for(const css of ['@import "theme.css";','body { background:url(image.png); }','p { background:image-set("w.png" 1x); }'])
    assert.throws(()=>offlineCss(Buffer.from(css)),/unsupported/);
});

test('review is inert, choices persist independently, and modified assets never load',async()=>{
  const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'nox-mod-fixture-'));
  const source=path.join(workspace,'source'),directory=path.join(workspace,'library');
  await fs.mkdir(source);
  await fs.writeFile(path.join(source,'manifest.json'),JSON.stringify(manifest));
  await fs.writeFile(path.join(source,'art.png'),'generated stand-in bytes');
  const library=new GxModLibrary(directory);
  await library.open();await library.prepare(source,false);
  assert.deepEqual(library.presentation(),{});
  const id=library.snapshot().review.id;
  await library.accept();
  assert.deepEqual(library.presentation(),{});
  assert.throws(()=>library.choose('shaders',id),/unsupported/);
  library.choose('theme',id);
  library.choose('wallpaper',id);
  const url=library.presentation().wallpaper.dark.url;
  assert.equal((await library.verifyAsset(url)).format,'image/png');
  const reopened=new GxModLibrary(directory);await reopened.open();
  assert.deepEqual(reopened.presentation(),library.presentation());
  reopened.choose('theme',null);
  assert.equal(reopened.presentation().wallpaper.dark.url,url);
  assert.equal(reopened.presentation().theme,undefined);
  await fs.writeFile(path.join(directory,id,'art.png'),'changed fixture');
  assert.equal(await reopened.verifyAsset(url),null);
});
test('expanded GX packages preserve named choices and apply exact saved combinations',async()=>{
  const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'nox-gx2-contract-'));
  await fs.mkdir(path.join(workspace,'source'));
  const source=path.join(workspace,'source'),dest=path.join(workspace,'library');
  const expanded={name:'Multi-component mod',version:'2',mod:{schema_version:2,payload:{
    theme:[{id:'original',name:'Original',...theme},{id:'alternate',name:'Alternate',...theme}],
    fonts:[{id:'type',name:'Type',body:{variants:[{weight:400,style:'normal',path:'fixture.woff2'}]}}],
    background_music:[
      {id:'calm',name:'Calm',tracks:['quiet.ogg']},
      {id:'stack',name:'Stack',tracks:['quiet.ogg','extra.ogg']},
    ],
    image_overrides:[{id:'linked',name:'Linked',images:{sidebar_mods_button:'linked.json'}}],
  }}};
  await fs.writeFile(path.join(source,'manifest.json'),JSON.stringify(expanded));
  for(const file of ['fixture.woff2','quiet.ogg','extra.ogg'])await fs.writeFile(path.join(source,file),file);
  const linked={w:24,h:24,fr:30,ip:0,op:30,layers:[{ty:2,refId:'linked'}],assets:[{id:'linked',p:'https://example.invalid/image.png'}]};
  await fs.writeFile(path.join(source,'linked.json'),JSON.stringify(linked));
  const library=new GxModLibrary(dest);
  await library.open();
  await library.prepare(source,false);
  const review=library.snapshot().review;
  assert.equal(review.categories.find(item=>item.key==='image_overrides').supported,false);
  const choice=(category,index)=>review.categories.find(item=>item.key===category).variants[index].id;
  await library.accept();
  assert.deepEqual(library.presentation(),{});
  library.choose('theme',review.id,choice('theme',1));
  library.choose('fonts',review.id);
  library.choose('background_music',review.id,choice('background_music',1));
  const [,extra]=library.presentation().music;
  assert.ok(await library.verifyAsset(extra));
  library.savePreset('Violet');
  library.choose('background_music',review.id,choice('background_music',0));
  assert.equal(await library.verifyAsset(extra),null,'another component does not authorize its assets');
  library.choose('theme',null);
  const reopened=new GxModLibrary(dest);await reopened.open();
  reopened.applyPreset(reopened.snapshot().presets[0].id);
  assert.equal(reopened.snapshot().variants.theme,choice('theme',1));
  assert.deepEqual(reopened.presentation().music,library.presentation().music.concat(extra));
  assert.match(reopened.presentation().fonts.body[0].url,/fixture\.woff2$/);
});

test('sidebar icon validator rejects expressions and recursive compositions',()=>{
  const {checkVectorAnimation}=require('../browser/gx-mod-format.cjs');
  const vector={w:24,h:24,fr:30,ip:0,op:30,layers:[{ty:4}]};
  assert.doesNotThrow(()=>checkVectorAnimation(vector));
  assert.throws(()=>checkVectorAnimation({...vector,layers:[{ty:4,ks:{x:'executable expression'}}]}),/unsafe/);
  assert.throws(()=>checkVectorAnimation({...vector,assets:[{id:'cycle',layers:[{ty:0,refId:'cycle'}]}]}),/recursive/);
});
