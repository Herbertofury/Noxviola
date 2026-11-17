'use strict';

const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const storage=require('./storage.cjs');
const {parseJson,packageFiles}=require('./extensions.cjs');
const {safeRelative,safeDirectory,copyDirectory,extractArchive,packageRoot,regularFile,walk}=packageFiles;
const {validMatch,offlineCss,matchedStyles}=require('./gx-web-styles.cjs');

const labels=Object.freeze({
  theme:'Theme', wallpaper:'Wallpaper', background_music:'Background music',
  browser_sounds:'Browser sounds', keyboard_sounds:'Keyboard sounds', page_styles:'Web modding',
  shaders:'Shaders', fonts:'Fonts', icons:'Icons', app_icon:'App icon',
  cursors:'Cursors', splash_screen:'Splash screen', stickers:'Stickers',
  game_strips:'Game strip', mobile_icons:'Mobile icons', speed_dial_effects:'Speed Dial effects',
});
const supported=['theme','wallpaper','background_music','browser_sounds','keyboard_sounds','page_styles'];
const emptyDigest='0'.repeat(64);
const mediaTypes=Object.freeze({
  '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.avif':'image/avif',
  '.webm':'video/webm','.mp4':'video/mp4','.wav':'audio/wav','.ogg':'audio/ogg','.opus':'audio/ogg','.mp3':'audio/mpeg','.m4a':'audio/mp4','.flac':'audio/flac',
});
const soundEvents={
  browser_sounds:new Set(['CLICK','HOVER','TAB_CLOSE','TAB_INSERT','SWITCH_TOGGLE']),
  keyboard_sounds:new Set(['TYPING_BACKSPACE','TYPING_ENTER','TYPING_LETTER','TYPING_SPACE']),
};
const idPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const digestPattern=/^[0-9a-f]{64}$/;
const isObject=value=>value&&typeof value==='object'&&!Array.isArray(value);
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const mime=file=>mediaTypes[path.extname(file).toLowerCase()]||'';
const mediaUrl=(id,file)=>`nox-mod://${id}/${file.split('/').map(encodeURIComponent).join('/')}`;
function fail(message){throw new Error(message);}

function color(value){
  if(!isObject(value))return null;
  const {h,s,l}=value;
  return [h,s,l].every(x=>typeof x==='number'&&Number.isFinite(x))&&h>=0&&h<=360&&s>=0&&s<=100&&l>=0&&l<=100?[h,s,l]:null;
}

function readPayload(manifest, files) {
  if(!isObject(manifest)||typeof manifest.name!=='string'||!manifest.name.trim()||typeof manifest.version!=='string')
    fail('This package needs a name and version.');
  const source=manifest.mod?.payload;
  if(!isObject(source))fail('This package has no Opera GX mod payload. Use Extensions for browser add-ons.');
  const payload={},categories=[];
  const asset=(value,type)=>{
    if(typeof value!=='string'||!value)return null;
    const file=safeRelative(value),kind=mime(file);
    if(!files.has(file))fail(`The mod refers to a missing asset: ${file}`);
    return kind&&kind.startsWith(type)?file:null;
  };
  // Recognize the single-payload variants described in the publisher's template.
  // Other variants appear individually in the review instead of being applied blindly.
  for(const [key,value] of Object.entries(source)){
    let result,detail='';
    if(key==='theme'&&isObject(value)){
      result={};
      for(const tone of ['dark','light']){
        const accent=color(value[tone]?.gx_accent),base=color(value[tone]?.gx_secondary_base);
        if(accent&&base)result[tone]={accent,base};
      }
    }else if(key==='wallpaper'&&isObject(value)){
      result={};
      for(const tone of ['dark','light']){
        const entry=value[tone],file=asset(entry?.image,'image/')||asset(entry?.image,'video/');
        if(file)result[tone]={file,video:mime(file).startsWith('video/'),poster:asset(entry.first_frame,'image/')};
      }
    }else if(key==='page_styles'&&Array.isArray(value)){
      result=[];
      for(const rule of value){
        if(!isObject(rule)||!Array.isArray(rule.css)||!rule.css.length||!Array.isArray(rule.matches)||!rule.matches.length||
          !rule.matches.every(validMatch)||(rule.exclude_matches!==undefined&&(!Array.isArray(rule.exclude_matches)||!rule.exclude_matches.every(validMatch))))continue;
        const css=rule.css.map(safeRelative);
        if(!css.every(file=>path.extname(file).toLowerCase()==='.css'&&files.has(file)))continue;
        result.push({css,matches:rule.matches,exclude:rule.exclude_matches||[]});
      }
    }else if(key==='background_music'&&Array.isArray(value)){
      result=value.map(file=>asset(file,'audio/')).filter(Boolean);
      detail='Play the first track as a loop. Additional layers are retained in the package.';
    }else if(Object.hasOwn(soundEvents,key)&&isObject(value)){
      result={};
      for(const event of soundEvents[key]){
        const values=value[event];
        if(Array.isArray(values))result[event]=values.map(file=>file===''?'':asset(file,'audio/')).filter(file=>file!==null);
      }
      const remaining=Object.keys(value).filter(event=>!soundEvents[key].has(event));
      if(remaining.length)detail=`Additional events retained: ${remaining.join(', ')}.`;
    }
    const ready=result&&Object.keys(result).length>0;
    if(ready)payload[key]=result;
    categories.push({key,label:labels[key]||key,supported:Boolean(ready),
      detail:ready?detail:supported.includes(key)?'This package uses a variant the preview cannot play or render.':'This category is retained in the package.'});
  }
  return {
    name:manifest.name.trim().slice(0,180),
    version:manifest.version.slice(0,60),
    description:typeof manifest.description==='string'?manifest.description.slice(0,1000):'',
    author:typeof manifest.developer?.name==='string'?manifest.developer.name.slice(0,180):'',
    schema:Number.isSafeInteger(manifest.mod.schema_version)?manifest.mod.schema_version:null,
    payload,categories,
  };
}

function restrictWebStyles(meta,inventory){
  const rules=meta.payload.page_styles,category=meta.categories.find(item=>item.key==='page_styles');
  if(!rules)return;
  const allowed=rules.filter(rule=>rule.css.every(file=>inventory[file]&&inventory[file]!==emptyDigest));
  if(allowed.length)meta.payload.page_styles=allowed;
  else delete meta.payload.page_styles;
  category.supported=allowed.length>0;
  category.detail=allowed.length<rules.length?'Some styles need linked resources or unsupported CSS syntax.':'Styles run only on the declared websites.';
  category.matches=[...new Set(allowed.flatMap(rule=>rule.matches))];
}

function decode(value){
  if(!isObject(value)||value.version!==1||!Array.isArray(value.mods)||!isObject(value.active))
    fail('The mod library checkpoint cannot be read safely.');
  const ids=new Set();
  for(const row of value.mods){
    if(!isObject(row)||!idPattern.test(row.id)||ids.has(row.id)||!digestPattern.test(row.manifestSha256)||!isObject(row.inventory)||
      !Object.entries(row.inventory).every(([file,digest])=>safeRelative(file)===file&&digestPattern.test(digest)))fail('The mod inventory is invalid.');
    ids.add(row.id);
  }
  for(const [category,id] of Object.entries(value.active))if(!supported.includes(category)||!ids.has(id))fail('A saved mod selection is unavailable.');
  return value;
}

class GxModLibrary {
  constructor(directory){
    this.directory=path.resolve(directory);
    this.file=path.join(this.directory,'library.json');
    this.pending=null;
    this.review=null;
    this.records=new Map();
    this.error='';
    this.data={version:1,mods:[],active:{}};
  }
  async open(){
    await safeDirectory(this.directory);
    const opened=storage.inspect(this.file,decode,()=>this.data);
    if(opened.status==='recovery'){this.error='The mod library needs explicit recovery before editing.';this.recovery=opened.preview;return;}
    this.data=opened.value;
    await Promise.all(this.data.mods.map(async row=>{
      try{
        const bytes=await regularFile(path.join(this.directory,row.id,'manifest.json'));
        if(sha(bytes)!==row.manifestSha256)fail('The imported manifest changed. Reimport the original package.');
        const meta=readPayload(parseJson(bytes,'GX mod manifest'),new Set(Object.keys(row.inventory)));
        restrictWebStyles(meta,row.inventory);
        this.records.set(row.id,{id:row.id,...meta});
      }catch(error){
        this.records.set(row.id,{id:row.id,name:row.name,categories:[],payload:{},error:error.message});
      }
    }));
  }
  update(data){
    if(this.error)fail(this.error);
    storage.write(this.file,data,decode);
    this.data=data;
  }
  snapshot(){
    const publicMod=({payload,...entry})=>entry;
    return {mods:[...this.records.values()].map(publicMod),active:{...this.data.active},error:this.error,
      review:this.review?publicMod(this.review.meta):null,busy:Boolean(this.pending),recovery:Boolean(this.recovery)};
  }
  choose(category,id){
    if(!supported.includes(category))fail('This mod category is unsupported.');
    const active={...this.data.active};
    if(id===null)delete active[category];
    else {
      if(!this.records.get(id)?.payload[category])fail('That mod does not provide a supported asset for this category.');
      active[category]=id;
    }
    this.update({...this.data,active});
  }
  remove(id){
    if(!this.records.has(id))fail('Choose an imported mod.');
    const active=Object.fromEntries(Object.entries(this.data.active).filter(([,selected])=>selected!==id));
    this.update({version:1,mods:this.data.mods.filter(row=>row.id!==id),active});
    this.records.delete(id);
    // Preserve the owned snapshot for the older checkpoint and recovery.
  }
  async prepare(input,archive){
    if(this.pending||this.review)fail('Finish the current mod review first.');
    if(this.error)fail(this.error);
    const id=crypto.randomUUID(),stage=path.join(this.directory,`review-${id}`);
    this.pending=id;
    let complete=false;
    try{
      const stat=await fs.lstat(input);
      if(stat.isSymbolicLink()||(archive?!stat.isFile():!stat.isDirectory()))fail('Choose a regular ZIP or mod folder.');
      const source=await fs.realpath(input),library=await fs.realpath(this.directory);
      if(!archive&&(source===library||library.startsWith(source+path.sep)))fail('Choose a mod directory outside the library.');
      await safeDirectory(stage);
      if(archive){
        if(path.extname(input).toLowerCase()!=='.zip')fail('Choose a GX source ZIP. Store-signed CRX packages need signature verification.');
        await extractArchive(input,stage);
      }else await copyDirectory(input,stage);
      const {root}=await packageRoot(stage);
      const bytes=await regularFile(path.join(root,'manifest.json'));
      const files=new Set();
      await walk(root,async (name,stat)=>{if(stat.isFile())files.add(name);});
      const meta={id,...readPayload(parseJson(bytes,'GX mod manifest'),files)};
      // Hash only supported, declared assets; keep unsupported bytes inert.
      const resources=new Set();
      for(const [category,value] of Object.entries(meta.payload)){
        if(category==='wallpaper')for(const image of Object.values(value)){resources.add(image.file);if(image.poster)resources.add(image.poster);}
        else if(category==='background_music')for(const file of value)resources.add(file);
        else if(soundEvents[category])for(const list of Object.values(value))for(const file of list)if(file)resources.add(file);
      }
      const inventory=Object.fromEntries([...files].map(name=>[name,emptyDigest]));
      for(const name of resources)inventory[name]=await this.hashAsset(path.join(root,name));
      const styles=new Set((meta.payload.page_styles||[]).flatMap(rule=>rule.css));
      for(const name of styles){
        const bytes=await regularFile(path.join(root,name));
        try{offlineCss(bytes);inventory[name]=sha(bytes);}catch{/* Preserve the unsupported stylesheet for future compatibility. */}
      }
      restrictWebStyles(meta,inventory);
      this.review={id,root,stage,meta,inventory,manifestSha256:sha(bytes)};
      complete=true;
      return this.snapshot();
    }finally{
      if(!complete)await this.clearReview(stage);
      this.pending=null;
    }
  }
  async hashAsset(file){
    const handle=await fs.open(file,'r');
    try{
      if(!(await handle.stat()).isFile())fail('Mod asset is not a regular file.');
      const hash=crypto.createHash('sha256');
      for await(const chunk of handle.createReadStream({autoClose:false}))hash.update(chunk);
      return hash.digest('hex');
    }finally{await handle.close();}
  }
  async accept(){
    if(this.pending||!this.review)fail('Review a mod before importing it.');
    const {id,root,stage,meta,inventory,manifestSha256}=this.review;
    this.pending=id;
    try{
      if(sha(await regularFile(path.join(root,'manifest.json')))!==manifestSha256)fail('The package changed during review.');
      const target=path.join(this.directory,id);
      await fs.rename(root,target);
      try{this.update({...this.data,mods:[...this.data.mods,{id,name:meta.name,manifestSha256,inventory}]});}
      catch(error){await fs.rename(target,root);throw error;}
      this.records.set(id,meta);
      this.review=null;
      if(root!==stage)await fs.rmdir(stage);
    }finally{this.pending=null;}
  }
  async cancel(){
    if(this.pending)fail('The mod library is busy.');
    const review=this.review;
    this.review=null;
    if(review)await this.clearReview(review.stage);
  }
  async clearReview(stage){
    if(path.dirname(path.resolve(stage))!==path.resolve(this.directory)||!idPattern.test(path.basename(stage).slice(7))||!path.basename(stage).startsWith('review-'))
      fail('The review directory is outside the mod library.');
    await fs.rm(stage,{recursive:true,force:true});
  }
  async recover(){
    if(!this.recovery)fail('There is no previous mod checkpoint.');
    storage.recover(this.file,this.recovery,decode);
    this.recovery=null;
    this.error='';
    this.records.clear();
    await this.open();
  }
  presentation(){
    const active={};
    for(const [key,id] of Object.entries(this.data.active)){
      const value=this.records.get(id)?.payload[key];
      if(!value)continue;
      if(key==='page_styles')continue;
      if(key==='theme')active.theme=value;
      else if(key==='wallpaper'){
        active.wallpaper=Object.fromEntries(Object.entries(value).map(([tone,item])=>[tone,{
          url:mediaUrl(id,item.file),video:item.video,poster:item.poster?mediaUrl(id,item.poster):null,
        }]));
      }else if(key==='background_music')active.music=mediaUrl(id,value[0]);
      else active[key]=Object.fromEntries(Object.entries(value).map(([event,files])=>[event,files.map(file=>file?mediaUrl(id,file):'')]));
    }
    return active;
  }
  async verifyAsset(url){
    const parsed=new URL(url);
    if(parsed.protocol!=='nox-mod:'||parsed.username||parsed.password||parsed.port||parsed.search||!idPattern.test(parsed.hostname))return null;
    const id=parsed.hostname;
    if(!Object.values(this.data.active).includes(id))return null;
    const file=safeRelative(decodeURIComponent(parsed.pathname.slice(1))),format=mime(file);
    if(!format)return null;
    const owned=await this.ownedFile(id,file);
    if(!owned||await this.hashAsset(owned.location)!==owned.digest)return null;
    return {location:owned.location,format};
  }
  async ownedFile(id,file){
    const row=this.data.mods.find(candidate=>candidate.id===id),digest=Object.hasOwn(row?.inventory||{},file)?row.inventory[file]:null;
    if(!digest||digest===emptyDigest)return null;
    const location=path.join(this.directory,id,file);
    for(let candidate=location;candidate!==this.directory;candidate=path.dirname(candidate)){
      if((await fs.lstat(candidate)).isSymbolicLink())return null;
    }
    return {location,digest};
  }
  async styles(url){
    const id=this.data.active.page_styles,rules=this.records.get(id)?.payload.page_styles;
    if(!rules)return '';
    const files=matchedStyles(rules,url),css=[];
    for(const file of files){
      const owned=await this.ownedFile(id,file);
      if(!owned)fail('A mod stylesheet is unavailable.');
      const bytes=await regularFile(owned.location);
      if(sha(bytes)!==owned.digest)fail('A mod stylesheet changed. Reimport the original package.');
      css.push(offlineCss(bytes));
    }
    return css.join('\n');
  }
}

module.exports={GxModLibrary,readPayload};
