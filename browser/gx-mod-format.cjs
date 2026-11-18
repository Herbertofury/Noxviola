'use strict';

const path=require('node:path');
const {packageFiles:{safeRelative}}=require('./extensions.cjs');
const {validMatch}=require('./gx-web-styles.cjs');

const labels=Object.freeze({
  theme:'Theme',wallpaper:'Wallpaper',background_music:'Background music',
  browser_sounds:'Browser sounds',keyboard_sounds:'Keyboard sounds',page_styles:'Web modding',
  fonts:'Fonts',app_icon:'App icon',cursors:'Cursors',splash_screen:'Splash screen',
  shaders:'Shaders',image_overrides:'Sidebar icons',mobile_image_overrides:'Mobile icons',
  icons:'Icons',stickers:'Stickers',game_strip:'Game strip',game_strips:'Game strip',
  mobile_icons:'Mobile icons',sd_effects:'Speed Dial effects',speed_dial_effects:'Speed Dial effects',
});
const mediaTypes=Object.freeze({
  '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.avif':'image/avif','.ico':'image/x-icon',
  '.webm':'video/webm','.mp4':'video/mp4','.wav':'audio/wav','.ogg':'audio/ogg','.opus':'audio/ogg','.mp3':'audio/mpeg','.m4a':'audio/mp4','.flac':'audio/flac',
  '.json':'application/json','.ttf':'font/ttf','.otf':'font/otf','.woff':'font/woff','.woff2':'font/woff2','.cur':'image/x-icon',
});
const mime=file=>mediaTypes[path.extname(file).toLowerCase()]||'';
const isObject=value=>value&&typeof value==='object'&&!Array.isArray(value);
const browserEvents=['CLICK','HOVER','HOVER_UP','TAB_CLOSE','TAB_INSERT','SWITCH_TOGGLE','FEATURE_SWITCH_ON','FEATURE_SWITCH_OFF','IMPORTANT_CLICK'];
const keyboardEvents=['TYPING_BACKSPACE','TYPING_ENTER','TYPING_LETTER','TYPING_SPACE'];
const cursorRoles=Object.freeze({POINTER:'default',HAND:'pointer',I_BEAM:'text',VERTICAL_TEXT:'vertical-text',WAIT:'wait',PROGRESS:'progress',
  GRAB:'grab',GRABBING:'grabbing',HELP:'help',NOT_ALLOWED:'not-allowed',NO_DROP:'no-drop',CROSS:'crosshair',MOVE:'move',COPY:'copy',
  ALIAS:'alias',CELL:'cell',CONTEXT_MENU:'context-menu',ZOOM_IN:'zoom-in',ZOOM_OUT:'zoom-out',
  NORTH_RESIZE:'n-resize',SOUTH_RESIZE:'s-resize',EAST_RESIZE:'e-resize',WEST_RESIZE:'w-resize',NORTH_EAST_RESIZE:'ne-resize',
  NORTH_WEST_RESIZE:'nw-resize',SOUTH_EAST_RESIZE:'se-resize',SOUTH_WEST_RESIZE:'sw-resize',
  NORTH_SOUTH_RESIZE:'ns-resize',EAST_WEST_RESIZE:'ew-resize',NORTH_EAST_SOUTH_WEST_RESIZE:'nesw-resize',NORTH_WEST_SOUTH_EAST_RESIZE:'nwse-resize',
  COLUMN_RESIZE:'col-resize',ROW_RESIZE:'row-resize'});
const asArray=value=>Array.isArray(value)?value:[];
const label=(value,fallback)=>typeof value==='string'&&value.trim()?value.trim().slice(0,180):fallback;
const hex=value=>typeof value==='string'&&/^#(?:[a-f0-9]{3}|[a-f0-9]{6})$/i.test(value)?value:null;
const percent=value=>typeof value==='number'&&value>=0&&value<=100?value:null;

function color(value){
  if(!isObject(value))return null;
  const {h,s,l}=value;
  return [h,s,l].every(x=>typeof x==='number'&&Number.isFinite(x))&&h>=0&&h<=360&&s>=0&&s<=100&&l>=0&&l<=100?[h,s,l]:null;
}
function tones(value,read){
  if(!isObject(value))return null;
  const result={};
  for(const tone of ['dark','light']){const entry=read(value[tone]);if(entry)result[tone]=entry;}
  return Object.keys(result).length?result:null;
}
function wallpaper(entry,asset){
  const file=asset(entry?.image,'image/')||asset(entry?.image,'video/');
  if(!file)return null;
  return {file,video:mime(file).startsWith('video/'),poster:asset(entry.first_frame,'image/'),
    color:hex(entry.text_color),shadow:hex(entry.text_shadow),opacity:percent(entry.ui_settings?.background_opacity),
    blur:percent(entry.ui_settings?.background_blur),vignette:percent(entry.ui_settings?.vignette_strength)};
}
function soundSet(value,asset,events){
  const source=value?.sounds??value;
  if(!isObject(source))return null;
  const sounds={};
  for(const event of events){
    const files=asArray(source[event]).map(file=>file===''?'':asset(file,'audio/')).filter(file=>file!==null);
    if(files.length)sounds[event]=files;
  }
  return Object.keys(sounds).length?sounds:null;
}
function fonts(value,asset){
  const result={};
  for(const role of ['header','body']){
    const variants=[];
    for(const face of asArray(value?.[role]?.variants)){
      if(!Number.isInteger(face?.weight)||face.weight<1||face.weight>1000||!['normal','italic','oblique'].includes(face.style))continue;
      const file=asset(face.path,'font/');
      if(file)variants.push({file,weight:face.weight,style:face.style});
    }
    if(variants.length)result[role]=variants;
  }
  return Object.keys(result).length?result:null;
}
function cursors(value,asset){
  const result={};
  for(const item of asArray(value?.items)){
    if(!Object.hasOwn(cursorRoles,item?.type))continue;
    const file=asset(item.path,'cursor');
    if(file)result[cursorRoles[item.type]]=file;
  }
  return Object.keys(result).length?result:null;
}
const iconRoles=Object.freeze({
  sidebar_activity_button:'tabs',sidebar_bookmarks_button:'bookmarks',sidebar_downloads_button:'downloads',
  sidebar_extensions_button:'extensions',sidebar_history_button:'history',sidebar_mods_button:'mods',
  sidebar_player_service_button:'media',sidebar_settings_button:'settings',sidebar_speeddial_button:'start',
});
function sidebarIcons(value,asset){
  const result={};
  for(const [gxRole,role] of Object.entries(iconRoles)){
    const file=asset(value?.images?.[gxRole],'lottie');
    if(file)result[role]=file;
  }
  return Object.keys(result).length?result:null;
}
function checkVectorAnimation(data){
  if(!isObject(data)||![data.w,data.h,data.fr].every(number=>Number.isFinite(number)&&number>0)||
    !Number.isFinite(data.ip)||!Number.isFinite(data.op)||data.op<=data.ip||!Array.isArray(data.layers)||!data.layers.length||
    Object.hasOwn(data,'segments')||Object.hasOwn(data,'chars')||Object.hasOwn(data,'fonts'))
    throw new Error('Only self-contained Lottie vector icons are supported.');
  const compositions=new Map(),assets=data.assets??[];
  if(!Array.isArray(assets))throw new Error('Invalid Lottie icon assets.');
  for(const asset of assets){
    if(typeof asset?.id!=='string'||compositions.has(asset.id)||!Array.isArray(asset.layers)||Object.hasOwn(asset,'p')||Object.hasOwn(asset,'u'))
      throw new Error('The Lottie icon uses linked assets.');
    compositions.set(asset.id,asset.layers);
  }
  const graph=new Map();
  for(const [id,layers] of [[null,data.layers],...compositions]){
    const edges=[];
    for(const layer of layers){
      if(![0,1,3,4].includes(layer?.ty))throw new Error('The Lottie icon uses unsupported media layers.');
      if(layer.ty===0){
        if(!compositions.has(layer.refId))throw new Error('A Lottie icon composition is missing.');
        edges.push(layer.refId);
      }
    }
    graph.set(id,edges);
  }
  const complete=new Set();
  for(const first of graph.keys()){
    if(complete.has(first))continue;
    const pending=[{id:first,index:0}],active=new Set([first]);
    while(pending.length){
      const frame=pending.at(-1),edges=graph.get(frame.id);
      if(frame.index===edges.length){active.delete(frame.id);complete.add(frame.id);pending.pop();continue;}
      const next=edges[frame.index++];
      if(active.has(next))throw new Error('A Lottie icon composition is recursive.');
      if(!complete.has(next)){active.add(next);pending.push({id:next,index:0});}
    }
  }
  const open=[data];
  while(open.length){
    const value=open.pop();
    for(const [key,child] of Object.entries(value)){
      if(['__proto__','constructor','prototype'].includes(key)||(key==='x'&&typeof child==='string'))
        throw new Error('The Lottie icon contains executable or unsafe properties.');
      if(child&&typeof child==='object')open.push(child);
    }
  }
}
function pageStyles(entries,asset){
  const rules=[];
  for(const rule of asArray(entries)){
    if(!isObject(rule)||!Array.isArray(rule.css)||!rule.css.length||!Array.isArray(rule.matches)||!rule.matches.length||
      !rule.matches.every(validMatch)||(rule.exclude_matches!==undefined&&(!Array.isArray(rule.exclude_matches)||!rule.exclude_matches.every(validMatch))))continue;
    const css=rule.css.map(file=>asset(file,'css'));
    if(css.every(Boolean))rules.push({css,matches:rule.matches,exclude:rule.exclude_matches||[]});
  }
  return rules.length?rules:null;
}
const readers=Object.freeze({
  theme:value=>tones(value,entry=>{
    const accent=color(entry?.gx_accent),base=color(entry?.gx_secondary_base);
    return accent&&base?{accent,base}:null;
  }),
  wallpaper:(value,asset)=>tones(value,entry=>wallpaper(entry,asset)),
  background_music:(value,asset)=>{
    const tracks=asArray(value?.tracks??value).map(file=>asset(file,'audio/')).filter(Boolean);
    return tracks.length?tracks:null;
  },
  browser_sounds:(value,asset)=>soundSet(value,asset,browserEvents),
  keyboard_sounds:(value,asset)=>soundSet(value,asset,keyboardEvents),
  page_styles:pageStyles,
  fonts,cursors,image_overrides:sidebarIcons,
  app_icon:(value,asset)=>asset(value?.path,'image/'),
  splash_screen:(value,asset)=>asset(value?.path,'video/'),
  stickers:(value,asset)=>{
    const images=asArray(value?.images).map(file=>asset(file,'image/')).filter(Boolean);
    return images.length?images:null;
  },
});
function readPayload(manifest,files){
  if(!isObject(manifest)||typeof manifest.name!=='string'||!manifest.name.trim()||typeof manifest.version!=='string')
    throw new Error('This package needs a name and version.');
  const source=manifest.mod?.payload;
  if(!isObject(source))throw new Error('This package has no Opera GX mod payload. Use Extensions for browser add-ons.');
  const schema=Number.isSafeInteger(manifest.mod.schema_version)?manifest.mod.schema_version:null;
  const payload={},categories=[];
  for(const [key,input] of Object.entries(source)){
    const name=Object.hasOwn(labels,key)?labels[key]:key;
    const category={key,label:name,supported:false,variants:[],detail:'This category is retained in the package.'};
    categories.push(category);
    if(!Object.hasOwn(readers,key))continue;
    if(schema!==null&&schema!==1&&schema!==2){category.detail='This package uses an unrecognized mod schema.';continue;}
    const isNamed=Array.isArray(input)&&input.some(entry=>isObject(entry)&&Object.hasOwn(entry,'id'));
    let entries=isNamed?input:[input];
    if(key==='page_styles'&&isNamed)entries=[input,...input.map(entry=>[entry])];
    const idCounts=new Map();
    const variants=[];
    for(const [index,entry] of entries.entries()){
      const resources=new Map();
      const asset=(raw,type)=>{
        if(typeof raw!=='string'||!raw)return null;
        const file=safeRelative(raw),ext=path.extname(file).toLowerCase();
        const matches=type==='css'?ext==='.css':type==='lottie'?ext==='.json':type==='cursor'?['.cur','.png'].includes(ext):mime(file).startsWith(type);
        if(!matches)return null;
        if(!files.has(file))throw new Error(`The mod refers to a missing asset: ${file}`);
        resources.set(file,['css','lottie'].includes(type)?type:'media');
        return file;
      };
      const value=readers[key](entry,asset);
      if(!value)continue;
      const meta=key==='page_styles'&&isNamed?entry[0]:entry;
      const original=label(meta?.id,String(index));
      const occurrence=(idCounts.get(original)||0)+1;idCounts.set(original,occurrence);
      const id=JSON.stringify([key==='page_styles'&&index===0?'combined':'component',original,occurrence]);
      const variantName=key==='page_styles'&&isNamed&&index===0?'All styles':label(meta?.name,entries.length===1?name:`${name} ${index+1}`);
      variants.push({id,name:variantName,value,resources});
    }
    if(variants.length){
      payload[key]=variants;category.supported=true;
      category.variants=variants.map(({id,name})=>({id,name}));
    }
    category.detail=variants.length?'':'This package uses a variant this browser cannot play or render.';
    if(key==='browser_sounds'&&variants.length&&entries.some(entry=>Object.keys(entry?.sounds??entry??{}).some(event=>!browserEvents.includes(event))))category.detail='Browser-specific events without a Noxviola equivalent are retained.';
    if(key==='image_overrides'&&variants.length)category.detail='Self-contained animated icons apply to matching Noxviola sidebar tools.';
    if(key==='cursors'&&variants.length)category.detail='Static cursors apply to browser controls. Animated cursors are retained.';
    if(key==='background_music'&&variants.some(variant=>variant.value.length>1))category.detail='Includes synchronized music layers.';
  }
  return {name:label(manifest.name,''),version:manifest.version.slice(0,60),description:typeof manifest.description==='string'?manifest.description.slice(0,1000):'',
    author:label(manifest.developer?.name,''),schema,payload,categories};
}
module.exports={readPayload,supported:Object.keys(readers),mime,isObject,checkVectorAnimation};
