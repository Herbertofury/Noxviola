'use strict';
// Parse only Nexus's own profile header. Comments, descriptions and errors are
// never evidence of an account status. HTML is inert and never executes.
const MAX_RESPONSE_BYTES=4*1024*1024;
function profileURL(author){if(author?.source?.provider!=='nexus'||typeof author.source.handle!=='string'||!/^[A-Za-z0-9_.-]+$/.test(author.source.handle))throw new Error('This author has no supported Nexus status endpoint.');const expected=`https://www.nexusmods.com/profile/${author.source.handle}`,u=new URL(author.source.profileUrl);if(u.href.toLowerCase()!==expected.toLowerCase())throw new Error('Nexus author profile and handle do not match.');return expected;}
const attr=(node,name)=>node.attrs?.find(row=>row.name===name)?.value;
const children=node=>(node.childNodes||[]).filter(child=>child.tagName);
const classes=node=>new Set((attr(node,'class')||'').split(/\s+/));
function all(root,predicate){const result=[],stack=[root];while(stack.length){const node=stack.pop();if(predicate(node))result.push(node);for(const child of node.childNodes||[])stack.push(child);}return result;}
function content(node){return all(node,n=>n.nodeName==='#text').reverse().map(n=>n.value).join('').trim();}
function within(node,ancestor){for(let current=node;current;current=current.parentNode)if(current===ancestor)return true;return false;}
async function parseHeader(html,author,prior){
 const {parse}=await import('parse5'),document=parse(html),roots=all(document,n=>attr(n,'id')==='mainContent');if(roots.length!==1)throw new Error('Nexus profile layout was not recognized; status is unknown.');
 const headings=all(roots[0],n=>n.tagName==='h1'&&content(n).toLowerCase()===author.source.handle.toLowerCase());if(headings.length!==1)throw new Error('Nexus did not identify this profile in its heading.');const heading=headings[0],row=heading.parentNode?.parentNode;
 if(!row||!within(row,roots[0]))throw new Error('Nexus profile identity layout changed.');
 const wrappers=children(row).filter(n=>n!==heading.parentNode&&children(n).some(c=>c.tagName==='img'&&attr(c,'alt')?.toLowerCase()===author.source.handle.toLowerCase()));if(wrappers.length!==1)throw new Error('Nexus profile avatar identity is unavailable.');
 const avatars=children(wrappers[0]).filter(n=>n.tagName==='img'&&attr(n,'alt')?.toLowerCase()===author.source.handle.toLowerCase());if(avatars.length!==1)throw new Error('Nexus profile avatar identity is ambiguous.');
 const match=(attr(avatars[0],'src')||'').match(/^https:\/\/avatars\.nexusmods\.com\/([1-9][0-9]*)\/[1-9][0-9]*$/);if(!match)throw new Error('Nexus did not provide a recognized stable author ID.');if((author.source.accountId&&author.source.accountId!==match[1])||(prior?.providerAuthorId&&prior.providerAuthorId!==match[1]))throw new Error('The Nexus handle now identifies a different account. Review the author identity.');
 const pills=children(wrappers[0]).filter(n=>classes(n).has('nxm-pill')&&classes(n).has('nxm-pill-danger'));
 const labels=pills.flatMap(n=>children(n).filter(c=>classes(c).has('nxm-pill-label')).map(content));
 if(pills.length>1||(pills.length===1&&labels.length!==1)||labels.some(label=>label!=='Banned'))throw new Error('Nexus showed an unrecognized status badge; previous evidence retained.');
 return {state:labels[0]==='Banned'?'banned':'available',providerAuthorId:match[1],summary:labels[0]==='Banned'?'Nexus displayed its Banned badge in this author’s profile header. No moderation reason was inferred.':'The identified Nexus profile loaded without a Banned badge. This records page availability, not a claim about moderation decisions.'};
}
async function boundedText(response){if(Number(response.headers.get('content-length'))>MAX_RESPONSE_BYTES){await response.body?.cancel();throw new Error('Nexus profile exceeds 4 MiB; status is unknown.');}if(!response.body?.getReader)throw new Error('Nexus profile body unavailable.');const reader=response.body.getReader(),chunks=[];let length=0;try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>MAX_RESPONSE_BYTES)throw new Error('Nexus profile exceeds 4 MiB; status is unknown.');chunks.push(value);}}catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}return Buffer.concat(chunks,length).toString('utf8');}
async function collect(author,{fetcher=fetch,signal,now=Date.now,prior}={}){
 const url=profileURL(author),response=await fetcher(url,{headers:{Accept:'text/html','User-Agent':'Noxviola/0.1.0 (+https://github.com/Herbertofury/Noxviola)'},credentials:'omit',redirect:'error',signal});
 const retry=response.headers.get('retry-after'),raw=retry===null?0:/^\d+$/.test(retry)?now()+Number(retry)*1000:Date.parse(retry),pause=Number.isFinite(raw)&&raw>=0&&raw<=8640000000000000?raw:0;
 try{if(!response.ok)throw new Error(`Nexus returned HTTP ${response.status}; account status is unknown and previous evidence is retained.`);if(!response.url||response.url.toLowerCase()!==url.toLowerCase())throw new Error('Nexus returned a different profile location.');if(!/^text\/html(?:;|$)/i.test(response.headers.get('content-type')||''))throw new Error('Nexus did not return a profile page.');const result=await parseHeader(await boundedText(response),author,prior);return {...result,evidenceUrl:url,observedAt:now(),notBefore:pause};}catch(error){error.retryAt=Math.max(error.retryAt||0,pause,[403,429].includes(response.status)?now()+60000:0);throw error;}
}
module.exports={profileURL,parseHeader,collect,MAX_RESPONSE_BYTES};
