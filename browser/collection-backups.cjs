'use strict';
const path=require('node:path'),crypto=require('node:crypto');const{TabCollections}=require('./tab-collections.cjs');
// Dedicated connection: streaming file jobs never block the shared stdio queue or
// inherit its interactive timeout. SQLite still serializes concurrent writers.
class CollectionBackups{
 constructor({file,binary}){this.file=file;this.binary=binary;this.helper=null;this.status={running:false};}
 async run(kind,identity,file){
  if(this.helper)throw Error('A library backup operation is already running. Finish or cancel it first.');
  if(!['export','import'].includes(kind)||!path.isAbsolute(file))throw Error('Choose a backup file with the native file picker.');
  const helper=this.helper=new TabCollections({file:this.file,binary:this.binary,timeoutMs:0});this.status={running:true,kind,identity,started:Date.now()};
  const temporary=path.join(path.dirname(file),`.noxviola-${crypto.randomUUID()}.partial`);
  try{const result=await helper.request({op:`backup-${kind}`,identity,file,temporary,backup:crypto.randomUUID(),created:Date.now()});this.status={running:false,kind,result};return result;}
  catch(error){this.status={running:false,kind,error:error.message};throw error;}
  finally{helper.close();if(helper.child&&helper.child.exitCode===null&&helper.child.signalCode===null)await new Promise(resolve=>helper.child.once('exit',resolve));this.helper=null;}
 }
 cancel(){if(this.helper)this.helper.fail(Object.assign(Error('Backup operation canceled. No existing collection or backup was replaced. An import may already have committed; inspect the library before retrying (the same backup ID is not imported twice). Verify any completed export; interrupted .partial staging files may remain.'),{code:'BACKUP_CANCELED'}));}
}
module.exports={CollectionBackups};
