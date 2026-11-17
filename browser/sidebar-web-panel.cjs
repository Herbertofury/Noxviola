'use strict';
// A real, on-demand web panel. It uses the existing identity Session; it never
// executes browser-shell code in the website. Popups remain in that identity.
const {httpUrl}=require('./state.cjs');

function createSidebarWebPanel({WebContentsView,getWindow,getSession,identityReady=async()=>{},loadFavicon=async()=>'',onInteraction=()=>{},onChange=()=>{}}){
  const entries=new Map();let current=null,visible=false,bounds=null,disposed=false;
  const keyFor=(identity,url)=>JSON.stringify([identity,url]);
  function canTraverse(wc,direction){
    if(!wc||wc.isDestroyed())return false;
    const history=wc.navigationHistory,back=direction==='back';
    if(!history||typeof history.canGoBack!=='function'||typeof history.canGoForward!=='function'||typeof history.getActiveIndex!=='function'||typeof history.getEntryAtIndex!=='function')return false;
    try{
      if(!(back?history.canGoBack():history.canGoForward()))return false;
      return Boolean(httpUrl(history.getEntryAtIndex(history.getActiveIndex()+(back?-1:1))?.url));
    }catch{return false;}
  }
  function snapshot(){
    const wc=current?.view.webContents;
    return {visible:Boolean(visible&&current),identity:current?.identity||null,site:current?.site||null,
      url:current?.url||null,title:current?.title||'',loading:Boolean(current?.loading),error:current?.error||'',
      muted:Boolean(wc&&!wc.isDestroyed()&&wc.isAudioMuted()),canGoBack:canTraverse(wc,'back'),canGoForward:canTraverse(wc,'forward'),loadedPanels:entries.size,
      icons:current?[...entries.values()].filter(entry=>entry.identity===current.identity&&entry.favicon).map(entry=>({site:entry.site,icon:entry.favicon})):[]};
  }
  function notify(){onChange(snapshot());}
  function validBounds(rect,win){
    if(!rect||!['x','y','width','height'].every(name=>Number.isFinite(rect[name])))return null;
    const [w,h]=win.getContentSize(),left=Math.max(0,Math.min(w,Math.round(rect.x))),top=Math.max(0,Math.min(h,Math.round(rect.y)));
    return {x:left,y:top,width:Math.max(0,Math.min(Math.round(rect.width),w-left)),height:Math.max(0,Math.min(Math.round(rect.height),h-top))};
  }
  function layout(rect){
    if(rect!==undefined)bounds=rect;
    const win=getWindow();if(disposed||!win||win.isDestroyed()||!current||current.view.webContents.isDestroyed())return;
    const clipped=validBounds(bounds,win),show=visible&&!!clipped&&clipped.width>0&&clipped.height>0;
    if(clipped)current.view.setBounds(clipped);
    current.view.setVisible(show);
    if(show)win.contentView.addChildView(current.view);
  }
  function start(entry){
    if(entry.started||entry.pending||disposed)return;
    entry.pending=Promise.resolve().then(()=>identityReady(entry.identity)).then(()=>{
      entry.pending=null;
      if(disposed||!entries.has(entry.key)||entry.view.webContents.isDestroyed()||!visible||current!==entry)return;
      entry.started=true;entry.loading=true;entry.error='';notify();
      return entry.view.webContents.loadURL(entry.site).catch(()=>{
        if(disposed||!entries.has(entry.key))return;
        entry.loading=false;entry.error='This sidebar page could not load.';if(current===entry)notify();
      });
    }).catch(()=>{
      entry.pending=null;if(disposed||!entries.has(entry.key))return;
      entry.error='This identity could not be initialized for the sidebar.';if(current===entry)notify();
    });
  }
  function popupAddress(url){return url==='about:blank'||Boolean(httpUrl(url));}
  function protectPopupSource(source,entry,session){
    source.setWindowOpenHandler(({url})=>{
      if(disposed||!entries.has(entry.key)||!popupAddress(url))return {action:'deny'};
      return {action:'allow',overrideBrowserWindowOptions:{parent:getWindow(),autoHideMenuBar:true,show:true,
        webPreferences:{session,nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false}}};
    });
    source.on('did-create-window',child=>{
      const wc=child.webContents;
      if(disposed||!entries.has(entry.key)||wc.session!==session){child.close();return;}
      entry.popups.add(child);
      child.on('closed',()=>entry.popups.delete(child));
      child.setMenu(null);
      const title=url=>{let origin='Blank page';try{const parsed=new URL(url);if(httpUrl(url))origin=parsed.origin;}catch{}child.setTitle(`Noxviola · ${entry.identity} · ${origin}`);};
      child.on('page-title-updated',event=>event.preventDefault());
      title(wc.getURL());
      for(const eventName of ['will-navigate','will-redirect'])wc.on(eventName,(event,url)=>{if(!popupAddress(url))event.preventDefault();});
      wc.on('did-navigate',(_event,url)=>title(url));
      wc.on('did-navigate-in-page',(_event,url,isMainFrame)=>{if(isMainFrame)title(url);});
      protectPopupSource(wc,entry,session);
    });
  }
  function make(identity,site,session){
    const win=getWindow();if(!win||win.isDestroyed())throw new Error('The browser window is unavailable.');
    const view=new WebContentsView({webPreferences:{session,nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,spellcheck:true}});
    const wc=view.webContents;
    if(wc.session!==session){wc.close();throw new Error('The sidebar identity session could not be verified.');}
    const entry={key:keyFor(identity,site),identity,site,url:site,title:'',favicon:'',faviconRevision:0,view,popups:new Set(),started:false,pending:null,loading:false,error:''};
    view.setBackgroundColor('#171122');view.setVisible(false);win.contentView.addChildView(view);
    protectPopupSource(wc,entry,session);
    wc.on('before-mouse-event',(_event,input)=>{if(input.type==='mouseDown')onInteraction();});
    wc.on('before-input-event',(_event,input)=>{if(input.type==='keyDown')onInteraction();});
    for(const eventName of ['will-navigate','will-redirect'])wc.on(eventName,(event,url)=>{if(!httpUrl(url))event.preventDefault();});
    wc.on('did-start-navigation',(_event,_url,isSameDocument,isMainFrame)=>{if(isMainFrame&&!isSameDocument){entry.faviconRevision++;if(entry.favicon){entry.favicon='';if(current?.identity===entry.identity)notify();}}});
    wc.on('page-favicon-updated',(_event,urls)=>{
      const page=wc.getURL(),revision=++entry.faviconRevision;
      Promise.resolve().then(()=>loadFavicon(session,page,urls)).then(icon=>{
        if(disposed||entries.get(entry.key)!==entry||wc.isDestroyed()||entry.faviconRevision!==revision)return;
        if(entry.favicon!==icon){entry.favicon=icon;if(current?.identity===entry.identity)notify();}
      }).catch(()=>{});
    });
    wc.on('page-title-updated',(_event,title)=>{entry.title=title;if(current===entry)notify();});
    wc.on('did-start-loading',()=>{entry.loading=true;entry.error='';if(current===entry)notify();});
    wc.on('did-stop-loading',()=>{entry.loading=false;if(current===entry)notify();});
    const navigated=(_event,url,isMainFrame=true)=>{if(isMainFrame===false)return;const clean=httpUrl(url);if(clean){entry.url=clean;if(current===entry)notify();}};
    wc.on('did-navigate',(event,url)=>navigated(event,url,true));wc.on('did-navigate-in-page',(event,url,isMainFrame)=>navigated(event,url,isMainFrame));
    wc.on('did-fail-load',(_event,code,_description,_url,isMainFrame)=>{if(isMainFrame&&code!==-3){entry.loading=false;entry.error='This sidebar page could not load.';if(current===entry)notify();}});
    wc.on('render-process-gone',()=>{entry.loading=false;entry.error='This sidebar page stopped. Reload to try again.';if(current===entry)notify();});
    entries.set(entry.key,entry);return entry;
  }
  function open({identity,url}={}){
    if(disposed)throw new Error('The sidebar is closed.');
    if(typeof identity!=='string'||!identity)throw new Error('Choose a browser identity.');
    const site=httpUrl(url);if(!site)throw new Error('Use an HTTP(S) address without embedded credentials.');
    const session=getSession(identity),key=keyFor(identity,site);let entry=entries.get(key);
    if(entry&&entry.view.webContents.session!==session)throw new Error('The sidebar identity session has changed.');
    if(!entry)entry=make(identity,site,session);
    if(current&&current!==entry&&!current.view.webContents.isDestroyed())current.view.setVisible(false);
    current=entry;visible=true;layout();start(entry);notify();return snapshot();
  }
  function hide(){if(disposed)return;visible=false;if(current&&!current.view.webContents.isDestroyed())current.view.setVisible(false);notify();}
  function reload(){if(disposed||!current||current.view.webContents.isDestroyed())throw new Error('Open a sidebar page first.');current.error='';if(!current.started)start(current);else current.view.webContents.reload();notify();}
  function traverse(direction){
    const wc=current?.view.webContents;
    if(disposed||!canTraverse(wc,direction))throw new Error(direction==='back'?'No earlier sidebar page is available.':'No later sidebar page is available.');
    if(direction==='back')wc.navigationHistory.goBack();else wc.navigationHistory.goForward();
  }
  const back=()=>traverse('back'),forward=()=>traverse('forward');
  function mute(value){if(disposed||!current||typeof value!=='boolean')throw new Error('Choose an open sidebar page and a mute setting.');current.view.webContents.setAudioMuted(value);notify();}
  function release({identity,url}={}){
    const site=httpUrl(url),entry=site&&entries.get(keyFor(identity,site));if(!entry)return false;
    entries.delete(entry.key);if(current===entry){current=null;visible=false;}
    for(const popup of entry.popups)if(!popup.isDestroyed())popup.close();
    const win=getWindow();if(!entry.view.webContents.isDestroyed()){if(win&&!win.isDestroyed())win.contentView.removeChildView(entry.view);entry.view.webContents.close();}notify();return true;
  }
  function destroy(){if(disposed)return;for(const entry of [...entries.values()])release({identity:entry.identity,url:entry.site});disposed=true;current=null;visible=false;}
  return {open,hide,layout,reload,back,forward,mute,release,state:snapshot,destroy};
}
module.exports={createSidebarWebPanel};
