'use strict';
const{test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {APP_FILES,stageApp,manifest}=require('../scripts/package-preview.cjs');
test('distribution allowlist excludes profiles, credentials, backlog and developer dependencies',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nox-package-test-'));try{const root=path.join(dir,'source'),out=path.join(dir,'app');fs.mkdirSync(root);for(const rel of APP_FILES){fs.mkdirSync(path.dirname(path.join(root,rel)),{recursive:true});fs.writeFileSync(path.join(root,rel),'fixture');}fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'test',productName:'Test',version:'0.1',main:'browser/main.cjs',license:'GPL-3.0-only',devDependencies:{electron:'44.4.5','@electron/packager':'20.3.0'}}));for(const name of ['private-accounts.json','browser-session.json','TODO.md','.env'])fs.writeFileSync(path.join(root,name),'NOT TO SHIP');stageApp(root,out,'a'.repeat(40));const paths=manifest(out).map(x=>x.path);for(const forbidden of ['private-accounts.json','browser-session.json','TODO.md','.env'])assert.ok(!paths.includes(forbidden));assert.equal(JSON.parse(fs.readFileSync(path.join(out,'package.json'))).devDependencies,undefined);assert.ok(fs.readFileSync(path.join(out,'package.json'),'utf8').endsWith('\n'));assert.match(fs.readFileSync(path.join(out,'BUILD.json'),'utf8'),/UNVERIFIED PREVIEW/);}finally{fs.rmSync(dir,{recursive:true,force:true});}});
test('manifest reports all regular package bytes and content hashes',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nox-manifest-'));try{fs.writeFileSync(path.join(dir,'one'),'abc');const files=manifest(dir);assert.equal(files[0].bytes,3);assert.equal(files[0].sha256,'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');}finally{fs.rmSync(dir,{recursive:true,force:true});}});

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
