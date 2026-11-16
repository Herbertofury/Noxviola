'use strict';
// Adapted from Enderloom src/tab-preview-host.js (GPL-3.0-only).
// Only transient captures from existing real WebContents are displayed.
const path = require('node:path');
const crypto = require('node:crypto');

function createTabPreview({WebContentsView, ipcMain, root, getWindow, getTabInfo, blocked = () => false}) {
  let view = null, loading = null, generation = 0n, shownId = '', anchor = null, pending = null;
  function hide() {
    generation++; shownId = ''; anchor = null; pending = null;
    if (view && !view.webContents.isDestroyed()) view.setVisible(false);
  }
  function invalidate(id) { if (shownId === id) hide(); }
  function layout() {
    const win = getWindow();
    if (!view || !shownId || !anchor || !win || win.isDestroyed() || win.isMinimized()) return;
    const [width, height] = win.getContentSize();
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return;
    const marginX = width > 16 ? 8 : 0, marginY = height > 16 ? 8 : 0;
    const w = Math.min(300, width - 2 * marginX), h = Math.min(220, height - 2 * marginY);
    const maxX = width - marginX - w, maxY = height - marginY - h;
    const clamp = (value, min, max) => Math.max(min, Math.min(Math.round(value), max));
    let x, y;
    if (anchor.orientation === 'vertical') {
      const right = anchor.x + anchor.width + 4;
      x = right <= maxX ? right : anchor.x - w - 4;
      y = anchor.y;
    } else {
      x = anchor.x + anchor.width / 2 - w / 2;
      const below = anchor.y + anchor.height + 4;
      y = below <= maxY ? below : anchor.y - h - 4;
    }
    view.setBounds({x:clamp(x,marginX,maxX),y:clamp(y,marginY,maxY),width:w,height:h});
  }
  function ensure(win) {
    if (view && !view.webContents.isDestroyed()) return;
    view = new WebContentsView({webPreferences:{preload:path.join(root,'tab-preview-preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});
    view.setBackgroundColor('#171122'); view.setVisible(false);
    view.webContents.setWindowOpenHandler(() => ({action:'deny'}));
    view.webContents.on('will-navigate', event => event.preventDefault());
    win.contentView.addChildView(view);
    loading = view.webContents.loadFile(path.join(root,'tab-preview.html'));
  }
  // Wait until the renderer has replaced its previous DOM state before reveal.
  // Authenticate both the exact renderer and a fresh token.
  function rendered(event, token) {
    if (!pending || event.sender !== pending.target.webContents || token !== pending.token ||
        pending.revision !== generation || pending.target !== view || pending.target.webContents.isDestroyed() || blocked()) return;
    const current = getTabInfo(shownId), win = getWindow();
    if (!current || current.identity !== pending.identity || current.url !== pending.url ||
        current.contents !== pending.contents || !win || win.isDestroyed() || win.isMinimized()) { hide(); return; }
    pending = null; layout(); view.setVisible(true); win.contentView.addChildView(view);
  }
  ipcMain.on('tab-preview-rendered', rendered);
  async function show(id, position) {
    const win = getWindow(), info = getTabInfo(id);
    if (!win || win.isDestroyed() || win.isMinimized() || !info || blocked() ||
        !['x','y','width','height'].every(key => Number.isFinite(position?.[key])) ||
        position.width <= 0 || position.height <= 0 || !['horizontal','vertical'].includes(position.orientation)) return;
    hide(); const revision = ++generation; shownId = id; anchor = {...position};
    ensure(win); const target = view;
    try { await loading; } catch {
      if (revision === generation) {
        hide();
        if (!target.webContents.isDestroyed()) {if (!win.isDestroyed()) win.contentView.removeChildView(target);target.webContents.close();}
        if (view === target) view = null;
      }
      return;
    }
    const current = getTabInfo(id);
    if (revision !== generation) return;
    if (target !== view || blocked() || !current || current.identity !== info.identity || current.contents !== info.contents || current.url !== info.url) {hide();return;}
    const wc = current.contents, url = wc && !wc.isDestroyed() ? wc.getURL() : '';
    let domain = ''; try { domain = new URL(current.url || url).hostname; } catch {}
    const canCapture = Boolean(wc && !wc.isDestroyed() && !wc.isLoading() && url && url === current.url);
    const token = crypto.randomUUID(); pending = {revision,target,token,identity:current.identity,url:current.url,contents:current.contents};
    target.webContents.send('tab-preview-data', {token,title:current.title,domain,image:'',pending:canCapture});
    if (!canCapture) return;
    try {
      const shot = await wc.capturePage(undefined,{stayHidden:true,stayAwake:false});
      const latest = getTabInfo(id);
      if (revision !== generation) return;
      if (shownId !== id || target !== view || wc.isDestroyed() || wc.getURL() !== url ||
          blocked() || !latest || latest.identity !== current.identity || latest.contents !== wc ||
          latest.url !== current.url) {hide();return;}
      if (shot.isEmpty()) throw new Error('Empty captured image');
      const image = shot.resize({width:568,quality:'good'}).toDataURL();
      if (typeof image !== 'string' || !image.startsWith('data:image/png;base64,')) throw new Error('Invalid captured image');
      target.webContents.send('tab-preview-data', {token,title:latest.title,domain,image,pending:false});
    } catch {
      if (revision === generation && shownId === id && target === view && !target.webContents.isDestroyed()) {
        target.webContents.send('tab-preview-data', {token,title:current.title,domain,image:'',pending:false});
      }
    }
  }
  function destroy() {
    hide(); ipcMain.removeListener('tab-preview-rendered', rendered);
    const win = getWindow();
    if (view && !view.webContents.isDestroyed()) {
      if (win && !win.isDestroyed()) win.contentView.removeChildView(view);
      view.webContents.close();
    }
    view = null;
  }
  return {show,hide,invalidate,layout,destroy};
}
module.exports = {createTabPreview};
