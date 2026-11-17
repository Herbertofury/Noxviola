'use strict';
const {spawn}=require('node:child_process');
const path=require('node:path');
const fs=require('node:fs');
const FRAME=8*1024*1024;
// Exactly one in-flight request: no unbounded pipe buffering or eager library snapshot.
class TabCollections {
  constructor({file,timeoutMs=120000,binary=path.join(__dirname.replace(/app\.asar(?=[\\/])/,'app.asar.unpacked'),'bin',process.platform==='win32'?'noxviola-tab-collections.exe':'noxviola-tab-collections')}){this.file=file;this.binary=binary;this.timeoutMs=timeoutMs;this.child=null;this.pending=null;this.buffer='';this.dead=false;}
  start(){
    if(this.dead)throw new Error('Collection storage stopped. Restart the browser; no automatic mutation retry was attempted.');
    if(this.child)return;
    if(!fs.existsSync(this.binary))throw new Error('Tab collection storage is not built. Run npm run build:collections before using this preview.');
    this.child=spawn(this.binary,[this.file],{stdio:['pipe','pipe','pipe'],windowsHide:true});
    this.child.stderr.on('data',()=>{});
    this.child.stdin.on('error',error=>this.fail(error));this.child.stdout.on('error',error=>this.fail(error));
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data',chunk=>{
      this.buffer+=chunk;
      if(Buffer.byteLength(this.buffer)>FRAME)return this.fail(new Error('Collection response exceeded the transport budget. Original database retained.'));
      const newline=this.buffer.indexOf('\n');if(newline<0)return;
      const line=this.buffer.slice(0,newline);this.buffer=this.buffer.slice(newline+1);const pending=this.pending;this.pending=null;
      if(!pending)return this.fail(new Error('Unexpected storage response.'));
      clearTimeout(pending.timer);
      try{const response=JSON.parse(line);if(response.error)pending.reject(new Error(response.error));else pending.resolve(response.ok);}catch(error){pending.reject(error);}
    });
    this.child.on('error',error=>this.fail(error));this.child.on('exit',()=>this.fail(new Error('Collection storage exited; save status may be uncertain. No tabs were closed.')));
  }
  fail(error){this.dead=true;this.child?.kill();if(this.pending){clearTimeout(this.pending.timer);this.pending.reject(error);this.pending=null;}}
  request(value){
    try{if(this.pending)throw new Error('Collection storage is busy. Please finish the current operation first.');const frame=JSON.stringify(value)+'\n';if(Buffer.byteLength(frame)>FRAME)throw new Error('This operation is too large for one transaction. Save smaller tab batches; the collection library has no record-count cap.');this.start();
      return new Promise((resolve,reject)=>{const timer=this.timeoutMs===0?null:setTimeout(()=>this.fail(new Error('Collection storage did not finish. Database preserved; verify the library before retrying a save.')),this.timeoutMs);this.pending={resolve,reject,timer};this.child.stdin.write(frame,error=>{if(error)this.fail(error);});});
    }catch(error){return Promise.reject(error);}
  }
  close(){this.dead=true;this.child?.stdin.end();}
}
module.exports={TabCollections};
