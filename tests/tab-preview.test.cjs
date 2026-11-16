'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const {createTabPreview} = require('../browser/tab-preview-host.cjs');

function fixture(tabs, size = [800,600]) {
  const views = [], ipcMain = new EventEmitter();
  class FakeView {
    constructor(options) {
      this.options = options; this.sent = []; this.visible = false; this.dead = false;
      this.webContents = {
        isDestroyed:()=>this.dead, on:()=>{}, setWindowOpenHandler:()=>{}, loadFile:async()=>{},
        send:(_channel,data)=>this.sent.push(data), close:()=>{this.dead=true;},
      };
      views.push(this);
    }
    setBackgroundColor() {} setVisible(value) {this.visible=value;} setBounds(value) {this.bounds=value;}
  }
  const win={isDestroyed:()=>false,isMinimized:()=>false,getContentSize:()=>size,contentView:{addChildView:()=>{},removeChildView:()=>{}}};
  let isBlocked=false;
  const preview=createTabPreview({WebContentsView:FakeView,ipcMain,root:'test',getWindow:()=>win,getTabInfo:id=>tabs[id],blocked:()=>isBlocked});
  const acknowledge=(view,token=view.sent.at(-1).token,sender=view.webContents)=>ipcMain.emit('tab-preview-rendered',{sender},token);
  return {preview,views,ipcMain,acknowledge,setBlocked:value=>{isBlocked=value;}};
}
const position={x:780,y:8,width:20,height:30,orientation:'horizontal'};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function image(value='data:image/png;base64,cmVhbA==') {return {isEmpty:()=>false,resize:()=>({toDataURL:()=>value})};}
function page(capture) {return {isDestroyed:()=>false,isLoading:()=>false,getURL:()=> 'https://example.com/',capturePage:capture};}
function info(contents,identity='personal') {return {title:'Example',url:'https://example.com/',identity,contents};}

test('real captures are shown only after the preview renderer acknowledges new content',async()=>{
  let args;const f=fixture({a:info(page(async(...value)=>{args=value;return image();}))});
  await f.preview.show('a',position);const view=f.views[0];
  assert.equal(view.options.webPreferences.sandbox,true);assert.equal(view.options.webPreferences.contextIsolation,true);assert.equal(view.options.webPreferences.nodeIntegration,false);
  assert.equal(view.visible,false,'old overlay pixels must remain hidden before acknowledgement');
  assert.equal(view.sent[0].image,'');assert.equal(view.sent[0].pending,true);
  assert.equal(view.sent[1].image,'data:image/png;base64,cmVhbA==');assert.equal(view.sent[1].pending,false);
  assert.deepEqual(args,[undefined,{stayHidden:true,stayAwake:false}]);
  f.acknowledge(view,'wrong');assert.equal(view.visible,false);
  f.acknowledge(view,view.sent[0].token,{});assert.equal(view.visible,false);
  f.acknowledge(view,view.sent[0].token);assert.equal(view.visible,true);
  assert.ok(view.bounds.x>=0&&view.bounds.x+view.bounds.width<=800);
  assert.ok(view.bounds.y>=0&&view.bounds.y+view.bounds.height<=600);
  f.preview.destroy();assert.equal(f.ipcMain.listenerCount('tab-preview-rendered'),0);
});

test('a new identity cannot flash the previous tab screenshot',async()=>{
  const f=fixture({a:info(page(async()=>image()),'personal'),b:info(null,'work')});
  await f.preview.show('a',position);const view=f.views[0],old=view.sent[0].token;
  f.acknowledge(view,old);assert.equal(view.visible,true);
  f.preview.hide();await f.preview.show('b',position);assert.equal(view.visible,false);
  const fresh=view.sent.at(-1);assert.equal(fresh.image,'');assert.equal(fresh.pending,false);
  f.acknowledge(view,old);assert.equal(view.visible,false);
  f.acknowledge(view,fresh.token);assert.equal(view.visible,true);
  f.preview.destroy();
});

test('navigation, tab close and dismissal invalidate in-flight captures',async()=>{
  for(const action of ['navigation','close','dismiss']) {
    let resolve;const pending=new Promise(done=>{resolve=done;});const tab=info(page(()=>pending));
    const tabs={a:tab},f=fixture(tabs),showing=f.preview.show('a',position);await tick();
    const view=f.views[0],token=view.sent[0].token;f.acknowledge(view,token);assert.equal(view.visible,true);
    if(action==='navigation')f.preview.invalidate('a');
    else if(action==='close'){delete tabs.a;f.preview.invalidate('a');}
    else f.preview.hide();
    resolve(image());await showing;assert.equal(view.visible,false);assert.equal(view.sent.length,1);
    f.acknowledge(view,token);assert.equal(view.visible,false);f.preview.destroy();
  }
});

test('changed document without an event is hidden and its captured pixels are discarded',async()=>{
  let resolve,url='https://example.com/';const pending=new Promise(done=>{resolve=done;});
  const wc={isDestroyed:()=>false,isLoading:()=>false,getURL:()=>url,capturePage:()=>pending};
  const tab=info(wc),f=fixture({a:tab}),showing=f.preview.show('a',position);await tick();
  const view=f.views[0];f.acknowledge(view,view.sent[0].token);assert.equal(view.visible,true);
  url='https://example.com/changed';tab.url=url;resolve(image());await showing;
  assert.equal(view.visible,false);assert.equal(view.sent.length,1);f.preview.destroy();
});

test('capture failure, empty images and dormant tabs display unavailable, never fake images',async()=>{
  for(const contents of [null,page(async()=>{throw new Error('capture denied');}),page(async()=>({isEmpty:()=>true}))]) {
    const f=fixture({a:info(contents)});await f.preview.show('a',position);const view=f.views[0],last=view.sent.at(-1);
    assert.equal(last.image,'');assert.equal(last.pending,false);f.acknowledge(view,view.sent[0].token);assert.equal(view.visible,true);f.preview.destroy();
  }
});

test('horizontal and vertical popups stay within small and normal windows',async()=>{
  for(const size of [[1,1],[80,50],[800,600]])for(const orientation of ['horizontal','vertical']) {
    const f=fixture({a:info(null)},size),anchor={x:9999,y:9999,width:40,height:30,orientation};
    await f.preview.show('a',anchor);const view=f.views[0];f.acknowledge(view);
    assert.ok(view.bounds.x>=0&&view.bounds.y>=0);
    assert.ok(view.bounds.x+view.bounds.width<=size[0]&&view.bounds.y+view.bounds.height<=size[1]);f.preview.destroy();
  }
});

test('blocked panels and invalid anchors cannot create or reveal a preview',async()=>{
  const f=fixture({a:info(null)});f.setBlocked(true);await f.preview.show('a',position);assert.equal(f.views.length,0);
  f.setBlocked(false);await f.preview.show('a',{...position,width:0});assert.equal(f.views.length,0);
  await f.preview.show('a',position);const view=f.views[0];f.setBlocked(true);f.acknowledge(view);assert.equal(view.visible,false);f.preview.destroy();
});
