'use strict';
// Explicit, main-frame-only password actions. Websites never receive a browser API.
const {randomBytes}=require('node:crypto');
const WORLD=23017;
const DOCUMENT_TICKET='noxviolaPasswordAction';
function loginOrigin(value){
  let url;try{url=new URL(value);}catch{throw new Error('Open a secure login page first.');}
  if(url.username||url.password||!(url.protocol==='https:'||url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw new Error('Passwords require HTTPS (or a local test server).');
  return url.origin;
}
async function evaluate(wc,code){
  if(!wc||wc.isDestroyed())throw new Error('The login page is no longer available.');
  return wc.executeJavaScriptInIsolatedWorld(WORLD,[{code}],true);
}
async function prepare(wc){
  const origin=loginOrigin(wc.getURL()),key=DOCUMENT_TICKET,token=randomBytes(32).toString('hex');
  const result=await evaluate(wc,`(()=>{if(location.origin!==${JSON.stringify(origin)})return false;globalThis[${JSON.stringify(key)}]=${JSON.stringify(token)};return true;})()`);
  if(!result||loginOrigin(wc.getURL())!==origin)throw new Error('The login page changed. Try again.');
  return {wc,origin,key,token};
}
// This function is serialized into an isolated world with its own JS intrinsics.
function pageAction(request){
  if(location.origin!==request.origin||globalThis[request.key]!==request.token)return {error:'The login page changed. Try again.'};
  delete globalThis[request.key];
  const visible=input=>!input.disabled&&!input.readOnly&&input.getClientRects().length>0&&getComputedStyle(input).visibility!=='hidden'&&getComputedStyle(input).display!=='none';
  const tokens=input=>input.autocomplete.toLowerCase().split(/\s+/);
  const passwords=Array.from(document.querySelectorAll('input[type="password"]')).filter(visible).filter(input=>!tokens(input).includes('new-password'));
  const current=passwords.filter(input=>tokens(input).includes('current-password'));
  const password=current.length===1?current[0]:passwords.length===1?passwords[0]:null;
  if(!password)return {error:'A single visible sign-in password field is required. Registration and ambiguous forms are not filled.'};
  const form=password.form||document,inputs=Array.from(form.querySelectorAll('input')).filter(visible).filter(input=>['text','email','tel'].includes(input.type));
  const named=inputs.filter(input=>tokens(input).some(token=>['username','email'].includes(token)));
  const preceding=inputs.filter(input=>Boolean(input.compareDocumentPosition(password)&Node.DOCUMENT_POSITION_FOLLOWING));
  const username=named.length===1?named[0]:preceding.at(-1);
  if(request.action==='read'){
    if(!password.value)return {error:'The sign-in password field is empty.'};
    return {origin:location.origin,username:username?.value||'',password:password.value};
  }
  const set=(input,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));};
  if(username)set(username,request.username);
  if(!password.isConnected||password.form!== (form===document?null:form)||!visible(password)||tokens(password).includes('new-password'))return {error:'The website changed its sign-in fields. Try again.'};
  set(password,request.password);
  return {origin:location.origin,filled:true,usernameFilled:Boolean(username),submitted:false};
}
async function action(context,kind,credential){
  const {wc,origin,key,token}=context;
  if(loginOrigin(wc.getURL())!==origin)throw new Error('The login page changed. Try again.');
  if(kind==='fill'&&loginOrigin(credential.origin)!==origin)throw new Error('This password belongs to a different site.');
  const request={origin,key,token,action:kind,...(kind==='fill'?{username:credential.username,password:credential.password}:{})};
  try{
    const result=await evaluate(wc,`(${pageAction.toString()})(${JSON.stringify(request)})`);
    if(result?.error)throw new Error(result.error);
    if(!result||loginOrigin(wc.getURL())!==origin)throw new Error('The login page changed. Try again.');
    return result;
  }finally{await evaluate(wc,`if(globalThis[${JSON.stringify(key)}]===${JSON.stringify(token)})delete globalThis[${JSON.stringify(key)}]`).catch(()=>{});}
}
module.exports={loginOrigin,prepare,read:context=>action(context,'read'),fill:(context,credential)=>action(context,'fill',credential)};
