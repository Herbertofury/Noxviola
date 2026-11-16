'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {inflateSync,crc32}=require('node:zlib');
const {ExtensionIcons,rgbaPNG,pngDimensions,resourcePath}=require('../browser/extension-icons.cjs');
const EXT='a'.repeat(32),FOREIGN='b'.repeat(32);
const context={id:'package',identity:'personal',runtimeId:EXT,epoch:'first'};
function bytes(icon){return Buffer.from(icon.dataUrl.split(',')[1],'base64');}
function decodeRGBA(png){
  assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  let offset=8,width,height;const chunks=[];
  while(offset<png.length){const length=png.readUInt32BE(offset),type=png.toString('ascii',offset+4,offset+8),data=png.subarray(offset+8,offset+8+length);assert.equal(crc32(png.subarray(offset+4,offset+8+length)),png.readUInt32BE(offset+8+length));if(type==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);assert.equal(data[8],8);assert.equal(data[9],6);}if(type==='IDAT')chunks.push(data);offset+=12+length;}
  const raw=inflateSync(Buffer.concat(chunks)),pixels=[];
  for(let row=0;row<height;row++){assert.equal(raw[row*(4*width+1)],0);pixels.push(...raw.subarray(row*(4*width+1)+1,(row+1)*(4*width+1)));}
  return {width,height,pixels};
}
function codec(calls){return {createFromBuffer(png){calls.push(Buffer.from(png));const size=pngDimensions(png);return {isEmpty:()=>false,getSize:()=>size,toPNG:()=>Buffer.from(png)};}};}
test('RGBA icons retain exact color, alpha and non-square dimensions in actual PNG bytes',async()=>{
  const rgba=[255,0,0,255,0,255,0,128,0,0,255,0,12,34,56,78,255,255,255,255,0,0,0,1];
  const icon=await rgbaPNG({width:3,height:2,data:new Uint8ClampedArray(rgba),colorSpace:'srgb',pixelFormat:'rgba-unorm8'});
  assert.deepEqual(decodeRGBA(bytes(icon)),{width:3,height:2,pixels:rgba});
  assert.deepEqual(pngDimensions(bytes(icon)),{width:3,height:2});
  await assert.rejects(rgbaPNG({width:2,height:2,data:new Uint8Array(3)}),{code:'INVALID_ICON_DATA'});
  await assert.rejects(rgbaPNG({width:0x7fffffff,height:2,data:[]}),{code:'INVALID_ICON_DIMENSIONS'});
  await assert.rejects(rgbaPNG({width:1,height:1,data:[-1,0,0,255]}),{code:'INVALID_ICON_DATA'});
  await assert.rejects(rgbaPNG({width:1,height:1,data:new Int8Array(4)}),{code:'INVALID_ICON_DATA'});
  await assert.rejects(rgbaPNG({width:1,height:1,data:[1,2,3,4],colorSpace:'display-p3'}),{code:'UNSUPPORTED_ICON_COLOR_SPACE'});
});
test('own relative and encoded paths follow document URLs without admitting any foreign resource origin',()=>{
  assert.equal(resourcePath(EXT,'../icons/dr_active_19.png','chrome-extension://'+EXT+'/background/index.html'),'icons/dr_active_19.png');
  assert.equal(resourcePath(EXT,'/icons/space%20name.png?version=1#icon'),'icons/space name.png');
  for(const input of ['https://example.test/icon.png','data:image/png;base64,AA==','file:///tmp/icon.png','chrome-extension://'+FOREIGN+'/icon.png','//'+FOREIGN+'/icon.png','icons\\image.png'])assert.throws(()=>resourcePath(EXT,input),error=>['ICON_ORIGIN_DENIED','INVALID_ICON_PATH'].includes(error.code));
  assert.throws(()=>resourcePath(EXT,'icon.png','https://example.test/'),{code:'ICON_ORIGIN_DENIED'});
});
test('path size maps preserve all declared resolutions, native dimensions and verified resource caching per enrollment',async()=>{
  const source=bytes(await rgbaPNG({width:2,height:1,data:new Uint8Array(8)})),reads=[],decodes=[];
  const resolver=new ExtensionIcons({nativeImage:codec(decodes),readResource:async(ctx,name)=>{reads.push([ctx.epoch,name]);return source;}});
  const icon=await resolver.resolve(context,{path:{19:'../icons/dr_active_19.png',38:'../icons/dr_active_38.png'}},'chrome-extension://'+EXT+'/background/index.html');
  assert.deepEqual(icon.variants.map(({size,width,height})=>({size,width,height})),[{size:19,width:2,height:1},{size:38,width:2,height:1}]);
  assert.equal(decodes.length,2);assert.deepEqual(reads.map(value=>value[1]),['icons/dr_active_19.png','icons/dr_active_38.png']);
  await resolver.resolve(context,{path:'icons/dr_active_19.png'});assert.equal(reads.length,2);
  await resolver.resolve({...context,epoch:'second'},{path:'icons/dr_active_19.png'});assert.equal(reads.length,3);
  resolver.revoke(context.id,context.identity);assert.equal(resolver.cache.size,0);
});
test('ImageData takes precedence over the simultaneous path map used by Violentmonkey and explicit empty forms reset',async()=>{
  const resolver=new ExtensionIcons({readResource:()=>{throw new Error('No path read is allowed when ImageData exists');}});
  const icon=await resolver.resolve(context,{imageData:{16:{width:1,height:1,data:new Uint8ClampedArray([20,40,60,128])},32:{width:2,height:1,data:new Uint8ClampedArray([20,40,60,128,80,100,120,255])}},path:{16:'https://denied.test/icon.png'}});
  assert.deepEqual(icon.variants.map(value=>value.size),[16,32]);assert.deepEqual(decodeRGBA(bytes(icon.variants[0])).pixels,[20,40,60,128]);
  for(const details of [{},{imageData:null,path:null},{imageData:{},path:{}}]){
    assert.equal(await resolver.resolve({...context,apiProfile:'firefox'},details),null);
    await assert.rejects(resolver.resolve({...context,apiProfile:'chromium'},details),{code:'INVALID_ICON_ARGUMENT'});
  }
  for(const details of [{path:''},{path:12},{path:[]},{imageData:12},{imageData:[]},{path:{16:'a.png','016':'b.png'}}])await assert.rejects(resolver.resolve(context,details));
});
test('corrupt, non-PNG and decoder-rejected files fail without a cached success and can be corrected for a later call',async()=>{
  const good=bytes(await rgbaPNG({width:1,height:1,data:[1,2,3,255]}));let source=Buffer.from('not an image'),decodes=[];
  const resolver=new ExtensionIcons({nativeImage:codec(decodes),readResource:async()=>source});
  await assert.rejects(resolver.resolve(context,{path:'icon.png'}),{code:'UNSUPPORTED_ICON_FORMAT'});assert.equal(decodes.length,0);
  source=Buffer.from(good);source[20]^=1;
  await assert.rejects(resolver.resolve(context,{path:'icon.png'}),{code:'INVALID_ICON_PNG'});assert.equal(decodes.length,0);
  source=good;resolver.nativeImage={createFromBuffer:()=>({isEmpty:()=>true})};
  await assert.rejects(resolver.resolve(context,{path:'icon.png'}),{code:'INVALID_ICON_PNG'});
  resolver.nativeImage=codec(decodes);assert.equal((await resolver.resolve(context,{path:'icon.png'})).variants.length,1);assert.equal(decodes.length,1);
});
