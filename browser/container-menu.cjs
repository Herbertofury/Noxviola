'use strict';

// Stable display hints only. The profile ID, not its color/name/icon, selects a partition.
const MARKS = Object.freeze({blue:'🔵',orange:'🟠',green:'🟢',purple:'🟣',yellow:'🟡',red:'🔴'});
const ICONS = Object.freeze({circle:'',person:'♙',case:'▣',shield:'◆',bag:'▤',game:'✦'});
const own=(obj,key)=>typeof key==='string'&&Object.hasOwn(obj,key);
function marker(id,color,icon) {
  let hash = 2166136261;
  for (const ch of String(id)) hash = Math.imul(hash ^ ch.codePointAt(0), 16777619);
  const colors=Object.values(MARKS);
  return (own(MARKS,color)?MARKS[color]:colors[(hash >>> 0) % colors.length])+(own(ICONS,icon)&&ICONS[icon]?' '+ICONS[icon]:'');
}
function menuLabel(name) {
  return name.replace(/[\r\n\t]/g, ' ').replace(/&/g, '&&');
}
function containerMenuTemplate(profiles, activeIdentity, invoke, pane) {
  const action = (label, command, value) => ({label, click: () => invoke(command, value)});
  const label = ({id,name,color,icon}) => marker(id,color,icon)+' '+menuLabel(name)+(id===activeIdentity?' (current)':'');
  const split = (title,axis) => ({label:title,submenu:profiles.map(profile=>action(
    label(profile),'pane-split',{id:pane.id,workspaceId:pane.workspaceId,axis,identity:profile.id}))});
  return [
    action('New Tab','new'),
    {type:'separator'},
    ...profiles.map(profile=>action(label(profile),'new-in-container',profile.id)),
    ...(pane?[{type:'separator'},split('Split right in container', 'x'),split('Split below in container', 'y')]:[]),
    {type:'separator'},
    action('Add new container','container-focus-create'),
    action('Manage containers','accounts')
  ];
}
function updateAppearance(profiles,value){
  if(!value||typeof value.id!=='string')throw new Error('Choose an existing container.');
  const index=profiles.findIndex(profile=>profile.id===value.id);
  if(index<0)throw new Error('Choose an existing container.');
  const name=typeof value.name==='string'?value.name.trim():'';
  if(!name||/[\u0000-\u001f\u007f]/.test(name))throw new Error('Enter a container name without control characters.');
  if(value.color!==''&&!own(MARKS,value.color))throw new Error('Choose an available container color.');
  if(!own(ICONS,value.icon))throw new Error('Choose an available container icon.');
  const next={...profiles[index],name,icon:value.icon};
  if(value.color)next.color=value.color;else delete next.color;
  return profiles.map((profile,i)=>i===index?next:profile);
}
module.exports={containerMenuTemplate,marker,updateAppearance};
