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
  assert.deepEqual(meta.payload.theme.dark.accent,[284,72,49]);
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
