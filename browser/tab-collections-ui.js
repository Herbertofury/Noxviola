'use strict';
// Bounded page replacement, shared by full library and sidebar. No accumulated DOM.
window.createCollectionUI=function(root,api,sidebar=false){
  let identity='',group=null,after=0,next=null,history=[],archived=false,busy=false,generation=0,refreshPending=false,folder=null,folders=false,moving=null;
  const renameDrafts=new Map();
  const draftKey=(kind,id)=>`${identity}:${kind}:${id}`;
  const el=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
  const status=el('p');status.setAttribute('role','status');
  const actions=el('div');actions.className='controls';const title=el('input');title.placeholder='Collection name';title.setAttribute('aria-label','Collection name');
  const pinned=el('input');pinned.type='checkbox';const pinLabel=el('label','Include pinned tabs ');pinLabel.append(pinned);
  const search=el('input');search.type='search';search.placeholder='Search this collection';search.setAttribute('aria-label','Search this collection');
  const list=el('div');list.className='collection-list';const paging=el('div');paging.className='controls';
  async function act(work){if(busy)return;busy=true;root.setAttribute('aria-busy','true');for(const b of root.querySelectorAll('button'))b.disabled=true;try{await work();}catch(e){status.textContent=e.message;}finally{busy=false;root.removeAttribute('aria-busy');for(const b of root.querySelectorAll('button'))b.disabled=false;prev.disabled=!history.length;forward.disabled=next===null;if(refreshPending){refreshPending=false;void act(load);}}}
  function button(text,work){const b=el('button',text);b.type='button';b.onclick=()=>act(work);return b;}
  const reset=()=>{after=0;history=[];};
  const save=close=>async()=>{const result=await api.command('collection-save',{identity,title:title.value,close,includePinned:pinned.checked});group=null;folder=null;folders=false;archived=false;reset();await load();status.textContent=`Saved ${result.saved} tabs; closed ${result.closed}. Changed or unsupported pages remain open.`;};
  actions.append(title,pinLabel,button('Save tabs',save(false)),button('Save and close',save(true)),button('Collections',async()=>{group=null;folders=false;reset();await load();}),button('Archived',async()=>{archived=!archived;group=null;folders=false;moving=null;reset();await load();}));
  actions.append(button('Folders',async()=>{group=null;folders=true;reset();await load();}),button('Root',async()=>{group=null;folder=null;folders=false;reset();await load();}),button('New folder',async()=>{await api.command('collection-query',{op:'folder-create',identity,title:title.value});group=null;folders=true;reset();await load();}));
  const placement=el('div');placement.className='controls';
  const place=button('Move here at end',async()=>{if(!moving||moving.identity!==identity)return;await api.command('collection-query',{op:'move',identity,group:moving.id,folder:folder?.id||null});moving=null;group=null;folders=false;reset();await load();});
  placement.append(place,button('Cancel move',async()=>{moving=null;await load();}));
  if(sidebar)actions.append(button('Full library',()=>api.command('collections')));
  const importText=el('textarea');importText.setAttribute('aria-label','Import OneTab text: URL | title, one per line');importText.placeholder='Paste OneTab export: URL | title, one per line';
  const details=el('details'),summary=el('summary','Import tab links');details.append(summary,importText,button('Import',async()=>{const submitted=importText.value;await api.command('collection-import',{identity,title:title.value,text:submitted});if(importText.value===submitted)importText.value='';group=null;folder=null;folders=false;archived=false;reset();await load();}));
  const prev=button('Previous',async()=>{after=history.pop()||0;await load();});const forward=button('Next',async()=>{history.push(after);after=next;await load();});paging.append(button('First page',async()=>{reset();await load();}),prev,forward);
  const searchButton=button('Search',async()=>{after=0;history=[];await load();});
  root.append(el('p','Saves URLs, titles and pins for this identity and workspace, not page history or unsaved forms. Pinned and internal pages stay open unless included/supported.'),actions,placement,details,search,searchButton,status,list,paging);
  async function load(){
    const token=++generation,owner=identity;
    const page=await api.command('collection-query',{op:group?'tabs':folders?'folders':'groups',identity,group:group?.id,folder:folder?.id||null,after,archived,query:search.value});
    if(token!==generation||owner!==identity)return;
    next=page.next;placement.hidden=!moving;place.hidden=folders||!!group;search.hidden=!group;searchButton.hidden=!group;
    const nodes=page.items.map(item=>{
      const card=el('article');card.className='card';
      if(group){const label=el('strong',item.title||item.url),url=el('p',item.url);url.className='subtle';card.append(label,url,button('Open tab (keep saved)',()=>api.command('collection-open',{identity:owner,id:item.id})));}
      else if(folders){
        card.append(el('strong',item.title),button('Open folder',async()=>{folder=item;folders=false;group=null;reset();await load();}));
        const rename=el('input'),key=draftKey('folder',item.id);rename.value=renameDrafts.get(key)??item.title;rename.oninput=()=>renameDrafts.set(key,rename.value);rename.setAttribute('aria-label',`Rename folder ${item.title}`);card.append(rename,button('Rename folder',async()=>{rename.disabled=true;try{await api.command('collection-query',{op:'folder-rename',identity:owner,folder:item.id,title:rename.value});renameDrafts.delete(key);reset();await load();}finally{rename.disabled=false;}}));
      }
      else{
        card.append(el('strong',`${item.starred?'★ ':''}${item.locked?'🔒 ':''}${item.title}`),el('p',`${item.count.toLocaleString()} tabs · ${new Date(item.created).toLocaleString()}`),button('Browse',async()=>{group=item;after=0;history=[];search.value='';await load();}));
        const rename=el('input'),key=draftKey('collection',item.id);rename.value=renameDrafts.get(key)??item.title;rename.oninput=()=>renameDrafts.set(key,rename.value);rename.setAttribute('aria-label',`Rename collection ${item.title}`);card.append(rename,button('Rename collection',async()=>{rename.disabled=true;try{await api.command('collection-query',{op:'update',identity:owner,group:item.id,field:'title',value:rename.value});renameDrafts.delete(key);reset();await load();}finally{rename.disabled=false;}}));
        card.append(button('Move / reorder',async()=>{moving={id:item.id,identity:owner};await load();}));
        if(moving&&moving.id!==item.id)card.append(button('Place before',async()=>{await api.command('collection-query',{op:'move',identity:owner,group:moving.id,folder:folder?.id||null,before:item.id});moving=null;reset();await load();}));
        for(const [field,label]of [['starred',item.starred?'Unstar':'Star'],['locked',item.locked?'Unlock':'Lock'],['archived',item.archived?'Unarchive':'Archive']])card.append(button(label,async()=>{await api.command('collection-query',{op:'update',identity:owner,group:item.id,field,value:!item[field]});reset();await load();}));
      }return card;
    });
    list.replaceChildren(...nodes);status.textContent=`${folder?folder.title:'Root'} / ${group?group.title:folders?'Folders':archived?'Archived collections':'Collections'} · ${page.items.length} on this page${next!==null?' · more available':''}`;prev.disabled=!history.length;forward.disabled=next===null;
  }
  return {show(owner){if(identity!==owner){identity=owner;group=null;folder=null;folders=false;moving=null;after=0;history=[];search.value='';generation++;list.replaceChildren();}if(busy){refreshPending=true;return;}return act(load);}};
};
