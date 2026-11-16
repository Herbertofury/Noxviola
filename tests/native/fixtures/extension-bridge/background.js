'use strict';
// Every operation below uses the installed package's real API surface. No direct
// Electron import, host internals, privileged token or testing-only IPC exists.
const targetWaiters = new Map();
let running = false;
function assert(value,message) { if (!value) throw new Error(message); }
function timedEvent(register,label) {
  let release, timeout;
  const promise = new Promise((resolve,reject) => {
    timeout = setTimeout(() => { release?.(); reject(new Error(label+' did not arrive before the failure deadline.')); },10000);
    try { release = register(value => { clearTimeout(timeout); release?.(); resolve(value); }); }
    catch (error) { clearTimeout(timeout); reject(error); }
  });
  // A native API may reject before the corresponding event is awaited. Retain
  // the original rejection for the caller without an unhandled Promise warning.
  promise.catch(() => {});
  return {promise,cancel:() => { clearTimeout(timeout); release?.(); }};
}
function callbackCall(method,...args) {
  return new Promise((resolve,reject) => method(...args,value => {
    if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message)); else resolve(value);
  }));
}
async function mustReject(work,label) {
  try { await work(); } catch (error) { assert(typeof error?.message === 'string' && error.message.length,label+' lost the failure reason.'); return error.message; }
  throw new Error(label+' unexpectedly succeeded.');
}
function solidImageData(size,rgba) {
  const image=new ImageData(size,size);
  for(let offset=0;offset<image.data.length;offset+=4)image.data.set(rgba,offset);
  return image;
}
async function run(message,originatingTabId) {
  const result = {version:1,runId:message.runId,passed:false,checks:[],details:{}};
  let step = 'input', created, bookmark, cookieName, readiness, createdEvent, bookmarkEvent;
  const check = name => { step = name; };
  const pass = name => result.checks.push({name,passed:true});
  const url = new URL(message.personalFixtureUrl);
  let originalTabs;
  try {
    assert(url.protocol === 'http:' && url.hostname === '127.0.0.1','The fixture only accepts its loopback origin.');
    assert(Number.isSafeInteger(message.foreignTabId) && message.foreignTabId > 0,'A real foreign browser tab ID is required.');
    assert(typeof browser === 'object' && browser !== chrome,'A real Promise namespace is required.');
    check('chrome-callback-query');
    originalTabs = await callbackCall(chrome.tabs.query,{});
    assert(originalTabs.length > 0 && originalTabs.every(tab => Number.isSafeInteger(tab.id)),'Callback query did not return canonical browser tabs.');
    pass(step);
    check('browser-promise-query');
    const promisedTabs = await browser.tabs.query({});
    assert(JSON.stringify(promisedTabs.map(tab => tab.id)) === JSON.stringify(originalTabs.map(tab => tab.id)),'Promise and callback queries disagree.');
    assert(!promisedTabs.some(tab => tab.id === message.foreignTabId),'A foreign identity tab leaked through query.');
    pass(step);

    check('first-tab-event');
    createdEvent = timedEvent(resolve => {
      const listener = tab => { if (tab.url === url.href) resolve(tab); };
      browser.tabs.onCreated.addListener(listener); return () => browser.tabs.onCreated.removeListener(listener);
    },'First created-tab event');
    readiness = timedEvent(resolve => {
      targetWaiters.set(message.runId,resolve); return () => targetWaiters.delete(message.runId);
    },'One-shot target content ready message');
    created = await browser.tabs.create({url:url.href,active:false});
    result.details.createdTabId = created.id;
    assert(created.active === false,'Creating an inactive tab activated it.');
    const event = await createdEvent.promise;
    assert(event.id === created.id,'First tab event used a different public ID.');
    pass(step);

    check('native-message-ids');
    const ready = await readiness.promise;
    result.details.readySenderTabId = ready.tab.id;
    assert(ready.tab.id === created.id,'Native runtime sender ID was not translated to the public tab ID.');
    const pong = await browser.tabs.sendMessage(created.id,{kind:'noxviola-bridge-ping',runId:message.runId});
    assert(pong.kind === 'noxviola-bridge-pong' && pong.runId === message.runId && pong.url === url.href,'Native target messaging did not reach the created page.');
    pass(step);

    check('canonical-tabs');
    const fetched = await browser.tabs.get(created.id); assert(fetched.url === url.href,'Created tab cannot be read back.');
    const updated = await browser.tabs.update(created.id,{muted:true}); assert(updated.mutedInfo?.muted === true,'Real mute state did not change.');
    const moved = await browser.tabs.move(created.id,{index:0}); assert(moved.id === created.id && moved.index === 0,'Real tab move did not update order.');
    pass(step);

    check('bookmark-service');
    const title = 'Synthetic bridge '+message.runId;
    bookmarkEvent = timedEvent(resolve => {
      const listener = (id,node) => { if (node.title === title) resolve({id,node}); };
      browser.bookmarks.onCreated.addListener(listener); return () => browser.bookmarks.onCreated.removeListener(listener);
    },'Durable bookmark-created event');
    bookmark = await browser.bookmarks.create({title,url:url.href}); result.details.bookmarkId = bookmark.id;
    assert((await bookmarkEvent.promise).id === bookmark.id,'Bookmark event did not describe the durable mutation.');
    const changed = await browser.bookmarks.update(bookmark.id,{title:title+' edited'});
    const readback = await browser.bookmarks.get(bookmark.id);
    assert(changed.title === title+' edited' && readback[0].title === changed.title,'Canonical bookmark write/read disagreed.');
    pass(step);

    check('cookie-host-and-identity');
    const existing = await browser.cookies.get({url:url.origin,name:'noxviola_fixture'});
    assert(existing?.value === message.expectedCookie,'The bridge read another identity\'s cookie jar.');
    cookieName = 'noxviola_bridge_'+message.runId.replace(/[^a-z0-9]/gi,'_'); result.details.cookieName = cookieName;
    const written = await browser.cookies.set({url:url.origin,name:cookieName,value:message.runId,path:'/',sameSite:'lax',expirationDate:Math.floor(Date.now()/1000)+600});
    assert(written.value === message.runId && (await browser.cookies.get({url:url.origin,name:cookieName})).value === message.runId,'Cookie write/read failed.');
    result.details.deniedHost = await mustReject(() => browser.cookies.get({url:'https://example.invalid/',name:'ungranted'}),'Ungrantable host cookie request');
    await mustReject(() => browser.cookies.getAll({storeId:'foreign-identity'}),'Caller-selected cookie identity');
    pass(step);

    check('foreign-tab-denied');
    await mustReject(() => browser.tabs.get(message.foreignTabId),'Foreign identity tab read');
    await mustReject(() => browser.tabs.query({identity:'foreign-identity'}),'Caller-asserted identity query');
    pass(step);

    check('callback-last-error');
    let callbackError, callbackValue;
    await new Promise(resolve => chrome.windows.create({},value => { callbackError = chrome.runtime.lastError?.message; callbackValue = value; resolve(); }));
    assert(callbackValue === undefined,'Denied callback returned a success value.');
    assert(typeof callbackError === 'string' && callbackError.length,'Chrome callback lost runtime.lastError.');
    assert(chrome.runtime.lastError === undefined,'runtime.lastError escaped its callback lifetime.'); pass(step);
    check('promise-rejection');
    await mustReject(() => browser.windows.create({}),'Unsupported Promise window creation'); pass(step);

    check('action-state');
    await browser.browserAction.setTitle({title:'Bridge native accepted'});
    await browser.browserAction.setBadgeText({text:'OK'});
    await browser.browserAction.setBadgeBackgroundColor({color:[37,99,235,255]});
    assert(await browser.browserAction.getTitle({}) === 'Bridge native accepted','Action title readback failed.');
    assert(await browser.browserAction.getBadgeText({}) === 'OK','Action badge readback failed.');
    assert(JSON.stringify(await browser.browserAction.getBadgeBackgroundColor({})) === '[37,99,235,255]','Action badge color readback failed.');
    result.details.actionTitle = 'Bridge native accepted'; result.details.actionBadge = 'OK'; result.details.actionColor = [37,99,235,255]; pass(step);

    check('action-icons');
    assert(Number.isSafeInteger(originatingTabId),'The icon observer requires the real originating content tab.');
    result.details.iconStages=[];
    const observeIcon=async(stage,rgba,sizes=[16,32])=>{
      const expected={variants:sizes.map(size=>({size,width:size,height:size,rgba}))};
      const response=await browser.tabs.sendMessage(originatingTabId,{kind:'noxviola-bridge-icon-stage',runId:message.runId,stage,expected});
      assert(response?.observed===true && response.stage===stage,response?.error || 'The actual toolbar icon stage was not observed.');
      result.details.iconStages.push({stage,expected});
    };
    const purple=[120,50,170,255],green=[22,163,74,255],blue=[37,99,235,255],orange=[234,88,12,255];
    await observeIcon('manifest-default',purple);
    await browser.browserAction.setIcon({path:{16:'icons/path16.png',32:'icons/path32.png'}});
    await observeIcon('path-map',green);
    await browser.browserAction.setIcon({imageData:{16:solidImageData(16,blue),32:solidImageData(32,blue)},path:{16:'https://unused.invalid/icon.png'}});
    await observeIcon('global-imagedata',blue);
    await browser.browserAction.setIcon({tabId:originatingTabId,imageData:solidImageData(16,orange)});
    await observeIcon('tab-imagedata',orange,[16]);
    await browser.browserAction.setIcon({tabId:originatingTabId,imageData:null,path:{}});
    await observeIcon('tab-reset',blue);
    await mustReject(()=>browser.browserAction.setIcon({path:'https://ungranted.invalid/icon.png'}),'Remote action icon');
    await browser.browserAction.setIcon({imageData:{},path:{}});
    await observeIcon('global-reset',purple);pass(step);
  } catch (error) {
    result.failure = {step,message:String(error?.message || error),stack:String(error?.stack || '')};
  } finally {
    const errors = [];
    for (const pending of [readiness,createdEvent,bookmarkEvent]) { try { pending?.cancel(); } catch (error) { errors.push(error.message); } }
    if (bookmark) { try { await browser.bookmarks.remove(bookmark.id); } catch (error) { errors.push('bookmark: '+error.message); } }
    if (cookieName) { try { await browser.cookies.remove({url:url.origin,name:cookieName}); } catch (error) { errors.push('cookie: '+error.message); } }
    if (created) { try { await browser.tabs.remove(created.id); } catch (error) { errors.push('tab: '+error.message); } }
    try {
      if (originalTabs) assert(JSON.stringify((await browser.tabs.query({})).map(tab => tab.id)) === JSON.stringify(originalTabs.map(tab => tab.id)),'Pre-existing ordered tabs changed.');
      if (bookmark) assert((await browser.bookmarks.search({url:url.href})).every(node => node.id !== bookmark.id),'Fixture bookmark remains after removal.');
      if (cookieName) assert(await browser.cookies.get({url:url.origin,name:cookieName}) === null,'Fixture cookie remains after removal.');
    } catch (error) { errors.push(error.message); }
    if (errors.length) result.cleanupErrors = errors;
    else if (!result.failure) { pass('cleanup'); result.passed = true; }
  }
  return result;
}
browser.runtime.onMessage.addListener((message,sender) => {
  if (message?.kind === 'noxviola-bridge-target-ready') {
    const resolve = targetWaiters.get(message.runId);
    if (resolve) resolve(sender);
    return Promise.resolve({accepted:!!resolve});
  }
  if (message?.kind !== 'noxviola-bridge-run') return undefined;
  if (running) return Promise.resolve({version:1,runId:message.runId,passed:false,checks:[],failure:{step:'concurrent-run',message:'Concurrent fixture dispatch is refused.'}});
  running = true;
  return run(message,sender.tab?.id).finally(() => { running = false; });
});
