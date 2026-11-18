'use strict';

const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const storage=require('./storage.cjs');
const {parseJson,packageFiles}=require('./extensions.cjs');
const {safeRelative,safeDirectory,copyDirectory,extractArchive,packageRoot,regularFile,walk}=packageFiles;
const {offlineCss,matchedStyles}=require('./gx-web-styles.cjs');
const {readPayload,supported,mime,isObject,checkVectorAnimation}=require('./gx-mod-format.cjs');

const emptyDigest='0'.repeat(64);
const idPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const digestPattern=/^[0-9a-f]{64}$/;
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const mediaUrl=(id,file)=>`nox-mod://${id}/${file.split('/').map(encodeURIComponent).join('/')}`;
function fail(message){throw new Error(message);}

function restrictAssets(meta,inventory){
  const verified=file=>Object.hasOwn(inventory,file)&&inventory[file]!==emptyDigest;
  for(const category of meta.categories){
    const variants=meta.payload[category.key];
    if(!variants)continue;
    if(category.key==='page_styles'){
      const originalCount=variants.reduce((count,variant)=>count+variant.value.length,0);
      for(const variant of variants){
        variant.value=variant.value.filter(rule=>rule.css.every(verified));
        variant.resources=new Map(variant.value.flatMap(rule=>rule.css.map(file=>[file,'css'])));
      }
      category.matches=[...new Set(variants.flatMap(variant=>variant.value.flatMap(rule=>rule.matches)))];
      const after=variants.reduce((count,variant)=>count+variant.value.length,0);
      category.detail=after===originalCount?'Styles run on the declared websites.':'Some styles have linked or unverified resources.';
    }
    const allowed=variants.filter(variant=>Object.keys(variant.value).length&&[...variant.resources.keys()].every(verified));
    if(allowed.length)meta.payload[category.key]=allowed;
    else delete meta.payload[category.key];
    category.supported=Boolean(allowed.length);
    category.variants=allowed.map(({id,name})=>({id,name}));
    if(allowed.length<variants.length)category.detail='Some components have unsupported or previously unverified assets. Reimport the original package to review newly supported files.';
  }
}

function validateSelection(active,variants,ids){
  if(!isObject(active)||!isObject(variants))fail('The saved mod selection is invalid.');
  for(const [category,id] of Object.entries(active))if(!supported.includes(category)||!ids.has(id))fail('A saved mod selection is unavailable.');
  for(const [category,id] of Object.entries(variants))if(!Object.hasOwn(active,category)||typeof id!=='string'||!id||id.length>1200)fail('A saved mod component is invalid.');
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
  validateSelection(value.active,value.variants??{},ids);
  if(value.presets!==undefined){
    if(!Array.isArray(value.presets))fail('Saved mod presets are invalid.');
    const presets=new Set();
    for(const preset of value.presets){
      if(!isObject(preset)||!idPattern.test(preset.id)||presets.has(preset.id)||typeof preset.name!=='string'||!preset.name.trim()||preset.name.length>100)
        fail('A saved mod preset is invalid.');
      presets.add(preset.id);
      validateSelection(preset.active,preset.variants,ids);
    }
  }
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
        restrictAssets(meta,row.inventory);
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
    return {mods:[...this.records.values()].map(publicMod),active:{...this.data.active},
      variants:{...this.data.variants},presets:(this.data.presets||[]).map(({id,name})=>({id,name})),error:this.error,
      review:this.review?publicMod(this.review.meta):null,busy:Boolean(this.pending),recovery:Boolean(this.recovery)};
  }
  variant(category,id,variantId){
    const available=this.records.get(id)?.payload[category];
    return variantId===undefined?available?.[0]:available?.find(variant=>variant.id===variantId);
  }
  component(category){
    return this.variant(category,this.data.active[category],this.data.variants?.[category]);
  }
  selectionKey(category){
    return this.data.active[category]?JSON.stringify([this.data.active[category],this.component(category)?.id]):null;
  }
  choose(category,id,variantId){
    if(!supported.includes(category))fail('This mod category is unsupported.');
    const active={...this.data.active},variants={...this.data.variants};
    if(id===null){
      delete active[category];delete variants[category];
    }else{
      const chosen=this.variant(category,id,variantId);
      if(!chosen)fail('That mod does not provide the selected component.');
      active[category]=id;
      variants[category]=chosen.id;
    }
    this.update({...this.data,active,variants});
  }
  savePreset(name){
    if(typeof name!=='string'||!name.trim()||name.trim().length>100)fail('Enter a preset name up to 100 characters.');
    const preset={id:crypto.randomUUID(),name:name.trim(),active:{...this.data.active},variants:{...this.data.variants}};
    this.update({...this.data,presets:[...(this.data.presets||[]),preset]});
  }
  applyPreset(id){
    const preset=this.data.presets?.find(item=>item.id===id);
    if(!preset)fail('Choose a saved mod preset.');
    for(const [category,mod] of Object.entries(preset.active)){
      const variant=preset.variants[category];
      if(!this.variant(category,mod,variant))
        fail('This preset contains an unavailable component. Review and reimport the original mod.');
    }
    this.update({...this.data,active:{...preset.active},variants:{...preset.variants}});
  }
  removePreset(id){
    if(!this.data.presets?.some(item=>item.id===id))fail('Choose a saved mod preset.');
    this.update({...this.data,presets:this.data.presets.filter(item=>item.id!==id)});
  }
  remove(id){
    if(!this.records.has(id))fail('Choose an imported mod.');
    const retain=selection=>{
      const active=Object.fromEntries(Object.entries(selection.active).filter(([,selected])=>selected!==id));
      const variants=Object.fromEntries(Object.entries(selection.variants||{}).filter(([category])=>Object.hasOwn(active,category)));
      return {active,variants};
    };
    const presets=(this.data.presets||[]).map(preset=>({...preset,...retain(preset)}));
    this.update({...this.data,...retain(this.data),mods:this.data.mods.filter(row=>row.id!==id),presets});
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
      // Hash supported declared assets. A checkpoint with previously unknown
      // resources remains inert until the original package is explicitly reviewed.
      const resources=new Map(Object.values(meta.payload).flatMap(variants=>variants.flatMap(variant=>[...variant.resources])));
      const inventory=Object.fromEntries([...files].map(name=>[name,emptyDigest]));
      for(const [name,kind] of resources){
        const location=path.join(root,name);
        if(kind==='media'){inventory[name]=await this.hashAsset(location);continue;}
        try{
          const bytes=await regularFile(location);
          if(kind==='css')offlineCss(bytes);
          else checkVectorAnimation(parseJson(bytes,'GX sidebar icon'));
          inventory[name]=sha(bytes);
        }catch{/* Preserve unsupported styles and icons. */}
      }
      restrictAssets(meta,inventory);
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
      const value=this.component(key)?.value;
      if(!value||key==='page_styles')continue;
      const url=file=>mediaUrl(id,file);
      if(key==='theme')active.theme=value;
      else if(key==='wallpaper')active.wallpaper=Object.fromEntries(Object.entries(value).map(([tone,{file,poster,...settings}])=>[tone,{
        ...settings,url:url(file),poster:poster?url(poster):null,
      }]));
      else if(key==='background_music')active.music=value.map(url);
      else if(key==='stickers')active.stickers=value.map(url);
      else if(key==='fonts')active.fonts=Object.fromEntries(Object.entries(value).map(([role,faces])=>[role,faces.map(({file,...face})=>({...face,url:url(file)}))]));
      else if(key==='cursors'||key==='image_overrides')active[key]=Object.fromEntries(Object.entries(value).map(([role,file])=>[role,url(file)]));
      else if(key==='app_icon'||key==='splash_screen')active[key]=url(value);
      else active[key]=Object.fromEntries(Object.entries(value).map(([event,files])=>[event,files.map(file=>file?url(file):'')]));
    }
    return active;
  }
  async verifyAsset(url){
    const parsed=new URL(url);
    if(parsed.protocol!=='nox-mod:'||parsed.username||parsed.password||parsed.port||parsed.search||!idPattern.test(parsed.hostname))return null;
    const id=parsed.hostname,file=safeRelative(decodeURIComponent(parsed.pathname.slice(1))),format=mime(file);
    if(!format||!Object.entries(this.data.active).some(([key,owner])=>owner===id&&['media','lottie'].includes(this.component(key)?.resources.get(file))))return null;
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
    const id=this.data.active.page_styles,rules=this.component('page_styles')?.value;
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
