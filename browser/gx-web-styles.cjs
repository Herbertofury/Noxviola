'use strict';

const {matches,pattern}=require('./extension-policy.cjs');

function validMatch(value){
  return typeof value==='string'&&pattern(value)?.schemes.some(scheme=>['https:','http:'].includes(scheme));
}

// The initial stylesheet profile works offline. Reject CSS constructs that
// resolve resources and escapes that could hide those constructs.
function offlineCss(bytes){
  const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  const clean=text.replace(/\/\*[\s\S]*?\*\//g,'');
  if(/\\|\u0000|\b(?:url|image|image-set|-webkit-image-set|src|cross-fade|paint)\s*\(|@(?!(?:media|supports|layer|container|keyframes|-webkit-keyframes)\b)/i.test(clean))
    throw new Error('The stylesheet uses linked resources, escapes, or unsupported at-rules.');
  return clean;
}

function matchedStyles(rules,url){
  let address;
  try{address=new URL(url);}catch{return [];}
  if(!['https:','http:'].includes(address.protocol)||address.username||address.password)return [];
  const files=new Set();
  for(const rule of rules){
    if(rule.matches.some(item=>matches(item,url))&&!rule.exclude.some(item=>matches(item,url))){
      for(const file of rule.css)files.add(file);
    }
  }
  return [...files];
}

function mountStyles(readStyles,onError){
  const pages=new Map();
  async function update(contents){
    const owner=pages.get(contents);
    if(!owner||contents.isDestroyed())return;
    const revision=++owner.revision,url=contents.getURL();
    const previous=owner.key;owner.key=null;
    if(previous)await contents.removeInsertedCSS(previous).catch(()=>{});
    const current=()=>pages.get(contents)===owner&&owner.revision===revision&&!contents.isDestroyed()&&contents.getURL()===url;
    try{
      const css=await readStyles(url);
      if(!css||!current())return;
      const key=await contents.insertCSS(css,{cssOrigin:'user'});
      if(current())owner.key=key;
      else if(!contents.isDestroyed())await contents.removeInsertedCSS(key).catch(()=>{});
    }catch(error){if(current())onError(error);}
  }
  function attach(contents){
    if(pages.has(contents))return;
    const owner={key:null,revision:0};
    pages.set(contents,owner);
    contents.on('did-start-navigation',(_event,_url,sameDocument,mainFrame)=>{
      if(mainFrame&&!sameDocument){owner.key=null;owner.revision++;}
    });
    contents.on('did-finish-load',()=>void update(contents));
    contents.on('did-navigate-in-page',(_event,_url,mainFrame)=>{if(mainFrame)void update(contents);});
    contents.once('destroyed',()=>pages.delete(contents));
  }
  function refresh(){for(const contents of pages.keys())void update(contents);}
  return {attach,refresh};
}

module.exports={validMatch,offlineCss,matchedStyles,mountStyles};
