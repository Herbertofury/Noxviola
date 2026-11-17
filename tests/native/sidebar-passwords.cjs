'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const username='fixture-login-identity';
const password='fixture-generated-password-788321';
const installForm=`(() => {
  const form=document.createElement('form');
  form.id='nox-login-fixture';
  form.innerHTML='<input type="email" autocomplete="section-test username"><input type="password" autocomplete="section-test current-password"><button>Sign in</button>';
  form.addEventListener('submit',event=>{event.preventDefault();form.dataset.submitted='true';});
  document.body.prepend(form);
  return true;
})()`;
function readForm(contents) {
  return contents.executeJavaScript(`(() => {
    const form=document.querySelector('#nox-login-fixture');
    return {username:form.elements[0].value,password:form.elements[1].value,submitted:form.dataset.submitted||null};
  })()`);
}
async function exercisePasswords({activate,command,context,expected,window,check,until}) {
  if(process.platform!=='win32')return;
  await check('Windows password sidebar saves encrypted sign-in fields and fills only the exact site and identity',async()=>{
    const view=await activate(expected.personalTab);
    const identity=expected.personalIdentity;
    assert.equal((await command('password-list')).locked,true);
    await view.webContents.executeJavaScript(installForm);
    await view.webContents.executeJavaScript(`(()=>{const f=document.querySelector('#nox-login-fixture');f.elements[0].value=${JSON.stringify(username)};f.elements[1].value=${JSON.stringify(password)};return true;})()`);
    await command('sidebar-select','passwords');
    const click=async label=>{await until(()=>window.webContents.executeJavaScript(`(() => {
      const control=[...document.querySelectorAll('#sidebar-services button')].find(button=>button.textContent===${JSON.stringify(label)}&&!button.disabled);
      if(!control)return false;
      control.click();
      return true;
    })()`),`password sidebar control ${label}`);};
    await click('Unlock passwords');
    await until(async()=>!(await command('password-list')).locked,'unlocked Windows password store');
    await click('Read sign-in fields from page');
    await until(()=>window.webContents.executeJavaScript("Boolean(document.querySelector('#password-save-form input[type=password]')?.value)"),'a password draft populated from the active page');
    await click('Save password');
    const item=await until(async()=>(await command('password-list')).items[0],'encrypted password saved through the sidebar');
    assert.equal(item.origin,context.origin);assert.equal(item.username,username);assert.equal(Object.hasOwn(item,'password'),false);
    const bytes=fs.readFileSync(path.join(context.profile,'browser-passwords.encrypted.json'),'utf8');
    const envelope=JSON.parse(bytes);
    assert.equal(envelope.api,'async');
    assert.ok(envelope.ciphertext.length>0);
    for(const secret of [password,username,context.origin])assert.equal(bytes.includes(secret),false);
    await view.webContents.executeJavaScript("document.querySelector('#nox-login-fixture').reset();true");
    await click('Fill');
    await until(async()=>(await readForm(view.webContents)).password===password,'the actual login inputs fill');
    assert.deepEqual(await readForm(view.webContents),{username,password,submitted:null});
    await view.webContents.executeJavaScript("(()=>{const f=document.querySelector('#nox-login-fixture');f.reset();f.elements[1].autocomplete='section-signup new-password';return true;})()");
    await assert.rejects(command('password-fill',{identity,id:item.id}),/sign-in password field/);
    assert.equal((await readForm(view.webContents)).password,'');
    const other=await command('password-save',{identity,origin:'https://different.example',username,password});
    await assert.rejects(command('password-fill',{identity,id:other.id}),/different|origin/i);
    await command('password-remove',{identity,id:other.id});
    await activate(expected.secondTab);
    assert.deepEqual((await command('password-list')).items,[]);
    await assert.rejects(command('password-fill',{identity:expected.secondIdentity,id:item.id}),/not found|identity|unavailable/i);
    await activate(expected.personalTab);
    await command('password-lock');
    await assert.rejects(command('password-fill',{identity,id:item.id}),/unlock/i);
    await view.webContents.executeJavaScript("document.querySelector('#nox-login-fixture').remove();true");
    await command('sidebar-close');
    expected.passwordFixtureId=item.id;
  });
}
async function verifyPasswordsAfterRestart({activate,command,expected,check}) {
  if(!expected.passwordFixtureId)return;
  await check('Windows encrypted passwords unlock and fill after a real process restart',async()=>{
    const view=await activate(expected.personalTab);
    const identity=expected.personalIdentity,id=expected.passwordFixtureId;
    assert.equal((await command('password-list')).locked,true);
    await command('password-unlock');
    assert.equal((await command('password-list')).items[0].id,id);
    await view.webContents.executeJavaScript(installForm);
    await command('password-fill',{identity,id});
    assert.deepEqual(await readForm(view.webContents),{username,password,submitted:null});
    await command('password-remove',{identity,id});
    assert.equal((await command('password-list')).items.length,0);
    await command('password-lock');
    await view.webContents.executeJavaScript("document.querySelector('#nox-login-fixture').remove();true");
  });
}
module.exports={exercisePasswords,verifyPasswordsAfterRestart};
