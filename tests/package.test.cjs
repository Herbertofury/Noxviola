'use strict';
const{test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {APP_FILES,stageApp,manifest}=require('../scripts/package-preview.cjs');
test('distribution allowlist excludes profiles, credentials, backlog and developer dependencies',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nox-package-test-'));try{const root=path.join(dir,'source'),out=path.join(dir,'app');fs.mkdirSync(root);for(const rel of APP_FILES){fs.mkdirSync(path.dirname(path.join(root,rel)),{recursive:true});fs.writeFileSync(path.join(root,rel),'fixture');}fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'test',productName:'Test',version:'0.1',main:'browser/main.cjs',license:'GPL-3.0-only',devDependencies:{electron:'44.4.5','@electron/packager':'20.3.0'}}));for(const name of ['private-accounts.json','browser-session.json','TODO.md','.env'])fs.writeFileSync(path.join(root,name),'NOT TO SHIP');stageApp(root,out,'a'.repeat(40));const paths=manifest(out).map(x=>x.path);for(const forbidden of ['private-accounts.json','browser-session.json','TODO.md','.env'])assert.ok(!paths.includes(forbidden));assert.equal(JSON.parse(fs.readFileSync(path.join(out,'package.json'))).devDependencies,undefined);assert.ok(fs.readFileSync(path.join(out,'package.json'),'utf8').endsWith('\n'));assert.match(fs.readFileSync(path.join(out,'BUILD.json'),'utf8'),/UNVERIFIED PREVIEW/);}finally{fs.rmSync(dir,{recursive:true,force:true});}});
test('manifest reports all regular package bytes and content hashes',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nox-manifest-'));try{fs.writeFileSync(path.join(dir,'one'),'abc');const files=manifest(dir);assert.equal(files[0].bytes,3);assert.equal(files[0].sha256,'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');}finally{fs.rmSync(dir,{recursive:true,force:true});}});

test('dependency staging removes npm omitted-scope residue while preserving installed package contents', () => {
 const {removeEmptyDependencyScopes}=require('../scripts/package-preview.cjs');
 const modules=fs.mkdtempSync(path.join(os.tmpdir(),'nox-package-scopes-'));
 try {
  for(const directory of ['@electron','@types','@scope/installed/empty-assets','ordinary-empty'])fs.mkdirSync(path.join(modules,directory),{recursive:true});
  fs.writeFileSync(path.join(modules,'@scope','installed','package.json'),'production dependency bytes');
  const before=manifest(modules);
  assert.deepEqual(removeEmptyDependencyScopes(modules),['@electron','@types']);
  assert.deepEqual(manifest(modules),before,'Every production file and byte must be preserved');
  assert.equal(fs.existsSync(path.join(modules,'@scope','installed','empty-assets')),true);
  assert.equal(fs.existsSync(path.join(modules,'ordinary-empty')),true,'Unexpected ordinary directories remain subject to the archive gate');
  assert.deepEqual(removeEmptyDependencyScopes(modules),[]);
 } finally {fs.rmSync(modules,{recursive:true,force:true});}
});

test('every application require resolves to an allowlisted module, declared production dependency or built-in', () => {
 const root = path.resolve(__dirname, '..');
 const pkg = require('../package.json');
 const builtins = new Set(require('node:module').builtinModules.map(name => name.replace(/^node:/, '')));
 for (const source of APP_FILES.filter(name => name.endsWith('.cjs'))) {
  const code = fs.readFileSync(path.join(root, source), 'utf8');
  for (const match of code.matchAll(/require\(['"]([^'"]+)['"]\)/g)) {
   const dependency = match[1];
   if (dependency.startsWith('.')) {
    const target = path.relative(root, path.resolve(root, path.dirname(source), dependency)).split(path.sep).join('/');
    assert.ok(APP_FILES.includes(target), `${source} requires an omitted application module: ${target}`);
   } else if (dependency !== 'electron' && !builtins.has(dependency.replace(/^node:/, ''))) {
    const name = dependency.startsWith('@') ? dependency.split('/').slice(0, 2).join('/') : dependency.split('/')[0];
    assert.ok(pkg.dependencies?.[name], `${source} requires an undeclared production dependency: ${name}`);
   }
  }
 }
 assert.ok(!APP_FILES.some(name => name.startsWith('tests/') || name.startsWith('scripts/')));
});

test('preview cross-packaging selects an explicit target and rejects malformed targets', () => {
 const { packageTarget } = require('../scripts/package-preview.cjs');
 assert.deepEqual(packageTarget(['--platform', 'win32', '--arch', 'x64']), { platform: 'win32', arch: 'x64' });
 for (const args of [['--platform'], ['--platform', '../private'], ['--arch', 'all'], ['--overwrite'], ['--platform', '--arch', 'x64']]) {
  assert.throws(() => packageTarget(args), /Unknown|incomplete|Unsupported/);
 }
});

test('complete package verification rejects changed, omitted and additional runtime files', () => {
 const {verifyPackageFiles}=require('../scripts/package-preview.cjs');
 const crypto=require('node:crypto');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'nox-package-byte-proof-'));
 try {
  fs.writeFileSync(path.join(directory,'Noxviola'),'synthetic executable bytes, never run');
  const files=manifest(directory),applicationFiles=[];
  const record={commit:'b'.repeat(40),files,applicationFiles,totalBytes:files.reduce((sum,file)=>sum+file.bytes,0),applicationManifestSha256:crypto.createHash('sha256').update(JSON.stringify(applicationFiles)).digest('hex')};
  fs.writeFileSync(path.join(directory,'PACKAGE-MANIFEST.json'),JSON.stringify(record));
  assert.equal(verifyPackageFiles(directory).files.length,1);
  fs.writeFileSync(path.join(directory,'unlisted-profile.json'),'must not ship');
  assert.throws(()=>verifyPackageFiles(directory),/file set or bytes/);
  fs.unlinkSync(path.join(directory,'unlisted-profile.json'));
  fs.appendFileSync(path.join(directory,'Noxviola'),' modified');
  assert.throws(()=>verifyPackageFiles(directory),/file set or bytes/);
  fs.unlinkSync(path.join(directory,'Noxviola'));
  assert.throws(()=>verifyPackageFiles(directory),/file set or bytes/);
 } finally {fs.rmSync(directory,{recursive:true,force:true});}
});

test('actual ASAR verification binds production entry and every application byte to its source', async () => {
 const {verifyPackagedApplication}=require('../scripts/package-preview.cjs');
 const {createPackage}=await import('@electron/asar');
 const crypto=require('node:crypto');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'nox-package-asar-proof-'));
 try {
  const root=path.join(directory,'source'),stage=path.join(directory,'stage'),packaged=path.join(directory,'Noxviola-linux-x64');
  fs.mkdirSync(root);fs.mkdirSync(path.join(packaged,'resources'),{recursive:true});
  for(const name of APP_FILES){fs.mkdirSync(path.dirname(path.join(root,name)),{recursive:true});fs.writeFileSync(path.join(root,name),`Synthetic ${name}; never executed.`);}
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'fixture',version:'0.1.0',main:'browser/main.cjs',devDependencies:{electron:'44.11.3','@electron/packager':'20.3.0'}}));
  const info=stageApp(root,stage,'c'.repeat(40));
  const applicationFiles=manifest(stage),applicationManifestSha256=crypto.createHash('sha256').update(JSON.stringify(applicationFiles)).digest('hex');
  await createPackage(stage,path.join(packaged,'resources','app.asar'));
  fs.writeFileSync(path.join(packaged,'Noxviola'),'synthetic executable fixture; never run');
  const files=manifest(packaged);
  fs.writeFileSync(path.join(packaged,'PACKAGE-MANIFEST.json'),JSON.stringify({...info,platform:'linux',arch:'x64',applicationManifestSha256,applicationFiles,files,totalBytes:files.reduce((sum,file)=>sum+file.bytes,0)}));
  const result=await verifyPackagedApplication(packaged,{root});
  assert.equal(result.entry,'browser/main.cjs');
  assert.equal(result.executable,path.join(packaged,'Noxviola'));
  fs.appendFileSync(path.join(root,'browser','main.cjs'),' source changed');
  await assert.rejects(verifyPackagedApplication(packaged,{root}),/differs from the current acceptance source/);
  fs.writeFileSync(path.join(root,'browser','main.cjs'),'Synthetic browser/main.cjs; never executed.');
  const stagedPackage=JSON.parse(fs.readFileSync(path.join(stage,'package.json')));stagedPackage.main='tests/native/driver.cjs';
  fs.writeFileSync(path.join(stage,'package.json'),JSON.stringify(stagedPackage));
  await createPackage(stage,path.join(packaged,'resources','app.asar'));
  const alteredApplication=manifest(stage),alteredFiles=manifest(packaged).filter(file=>file.path!=='PACKAGE-MANIFEST.json');
  fs.writeFileSync(path.join(packaged,'PACKAGE-MANIFEST.json'),JSON.stringify({...info,platform:'linux',arch:'x64',applicationManifestSha256:crypto.createHash('sha256').update(JSON.stringify(alteredApplication)).digest('hex'),applicationFiles:alteredApplication,files:alteredFiles,totalBytes:alteredFiles.reduce((sum,file)=>sum+file.bytes,0)}));
  await assert.rejects(verifyPackagedApplication(packaged,{root}),/unchanged production package entry/);
 } finally {fs.rmSync(directory,{recursive:true,force:true});}
});
