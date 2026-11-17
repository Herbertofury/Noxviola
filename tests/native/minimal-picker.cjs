'use strict';
// Diagnostic only: pinned Electron + one inert sandboxed window + real native
// dialogs. No Noxviola services, renderer, backup worker, real profile or files.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawn,execFile}=require('node:child_process'),{promisify}=require('node:util');
const execute=promisify(execFile);
const title='Export all saved collections for this identity; choose a NEW filename';
const modes=['save-first','cancel-then-save'];
async function launch(){
 const root=fs.mkdtempSync(path.resolve('native-picker-minimal-'));
 const results=[];const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 for(const mode of modes){
  const dir=path.join(root,mode);fs.mkdirSync(dir);
  const child=spawn(require('electron'),[__filename,'--fixture',dir,'--mode',mode],{stdio:['ignore','pipe','pipe'],env});
  const log=fs.createWriteStream(path.join(dir,'runtime.log'),{flags:'wx'});child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});
  let logError=null;log.on('error',error=>{logError=error.message;child.kill('SIGKILL');});
  let timedOut=false;const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},60000);
  let code=null,launchError=null;
  try{code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});}
  catch(error){launchError=error.message;}
  finally{clearTimeout(timer);await new Promise(resolve=>{if(log.destroyed)resolve();else{log.once('error',resolve);log.end(resolve);}});}
  results.push({mode,code,timedOut,launchError,logError});
 }
 fs.writeFileSync(path.join(root,'summary.json'),JSON.stringify({versions:process.versions,results},null,2));
 console.log('Minimal native picker evidence: '+root);
 if(results.some(r=>r.code!==0||r.timedOut||r.launchError||r.logError))process.exitCode=1;
}
async function fixture(){
 const root=process.argv[process.argv.indexOf('--fixture')+1],mode=process.argv[process.argv.indexOf('--mode')+1];
 if(!path.isAbsolute(root)||!fs.statSync(root).isDirectory()||!modes.includes(mode))throw Error('Exact existing synthetic fixture directory and mode required');
 const {app,BrowserWindow,dialog}=require('electron');
 app.setPath('userData',path.join(root,'profile'));
 app.on('window-all-closed',()=>{}); // Keep receipt/finally alive after a helper failure.
 const report={mode,versions:process.versions,started:Date.now(),operations:[]};
 let win;
 const save=()=>fs.writeFileSync(path.join(root,'receipt.json'),JSON.stringify(report,null,2));
 try{
  await app.whenReady();win=new BrowserWindow({width:900,height:700,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
  await win.loadURL('data:text/html,<title>Isolated native picker reproduction</title><h1>Synthetic native dialog fixture</h1>');
  async function choose(cancel){
   const index=report.operations.length,dir=path.join(root,'dialog-'+index);fs.mkdirSync(dir);
   const requested=path.join(root,'selected-'+index+'.noxlibrary');assert.equal(fs.existsSync(requested),false);
   const entry={cancel,requested,started:Date.now()};report.operations.push(entry);save();
   const args=['-B',path.join(__dirname,'file-picker.py'),'--pid',String(process.pid),'--title',title,'--evidence-dir',dir,...(cancel?['--cancel']:['--file',requested])];
   const helper=execute('python',args,{encoding:'utf8',windowsHide:true,timeout:25000}).then(r=>{entry.helper={stdout:r.stdout,stderr:r.stderr};return r;},error=>{entry.helperError={message:error.message,stdout:error.stdout,stderr:error.stderr};save();if(!win.isDestroyed())win.destroy();return null;});
   // Only native options used by production; no mocked response or custom handler.
   const selected=await dialog.showSaveDialog(win,{title,defaultPath:'noxviola-library-personal.noxlibrary',filters:[{name:'Noxviola library-only backup (plaintext URLs)',extensions:['noxlibrary']}]});
   entry.returnedAt=Date.now();entry.selected=selected;save();
   await helper;if(entry.helperError)throw Error(entry.helperError.message);
   if(cancel)assert.equal(selected.canceled,true);
   else {assert.equal(selected.canceled,false);assert.equal(selected.filePath,requested,'Native committed path must exactly equal requested path');}
   entry.passed=true;save();
  }
  if(mode==='cancel-then-save')await choose(true);
  await choose(false);report.passed=true;
 }catch(error){report.passed=false;report.error=error.stack;}
 finally{report.finished=Date.now();save();if(win&&!win.isDestroyed())win.destroy();app.exit(report.passed?0:1);}
}
if(process.versions.electron)fixture().catch(error=>{console.error(error);require('electron').app.exit(1);});
else launch().catch(error=>{console.error(error);process.exitCode=1;});
