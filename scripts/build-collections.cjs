'use strict';
const {execFileSync}=require('node:child_process');const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..');
execFileSync('cargo',['build','--release','--locked','--manifest-path',path.join(root,'native/tab-collections/Cargo.toml')],{stdio:'inherit'});
const name=process.platform==='win32'?'noxviola-tab-collections.exe':'noxviola-tab-collections';fs.mkdirSync(path.join(root,'browser/bin'),{recursive:true});const destination=path.join(root,'browser/bin',name),temporary=destination+'.build-'+process.pid;
try{fs.copyFileSync(path.join(root,'native/tab-collections/target/release',name),temporary);fs.renameSync(temporary,destination);}catch(error){try{fs.unlinkSync(temporary);}catch{}throw error;}
