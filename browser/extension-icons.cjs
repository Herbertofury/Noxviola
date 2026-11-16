'use strict';

const {crc32,deflate} = require('node:zlib');
const {promisify} = require('node:util');
const compress = promisify(deflate);
const PNG = Buffer.from([137,80,78,71,13,10,26,10]);
const MAX_RGBA_BYTES = 0x7fffffff; // Chromium SetIconNatives' checked signed-int limit.

class ExtensionIconError extends Error {
  constructor(code,message) { super(message);this.name='ExtensionIconError';this.code=code; }
}
function fail(code,message) { throw new ExtensionIconError(code,message); }
function dimensions(width,height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width<=0 || height<=0 || width>Math.floor(MAX_RGBA_BYTES/4/height)) fail('INVALID_ICON_DIMENSIONS','Icon dimensions must be positive integers whose RGBA bytes fit the native signed-int limit.');
  return {width,height};
}
function chunk(name,data) {
  const type=Buffer.from(name,'ascii'),value=Buffer.alloc(12+data.length);
  value.writeUInt32BE(data.length,0);type.copy(value,4);data.copy(value,8);
  value.writeUInt32BE(crc32(value.subarray(4,8+data.length)),8+data.length);
  return value;
}
function pngDimensions(value) {
  if (!Buffer.isBuffer(value) || value.length<33 || !value.subarray(0,8).equals(PNG)) fail('UNSUPPORTED_ICON_FORMAT','Package icon paths currently require PNG bytes. No remote or SVG image is fetched.');
  let offset=8,header=null,ended=false,imageData=false;
  while (offset<value.length) {
    if (value.length-offset<12) fail('INVALID_ICON_PNG','The PNG contains a truncated chunk.');
    const length=value.readUInt32BE(offset),end=offset+12+length;
    if (length>0x7fffffff || end>value.length) fail('INVALID_ICON_PNG','The PNG chunk length is invalid.');
    const type=value.toString('ascii',offset+4,offset+8);
    if (crc32(value.subarray(offset+4,end-4))!==value.readUInt32BE(end-4)) fail('INVALID_ICON_PNG','The PNG chunk checksum is invalid.');
    if (offset===8) {
      if (type!=='IHDR' || length!==13) fail('INVALID_ICON_PNG','The PNG has no valid leading image header.');
      header=dimensions(value.readUInt32BE(offset+8),value.readUInt32BE(offset+12));
    } else if (type==='IHDR') fail('INVALID_ICON_PNG','The PNG contains multiple image headers.');
    if (type==='acTL') fail('UNSUPPORTED_ICON_FORMAT','Animated PNG action icons are not implemented. Supply a static image.');
    if (type==='IDAT') imageData=true;
    if (type==='IEND') {
      if (length!==0 || end!==value.length || !imageData) fail('INVALID_ICON_PNG','The PNG end or image data is invalid.');
      ended=true;
    }
    offset=end;
  }
  if (!ended) fail('INVALID_ICON_PNG','The PNG has no complete end marker.');
  return header;
}
async function rgbaPNG(value) {
  if (!value || typeof value!=='object') fail('INVALID_ICON_DATA','An ImageData object is required.');
  const {width,height}=dimensions(value.width,value.height),data=value.data;
  if ((value.colorSpace!==undefined && value.colorSpace!=='srgb') || (value.pixelFormat!==undefined && value.pixelFormat!=='rgba-unorm8')) fail('UNSUPPORTED_ICON_COLOR_SPACE','Action icons currently accept 8-bit sRGB ImageData.');
  const byteView=ArrayBuffer.isView(data) && ['[object Uint8Array]','[object Uint8ClampedArray]'].includes(Object.prototype.toString.call(data));
  if ((!byteView && !Array.isArray(data)) || data.length!==4*width*height || (!byteView && !data.every(item=>Number.isInteger(item)&&item>=0&&item<=255))) fail('INVALID_ICON_DATA','ImageData must contain exactly four RGBA bytes per pixel.');
  const pixels=Buffer.from(data),rowBytes=4*width;
  let raw;
  try { raw=Buffer.alloc((rowBytes+1)*height); }
  catch { fail('ICON_ALLOCATION_FAILED','The icon bitmap could not be allocated.'); }
  for (let row=0;row<height;row++) pixels.copy(raw,row*(rowBytes+1)+1,row*rowBytes,(row+1)*rowBytes);
  const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
  const png=Buffer.concat([PNG,chunk('IHDR',header),chunk('sRGB',Buffer.from([0])),chunk('IDAT',await compress(raw)),chunk('IEND',Buffer.alloc(0))]);
  return {width,height,dataUrl:'data:image/png;base64,'+png.toString('base64')};
}
function resourcePath(runtimeId,input,baseURL) {
  if (typeof input!=='string' || !input || /[\\\x00-\x1f\x7f]/.test(input)) fail('INVALID_ICON_PATH','An icon path must name a resource in this extension.');
  const own='chrome-extension://'+runtimeId+'/';
  let url,base;
  try { base=new URL(baseURL||own);url=new URL(input,base); }
  catch { fail('INVALID_ICON_PATH','The icon resource URL is invalid.'); }
  for (const candidate of [base,url]) if (candidate.protocol!=='chrome-extension:' || candidate.hostname!==runtimeId || candidate.port || candidate.username || candidate.password) fail('ICON_ORIGIN_DENIED','Icons may only read the accepted extension package.');
  try { return decodeURIComponent(url.pathname).replace(/^\//,''); }
  catch { fail('INVALID_ICON_PATH','The icon resource path has invalid URL encoding.'); }
}
function entries(value,label) {
  if (!value || typeof value!=='object' || Array.isArray(value)) fail('INVALID_ICON_ARGUMENT','The '+label+' map must be an object.');
  const result=[],seen=new Set();
  for (const [key,item] of Object.entries(value)) {
    const size=Number(key);
    if (!/^\d+$/.test(key) || !Number.isSafeInteger(size) || size<=0 || size>0x7fffffff || seen.has(size)) fail('INVALID_ICON_SIZE','Icon map keys must be distinct positive integer sizes.');
    seen.add(size);result.push([size,item]);
  }
  return result.sort((a,b)=>a[0]-b[0]);
}
function present(value) { return value!==undefined && value!==null && !(typeof value==='object' && !Array.isArray(value) && !Object.keys(value).length); }

class ExtensionIcons {
  constructor({nativeImage,readResource}) { this.nativeImage=nativeImage;this.readResource=readResource;this.cache=new Map(); }
  owner(context) { return context.identity+'\0'+context.id; }
  revoke(id,identity) { this.cache.delete(identity+'\0'+id); }
  clear() { this.cache.clear(); }
  async file(context,input,baseURL) {
    const resource=resourcePath(context.runtimeId,input,baseURL),owner=this.owner(context);
    let record=this.cache.get(owner);
    if (!record || record.epoch!==context.epoch) { record={epoch:context.epoch,files:new Map()};this.cache.set(owner,record); }
    if (!record.files.has(resource)) {
      const loading=(async()=>{
        if (typeof this.readResource!=='function' || !this.nativeImage?.createFromBuffer) fail('ICON_DECODER_UNAVAILABLE','The authenticated package resource reader and native PNG decoder are required.');
        const bytes=await this.readResource(context,resource),source=pngDimensions(bytes);
        const image=this.nativeImage.createFromBuffer(bytes);
        if (!image || image.isEmpty()) fail('INVALID_ICON_PNG','The native image decoder rejected the package icon.');
        const size=image.getSize();dimensions(size.width,size.height);
        if (size.width!==source.width || size.height!==source.height) fail('INVALID_ICON_PNG','The decoded icon dimensions do not match its PNG header.');
        const png=image.toPNG(),encoded=pngDimensions(png);
        if (encoded.width!==size.width || encoded.height!==size.height) fail('INVALID_ICON_PNG','The native PNG encoder changed the icon dimensions.');
        return {...size,dataUrl:'data:image/png;base64,'+png.toString('base64')};
      })();
      record.files.set(resource,loading);
      loading.catch(()=>{if(record.files.get(resource)===loading)record.files.delete(resource);});
    }
    return record.files.get(resource);
  }
  async resolve(context,details,baseURL) {
    let work;
    // Chromium gives ImageData precedence when both forms are present, as in
    // Violentmonkey. Its public API specifies scalar values as size 16; actual
    // bitmap dimensions remain separate. Reset behavior is profile-specific.
    if (present(details.imageData)) {
      const data=details.imageData;
      const images=data && typeof data==='object' && ('width' in data || 'height' in data || 'data' in data) ? [[null,data]] : entries(data,'ImageData');
      work=images.map(async([size,value])=>{const icon=await rgbaPNG(value);return {size:size||16,...icon};});
    } else if (present(details.path)) {
      const paths=typeof details.path==='string'?[[null,details.path]]:entries(details.path,'path');
      work=paths.map(async([size,value])=>{const icon=await this.file(context,value,baseURL);return {size:size||16,...icon};});
    } else {
      if (context.apiProfile==='firefox') return null;
      fail('INVALID_ICON_ARGUMENT','The Chromium API behavior profile requires at least one icon image.');
    }
    const variants=await Promise.all(work);
    return {variants:variants.sort((a,b)=>a.size-b.size)};
  }
}

module.exports={ExtensionIcons,ExtensionIconError,rgbaPNG,pngDimensions,resourcePath};
