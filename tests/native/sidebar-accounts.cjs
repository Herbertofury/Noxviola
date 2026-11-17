'use strict';
const assert = require('node:assert/strict');
const {performance} = require('node:perf_hooks');

async function until(fn, label) {
  const end = performance.now() + 15000; let last;
  while (performance.now() < end) {
    try { const value = await fn(); if (value) return value; } catch (error) { last = error; }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out observing ${label}${last ? `: ${last.message}` : ''}`);
}

async function exerciseSidebarAccounts({window, context, command, state, activate, partitionFor, check, expected}) {
  await check('account sidebar scopes synthetic metadata and routes through the correct native identity', async () => {
    await activate(expected.personalTab);
    const initial = await state(), saved = initial.preferences, origin = context.origin;
    const personalLabel = 'Synthetic sidebar personal account', workLabel = 'Synthetic sidebar work account';
    for (const [label, identity] of [[personalLabel, expected.personalIdentity], [workLabel, expected.secondIdentity]]) {
      await command('account-save', {label, handle:'synthetic', origin, identity, created:true, inPasswordManager:false});
    }
    await command('settings-save', {sidebarVisible:true, sidebarPanelPinned:true});
    if ((await state()).preferences.sidebarActive === 'accounts' && (await state()).preferences.sidebarExpanded) await command('sidebar-close');
    await until(() => window.webContents.executeJavaScript("Boolean(document.querySelector('[data-sidebar=accounts]'))"), 'account launcher control');
    await window.webContents.executeJavaScript("document.querySelector('[data-sidebar=accounts]').click()");
    await until(async () => (await state()).preferences.sidebarActive === 'accounts' && (await state()).preferences.sidebarExpanded, 'account sidebar');
    const personal = await command('sidebar-data');
    assert.equal(personal.identity, expected.personalIdentity); assert.equal(personal.status, 'ready');
    const personalItem = personal.items.find(item => item.label === personalLabel); assert.ok(personalItem);
    assert.ok(!personal.items.some(item => item.label === workLabel), 'Other identities must not appear in the sidebar');
    const markup = JSON.stringify(personalLabel);
    await until(() => window.webContents.executeJavaScript(`Boolean([...document.querySelectorAll('#sidebar-items button')].find(button=>button.textContent.includes(${markup})))`), 'account sidebar row');
    const previousIds = new Set((await state()).tabs.map(tab => tab.id));
    await window.webContents.executeJavaScript(`[...document.querySelectorAll('#sidebar-items button')].find(button=>button.textContent.includes(${markup})).click()`);
    const opened = await until(async () => {const current = await state();const tab = current.tabs.find(item => !previousIds.has(item.id) && item.identity === expected.personalIdentity && item.url === `${origin}/`);return tab || null;}, 'account opened in its assigned identity');
    await until(() => window.contentView.children.find(view => view.webContents && !view.webContents.isDestroyed() && view.webContents.session === partitionFor(expected.personalIdentity) && view.webContents.getURL() === `${origin}/`), 'account page using the personal identity session');
    await activate(expected.secondTab); const work = await command('sidebar-data');
    assert.equal(work.identity, expected.secondIdentity); assert.ok(!work.items.some(item => item.label === personalLabel));
    const workItem = work.items.find(item => item.label === workLabel); assert.ok(workItem);
    await assert.rejects(command('sidebar-account-open', {id:personalItem.id, identity:expected.personalIdentity}), /identity changed/i);
    assert.ok(!(await state()).tabs.some(tab => tab.id !== opened.id && !previousIds.has(tab.id)), 'A stale account click must not create another tab');
    await command('account-archive', personalItem.id); await command('account-archive', workItem.id);
    await command('close', opened.id); await command('settings-save', {sidebarVisible:saved.sidebarVisible,sidebarPanelPinned:saved.sidebarPanelPinned,sidebarExpanded:saved.sidebarExpanded,sidebarActive:saved.sidebarActive});
    await command('activate', initial.activeId);
  });
}

module.exports = {exerciseSidebarAccounts};
