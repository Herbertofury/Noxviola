'use strict';
const {services:playerServices}=require('./player-audio.cjs');
const DEFAULT_PLAYER=Object.freeze({enabled:true,mini:'toolbar',background:true,autoPause:true,resumeSeconds:1});

const storage = require('./storage.cjs');
const SHORTCUTS = Object.freeze([
  {id:'new', label:'New tab', accelerator:'CmdOrCtrl+T'},
  {id:'close', label:'Close tab or panel', accelerator:'CmdOrCtrl+W'},
  {id:'restore', label:'Reopen closed tab', accelerator:'CmdOrCtrl+Shift+T'},
  {id:'duplicate', label:'Duplicate tab', accelerator:'CmdOrCtrl+Shift+D'},
  {id:'next-tab', label:'Next tab', accelerator:'Ctrl+Tab'},
  {id:'previous-tab', label:'Previous tab', accelerator:'Ctrl+Shift+Tab'},
  {id:'focus-address', label:'Address or search', accelerator:'CmdOrCtrl+L'},
  {id:'focus-find', label:'Find in page', accelerator:'CmdOrCtrl+F'},
  {id:'search-tabs', label:'Search tabs', accelerator:'CmdOrCtrl+Shift+A'},
  {id:'sidebar-toggle', label:'Show or hide sidebar', accelerator:'Ctrl+Alt+Z'},
  {id:'bookmark-current', label:'Bookmark current page', accelerator:'CmdOrCtrl+D'},
  {id:'history', label:'History', accelerator:'CmdOrCtrl+H'},
  {id:'bookmarks', label:'Bookmarks', accelerator:'CmdOrCtrl+Shift+O'},
  {id:'downloads', label:'Downloads', accelerator:'CmdOrCtrl+J'},
  {id:'reload', label:'Reload', accelerator:'CmdOrCtrl+R'},
  {id:'reload-bypass-cache', label:'Reload without cache', accelerator:'CmdOrCtrl+Shift+R'},
  {id:'back', label:'Back', accelerator:'Alt+Left'},
  {id:'forward', label:'Forward', accelerator:'Alt+Right'},
  {id:'home', label:'Home page', accelerator:'Alt+Home'},
  {id:'zoom-in', label:'Zoom in', accelerator:'CmdOrCtrl+Plus'},
  {id:'zoom-out', label:'Zoom out', accelerator:'CmdOrCtrl+-'},
  {id:'zoom-reset', label:'Reset zoom', accelerator:'CmdOrCtrl+0'},
  {id:'print', label:'Print page', accelerator:'CmdOrCtrl+P'},
  {id:'fullscreen', label:'Full screen', accelerator:'F11'},
  {id:'devtools', label:'Developer tools', accelerator:'F12'},
]);
const ENUMS = Object.freeze({
  searchEngine:['duckduckgo','google','bing','custom'], tabLayout:['horizontal','vertical'],
  theme:['dark','light','system'], accent:['violet','blue','teal','rose','amber'], density:['comfortable','compact'],
  tabSearchPosition:['left','right'], tabSearchStyle:['detailed','compact'],
  sidebarSide:['left','right'],
});
const DEFAULTS = Object.freeze({searchEngine:'duckduckgo',tabLayout:'horizontal',theme:'dark',accent:'violet',density:'comfortable',tabSearchPosition:'left',tabSearchStyle:'detailed',
  sidebarVisible:true,sidebarExpanded:false,sidebarPanelPinned:true,sidebarRailExpanded:false,sidebarShowWorkspaces:true,sidebarSide:'left',sidebarWidth:320,sidebarActive:'bookmarks',sidebarApps:[],sidebarTools:[{id:'tabs',visible:true},{id:'bookmarks',visible:true},{id:'history',visible:true},{id:'downloads',visible:true},{id:'passwords',visible:true},{id:'accounts',visible:true},{id:'media',visible:true},{id:'notifications',visible:true},{id:'extension-panels',visible:true},{id:'extensions',visible:true},{id:'settings',visible:true},{id:'mods',visible:true},{id:'vault',visible:true},{id:'following',visible:false},{id:'resources',visible:false},{id:'start',visible:false}],
  homePage:'about:blank',customSearchURL:'https://duckduckgo.com/?q={searchTerms}',showBookmarksBar:false,spellcheckEnabled:true,
  toolbar:{library:true,extensions:true,split:true,home:true},shortcuts:{},player:DEFAULT_PLAYER});
const PREFERENCE_KEYS = Object.freeze(Object.keys(DEFAULTS));
// Appearance imports do not alter the separate local spelling choice.
const PRESET_KEYS = Object.freeze(PREFERENCE_KEYS.filter(name=>!['spellcheckEnabled','sidebarApps','sidebarActive','player'].includes(name)));
const modifierNames = new Map([['cmdorctrl','CmdOrCtrl'],['commandorcontrol','CmdOrCtrl'],['ctrl','Ctrl'],['control','Ctrl'],
  ['cmd','Command'],['command','Command'],['alt','Alt'],['option','Alt'],['shift','Shift'],['super','Super']]);
const namedKeys = new Map(['Plus','Space','Tab','Enter','Escape','Backspace','Delete','Insert','Home','End','PageUp','PageDown','Up','Down','Left','Right'].map(key=>[key.toLowerCase(),key]));
function fail(message) { throw storage.fail(message, 'UNSUPPORTED_DATA'); }
function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function networkAddress(value) {
  if (typeof value !== 'string' || /[\u0000-\u0020\u007f]/.test(value)) return false;
  try { const url = new URL(value); return ['http:','https:'].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
}
function searchTemplate(value) {
  return typeof value === 'string' && value.split('{searchTerms}').length === 2 && networkAddress(value.replace('{searchTerms}','noxviola'));
}
function accelerator(value) {
  if (value === '') return '';
  if (typeof value !== 'string' || value !== value.trim()) fail('A keyboard shortcut must be a key combination or an empty value to disable it.');
  const pieces=value.split('+');
  if (!pieces.length || pieces.some(piece=>!piece)) fail('Use Plus for the plus key, for example Ctrl+Plus.');
  const rawKey=pieces.pop(), modifiers=pieces.map(piece=>modifierNames.get(piece.toLowerCase()));
  if (modifiers.some(part=>!part) || new Set(modifiers).size!==modifiers.length || modifiers.filter(part=>['CmdOrCtrl','Ctrl','Command','Super'].includes(part)).length>1) fail('A keyboard shortcut has unsupported or repeated modifiers.');
  const key = /^[a-z0-9]$/i.test(rawKey) ? rawKey.toUpperCase() : /^F(?:[1-9]|1\d|2[0-4])$/i.test(rawKey) ? rawKey.toUpperCase() : namedKeys.get(rawKey.toLowerCase()) || (['-','=','[',']',';',"'",',','.','/','\\','`'].includes(rawKey) ? rawKey : null);
  if (!key || (!modifiers.length && !/^F\d+$/.test(key))) fail('Use a supported function key or a combination with Ctrl, CmdOrCtrl, Alt or Shift.');
  const order=['CmdOrCtrl','Ctrl','Command','Super','Alt','Shift'];
  return [...modifiers.sort((a,b)=>order.indexOf(a)-order.indexOf(b)),key].join('+');
}
function shortcutList(preferences={}, platform=process.platform) {
  const seen=new Map();
  const equivalent=value=>value.replace('CmdOrCtrl',platform==='darwin'?'Command':'Ctrl');
  // A newly introduced default must not invalidate an older custom shortcut.
  const optionalDefaults=new Set(['search-tabs','sidebar-toggle']);
  return SHORTCUTS.map(item=>{
    const conflict=optionalDefaults.has(item.id)&&SHORTCUTS.some(other=>other.id!==item.id&&equivalent(accelerator(Object.hasOwn(preferences.shortcuts||{},other.id)?preferences.shortcuts[other.id]:other.accelerator))===equivalent(item.accelerator));
    const combination=accelerator(Object.hasOwn(preferences.shortcuts || {},item.id)?preferences.shortcuts[item.id]:conflict?'':item.accelerator);
    const key=equivalent(combination);
    if(key && seen.has(key))fail(`The shortcut ${combination} is assigned to both ${seen.get(key)} and ${item.label}.`);
    if(key)seen.set(key,item.label);
    return {...item,defaultAccelerator:item.accelerator,accelerator:combination};
  });
}
function preferences(raw={}, {strict=true,platform=process.platform}={}) {
  if (!object(raw)) fail('Browser preferences must be an object.');
  const result={...raw};
  for(const [name,values] of Object.entries(ENUMS)) {
    if(result[name]!==undefined && !values.includes(result[name]) && strict)fail(`Unsupported saved preference ${name}; its original value was preserved.`);
    if(!values.includes(result[name]))result[name]=DEFAULTS[name];
  }
  if(result.homePage===undefined)result.homePage=DEFAULTS.homePage;
  if(result.homePage!=='about:blank'&&!networkAddress(result.homePage))fail('The home page must be about:blank or an HTTP(S) address without credentials.');
  if(result.customSearchURL===undefined)result.customSearchURL=DEFAULTS.customSearchURL;
  if(!searchTemplate(result.customSearchURL))fail('The custom search URL must be HTTP(S), have no embedded credentials, and contain {searchTerms} exactly once.');
  if(result.showBookmarksBar===undefined)result.showBookmarksBar=false;
  if(typeof result.showBookmarksBar!=='boolean')fail('The bookmarks bar setting must be true or false.');
  if(result.spellcheckEnabled===undefined)result.spellcheckEnabled=true;
  if(typeof result.spellcheckEnabled!=='boolean')fail('Spellcheck must be explicitly enabled or disabled.');
  for(const name of ['sidebarVisible','sidebarExpanded','sidebarPanelPinned','sidebarRailExpanded','sidebarShowWorkspaces']){if(result[name]===undefined)result[name]=DEFAULTS[name];if(typeof result[name]!=='boolean')fail(`Saved ${name} must be true or false.`);}
  if(result.sidebarWidth===undefined)result.sidebarWidth=DEFAULTS.sidebarWidth;
  if(!Number.isInteger(result.sidebarWidth)||result.sidebarWidth<180||result.sidebarWidth>1600)fail('Sidebar width must be an integer from 180 to 1600 pixels.');
  if(result.sidebarApps===undefined)result.sidebarApps=[];
  if(!Array.isArray(result.sidebarApps))fail('Saved sidebar applications must be an array.');
  const appIds=new Set();result.sidebarApps=result.sidebarApps.map(item=>{
    if(!object(item)||typeof item.id!=='string'||!/^[-a-zA-Z0-9_]{1,128}$/.test(item.id)||appIds.has(item.id)||typeof item.name!=='string'||!item.name.trim()||!networkAddress(item.url))fail('A saved sidebar application is invalid; its original data was preserved.');
    appIds.add(item.id);return {...item};
  });
  if(result.sidebarTools===undefined)result.sidebarTools=DEFAULTS.sidebarTools.map(item=>({...item}));
  if(!Array.isArray(result.sidebarTools))fail('Saved sidebar tools must be an array.');
  const toolIds=new Set();result.sidebarTools=result.sidebarTools.map(item=>{
    if(!object(item)||!DEFAULTS.sidebarTools.some(tool=>tool.id===item.id)||toolIds.has(item.id)||typeof item.visible!=='boolean')fail('A saved sidebar tool is invalid; its original data was preserved.');
    toolIds.add(item.id);return {...item};
  });
  for(const tool of DEFAULTS.sidebarTools)if(!toolIds.has(tool.id))result.sidebarTools.push({...tool});
  if(result.sidebarActive===undefined)result.sidebarActive=DEFAULTS.sidebarActive;
  const selected=result.sidebarActive;
  if(typeof selected!=='string'||(!['bookmarks','history','downloads','tabs','accounts','passwords','media','notifications','extension-panels'].includes(selected)&&!/^extension:[a-zA-Z0-9_-]+:(sidebar_action|side_panel)$/.test(selected)&&!(selected.startsWith('app:')&&appIds.has(selected.slice(4)))&&!(selected.startsWith('player:')&&Object.hasOwn(playerServices,selected.slice(7)))))fail('The saved sidebar panel is not available; its original data was preserved.');
  for(const name of ['toolbar','shortcuts'])if(result[name]!==undefined&&!object(result[name]))fail(`Saved ${name} preferences must be an object.`);
  result.toolbar={...DEFAULTS.toolbar,...result.toolbar};
  for(const name of Object.keys(DEFAULTS.toolbar))if(typeof result.toolbar[name]!=='boolean')fail('Toolbar visibility settings must be true or false.');
  if(result.player!==undefined&&!object(result.player))fail('Saved Player settings must be an object.');
  result.player={...DEFAULT_PLAYER,...result.player};
  for(const name of ['enabled','background','autoPause'])if(typeof result.player[name]!=='boolean')fail(`Saved Player ${name} must be true or false.`);
  if(!['toolbar','floating','off'].includes(result.player.mini))fail('Choose a toolbar, floating or hidden Mini Player.');
  if(result.player.resumeSeconds!==null&&(!Number.isInteger(result.player.resumeSeconds)||result.player.resumeSeconds<0||result.player.resumeSeconds>300))fail('Choose a resume delay between 0 and 300 seconds or Never.');
  result.shortcuts={...result.shortcuts};
  for(const item of SHORTCUTS)if(Object.hasOwn(result.shortcuts,item.id))result.shortcuts[item.id]=accelerator(result.shortcuts[item.id]);
  shortcutList(result,platform);
  return result;
}
function applyPreferences(current, patch) {
  if(!object(patch))fail('Choose browser preferences to save.');
  const accepted={};
  for(const name of PREFERENCE_KEYS)if(Object.hasOwn(patch,name))accepted[name]=patch[name];
  const player=accepted.player===undefined?current.player:object(accepted.player)?{...current.player,...accepted.player}:accepted.player;
  return preferences({...current,...accepted,player,toolbar:{...current.toolbar,...accepted.toolbar},shortcuts:{...current.shortcuts,...accepted.shortcuts}});
}
function exportPreset(current) {
  const validated=preferences(current), supported={};
  for(const name of PRESET_KEYS)supported[name]=structuredClone(validated[name]);
  supported.toolbar=Object.fromEntries(Object.keys(DEFAULTS.toolbar).map(name=>[name,validated.toolbar[name]]));
  supported.shortcuts=Object.fromEntries(SHORTCUTS.filter(item=>Object.hasOwn(validated.shortcuts,item.id)).map(item=>[item.id,validated.shortcuts[item.id]]));
  return {format:'noxviola-preferences',version:1,preferences:supported};
}
function previewPreset(current, incoming) {
  if(!object(incoming)||incoming.format!=='noxviola-preferences'||incoming.version!==1||!object(incoming.preferences))fail('This is not a supported Noxviola preference preset.');
  for(const name of Object.keys(incoming.preferences))if(!PRESET_KEYS.includes(name))fail(`This preset contains an unsupported preference: ${name}. Spelling checks must be chosen separately in settings.`);
  const proposed=applyPreferences(current,incoming.preferences), changes=[];
  for(const name of PREFERENCE_KEYS)if(JSON.stringify(current[name])!==JSON.stringify(proposed[name]))changes.push({name,before:current[name],after:proposed[name]});
  return {preferences:proposed,changes};
}
module.exports={SHORTCUTS,ENUMS,DEFAULTS,PREFERENCE_KEYS,PRESET_KEYS,preferences,applyPreferences,shortcutList,accelerator,searchTemplate,exportPreset,previewPreset};
