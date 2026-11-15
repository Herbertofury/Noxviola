'use strict';
const $=id=>document.getElementById(id);
const run=(name,value)=>window.browser.command(name,value).catch(e=>{$('notice').textContent=e.message;});
$('navigate').addEventListener('submit',e=>{e.preventDefault();run('navigate',$('address').value);});
document.querySelectorAll('[data-command]').forEach(el=>el.addEventListener('click',()=>run(el.dataset.command)));
$('back').onclick=()=>run('back');$('forward').onclick=()=>run('forward');$('find').oninput=()=>run('find',$('find').value);
window.browser.onAddress(()=>{$('address').focus();$('address').select();});window.browser.onFind(()=>$('find').focus());
window.browser.onNotice(value=>{$('notice').textContent=value;});
$('identity').onchange=()=>run('identity-switch',$('identity').value);
$('add-identity').onclick=()=>{const field=$('identity-name');field.hidden=!field.hidden;if(!field.hidden)field.focus();};
window.browser.onState(state=>{
 $('identity').replaceChildren(...state.profiles.map(p=>{const o=document.createElement('option');o.value=p.id;o.textContent=p.name;o.selected=p.id===state.currentIdentity;return o;}));
 $('tabs').replaceChildren(...state.tabs.map(t=>{const wrap=document.createElement('div');wrap.className='tab';const button=document.createElement('button');button.role='tab';button.setAttribute('aria-selected',String(t.id===state.activeId));button.textContent=`[${state.profiles.find(p=>p.id===t.identity)?.name||t.identity}] ${t.loading?'◌ ':''}${t.title||t.url}`;button.title=t.url;button.onclick=()=>run('activate',t.id);const close=document.createElement('button');close.textContent='×';close.setAttribute('aria-label',`Close ${t.title}`);close.onclick=()=>run('close',t.id);wrap.append(button,close);return wrap;}));
 if(document.activeElement!==$('address'))$('address').value=state.tabs.find(t=>t.id===state.activeId)?.url||'';
 $('back').disabled=!state.canBack;$('forward').disabled=!state.canForward;
});

let vaultItems=[];
function renderVault(){const query=$('vault-search').value.toLowerCase();$('vault-items').replaceChildren(...vaultItems.filter(x=>(!$('favorites').checked||x.favorite)&&[x.title,x.url,x.kind,x.group,x.characters,x.notes].join(' ').toLowerCase().includes(query)).map(item=>{const card=document.createElement('article');const title=document.createElement('h2');title.textContent=item.title;const detail=document.createElement('p');detail.textContent=[item.kind,item.group,item.characters,item.notes,item.url].filter(Boolean).join(' · ');const open=document.createElement('button');open.textContent='Open source';open.onclick=()=>run('vault-open',item.id);const star=document.createElement('button');star.textContent=item.favorite?'★ Favorite':'☆ Favorite';star.onclick=()=>run('vault-star',item.id);card.append(title,detail,open,star);return card;}));}
window.browser.onVault(data=>{vaultItems=data.items;$('vault').hidden=!data.open;renderVault();});
$('vault-search').oninput=renderVault;$('favorites').onchange=renderVault;
$('vault-add').onsubmit=async e=>{e.preventDefault();const value=Object.fromEntries(new FormData(e.currentTarget));try{await window.browser.command('vault-add',value);e.target.reset();}catch(error){$('notice').textContent=error.message;}};

$('identity-name').onkeydown=e=>{if(e.key==='Enter'&&e.target.value.trim()){run('identity-add',e.target.value);e.target.value='';e.target.hidden=true;}};
