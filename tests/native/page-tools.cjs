'use strict';
// Actual source-app acceptance helper. Importing it has no side effects; only
// the explicit native driver invokes it. It is never shipped in the product.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { promisify } = require('node:util');
const execFile = promisify(require('node:child_process').execFile);
const { readContext } = require('../../scripts/native-smoke.cjs');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const QUERY = 'fixture';
const FIXTURE_TEXT = ['Local browser acceptance fixture', 'Only generated test data is used.', 'Next fixture', 'Download fixture'];

function fileEvidence(file, output) {
  const relative = path.relative(output, file);
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'Only this run\'s generated evidence files may be inspected');
  const stat = fs.lstatSync(file);
  assert.ok(stat.isFile() && !stat.isSymbolicLink(), 'A native export must produce an ordinary file');
  const bytes = fs.readFileSync(file);
  return { file: relative.split(path.sep).join('/'), bytes: bytes.length, sha256: sha256(bytes) };
}

async function inspectPDF(file) {
  const bytes = fs.readFileSync(file);
  assert.match(bytes.subarray(0, 16).toString('ascii'), /^%PDF-\d\.\d/, 'The actual printToPDF export must contain a PDF header');
  assert.match(bytes.subarray(-1024).toString('latin1'), /%%EOF\s*$/, 'The PDF export must be complete');
  const result = { header: bytes.subarray(0, 8).toString('ascii'), contentReadback: 'pending', tools: {} };
  for (const [tool, args] of [['pdfinfo', [file]], ['pdftotext', ['-layout', file, '-']]]) {
    try {
      const { stdout, stderr } = await execFile(tool, args, { encoding: 'utf8', timeout: 15_000, maxBuffer: 2 * 1024 * 1024,
        windowsHide: true, env: { ...process.env, LC_ALL: 'C' } });
      result.tools[tool] = { available: true, stdout, stderr };
    } catch (error) {
      if (error.code !== 'ENOENT') throw new Error(`${tool} failed to read the actual exported PDF: ${error.message}`);
      result.tools[tool] = { available: false, reason: 'Executable is not installed; retained PDF requires subsequent content readback.' };
    }
  }
  if (result.tools.pdfinfo.available) {
    const output = result.tools.pdfinfo.stdout;
    result.pages = Number(output.match(/^Pages:\s+(\d+)\s*$/m)?.[1]);
    assert.equal(result.pages, 1, 'The short generated document should print on one complete page');
    const dimensions = output.match(/^Page size:\s+([\d.]+) x ([\d.]+) pts/m);
    assert.ok(dimensions, 'The independent PDF reader must report real page dimensions');
    result.pageSizePoints = { width: Number(dimensions[1]), height: Number(dimensions[2]) };
    assert.ok(result.pageSizePoints.width > 0 && result.pageSizePoints.height > 0);
  }
  if (result.tools.pdftotext.available) {
    const text = result.tools.pdftotext.stdout.replace(/\s+/g, ' ');
    for (const expected of FIXTURE_TEXT) assert.ok(text.includes(expected), `The actual PDF must retain rendered document text: ${expected}`);
    result.textSha256 = sha256(Buffer.from(result.tools.pdftotext.stdout));
  }
  if (result.tools.pdfinfo.available && result.tools.pdftotext.available) result.contentReadback = 'text-and-page-structure-passed';
  result.visualReadback = 'pending; inspect the retained actual PDF with a document renderer, independently of Electron';
  return result;
}

async function until(predicate, description, timeout = 15_000) {
  const deadline = performance.now() + timeout;
  while (performance.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out observing ${description}; the product operation was invoked once and was not retried.`);
}

// Integration contract: supply the existing source driver's actual shell,
// marked context, trusted command/state/navigation helpers and check recorder.
// firstLaunch returns data to place in the normal restart-expectations file;
// afterRestart consumes that same data after a real normal close and relaunch.
function createPageTools({ window, context, command, state, navigate, activate, check, result }) {
  assert.ok(process.versions.electron, 'Page-tools acceptance requires actual Electron; Node contracts cannot claim execution');
  const { Menu, dialog, nativeImage } = require('electron');
  const marker = readContext(path.join(context.directory, 'config.json'));
  assert.equal(marker.token, context.token); assert.equal(marker.output, context.output);
  assert.ok(path.isAbsolute(context.output));
  for (const work of [command, state, navigate, activate, check]) assert.equal(typeof work, 'function');
  assert.equal(window.webContents.getLastWebPreferences().sandbox, true);
  const evidence = result.pageTools = {
    scope: 'Actual rendered find results, native per-identity zoom, production PDF and visible-page PNG exports, and real restart readback.',
    boundaries: ['The native save-picker response and Cancel replacement choice are supplied for generated destinations.',
      'Native menu handlers are invoked through the actual application Menu; physical OS menu/picker interaction is unverified.',
      'No hardware printer, system print dialog, arbitrary page fidelity or full PDF visual qualification is claimed.'],
    controls: [], find: {}, zoom: [], exports: [], preservedDestinations: [],
  };
  const outputDirectory = path.join(context.output, 'page-tools');
  const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `Actual native zoom ${actual} must equal ${expected}`);
  const frame = contents => contents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');

  async function observe() {
    await window.webContents.executeJavaScript(`(() => {
      if(window.__noxviolaPageTools)throw new Error('Duplicate page-tools observer');
      const value={notices:[],find:[],unsubscribe:[]};window.__noxviolaPageTools=value;
      value.unsubscribe.push(window.browser.onNotice(message=>value.notices.push(String(message))),window.browser.onFindResult(item=>value.find.push(item)));
    })()`);
  }
  async function dispose() {
    if (!window.isDestroyed()) await window.webContents.executeJavaScript('if(window.__noxviolaPageTools){for(const stop of window.__noxviolaPageTools.unsubscribe)stop();delete window.__noxviolaPageTools;}');
  }
  async function observations(kind) { return window.webContents.executeJavaScript(`window.__noxviolaPageTools[${JSON.stringify(kind)}]`); }
  async function click(selector) {
    await until(() => window.webContents.executeJavaScript(`(() => {
      const count=[...document.querySelectorAll(${JSON.stringify(selector)})].filter(item=>item.getClientRects().length&&!item.disabled).length;
      if(count>1)throw new Error('Ambiguous actual product control: '+${JSON.stringify(selector)});
      return count===1;
    })()`), `the actual product control ${selector}`);
    await window.webContents.executeJavaScript(`(() => {
      const items=[...document.querySelectorAll(${JSON.stringify(selector)})].filter(item=>item.getClientRects().length&&!item.disabled);
      if(items.length!==1)throw new Error('Expected exactly one visible enabled product control: '+${JSON.stringify(selector)});
      items[0].scrollIntoView({block:'nearest'});items[0].click();
    })()`);
    evidence.controls.push({ type: 'renderer-control', selector });
  }
  function menu(label) {
    const matches = [];
    function visit(items, parents = []) {
      for (const item of items) {
        if (item.label === label && item.enabled && item.visible) matches.push({ item, path: [...parents, label] });
        if (item.submenu) visit(item.submenu.items, [...parents, item.label]);
      }
    }
    const application = Menu.getApplicationMenu(); assert.ok(application, 'The production native application menu must exist');
    visit(application.items); assert.equal(matches.length, 1, `Exactly one actual enabled menu item is required: ${label}`);
    const selected = matches[0]; evidence.controls.push({ type: 'native-menu-handler', path: selected.path });
    // Pinned Electron menu-item.ts wraps the application callback and discards
    // its return value. Observe the actual notice/result, never await click().
    selected.item.click({}, window, window.webContents);
  }
  async function menuWithNotice(label, expected) {
    const start = (await observations('notices')).length;
    menu(label);
    return until(async () => {
      const messages = (await observations('notices')).slice(start);
      if (!messages.length) return null;
      assert.ok(messages.some(message => expected.test(message)), `Actual ${label} handler reported: ${messages.join('; ')}`);
      return messages;
    }, `${label} result from the product`);
  }
  async function zoomSample(view, stage) {
    const current = await state(), tab = current.tabs.find(item => item.id === current.activeId);
    await frame(view.webContents);
    const viewport = await view.webContents.executeJavaScript('({url:location.href,width:innerWidth,height:innerHeight,devicePixelRatio,scrollX,scrollY})');
    const value = { stage, tabId: tab.id, identity: tab.identity, origin: new URL(viewport.url).origin, factor: view.webContents.getZoomFactor(), viewport };
    evidence.zoom.push(value); return value;
  }
  async function preserveExports(expected) {
    for (const record of [...expected.exports, ...expected.preservedDestinations]) {
      const file = path.join(context.output, record.file);
      assert.deepEqual(fileEvidence(file, context.output), { file: record.file, bytes: record.bytes, sha256: record.sha256 }, 'Actual exported/sentinel bytes must remain unchanged through later actions and restart');
    }
  }
  async function visiblePage(view) {
    await until(() => {
      assert.ok(!view.webContents.isDestroyed(), 'The selected actual page must still exist');
      const bounds = view.getBounds();
      return view.getVisible() && bounds.width > 0 && bounds.height > 0;
    }, 'the selected actual page becoming visible after the Tools panel closes');
    await frame(view.webContents);
  }
  async function exportThroughProduct(kind, destination, canceledReplacement = false, page = null) {
    const originalSave = dialog.showSaveDialog, originalMessage = dialog.showMessageBox;
    const title = kind === 'pdf' ? 'Save page as PDF' : 'Save visible page screenshot';
    const calls = { save: [], confirmation: [] }, start = (await observations('notices')).length;
    dialog.showSaveDialog = async (owner, options) => {
      assert.equal(owner, window); assert.equal(options.title, title); assert.equal(calls.save.length, 0);
      calls.save.push({ title: options.title, defaultPath: options.defaultPath, filters: options.filters, destination: path.relative(context.output, destination).split(path.sep).join('/') });
      return { canceled: false, filePath: destination };
    };
    dialog.showMessageBox = async (owner, options) => {
      assert.ok(canceledReplacement, 'A fresh export must not require replacement'); assert.equal(owner, window);
      assert.equal(options.message, 'Replace the selected file?'); assert.equal(options.detail, destination);
      assert.deepEqual(options.buttons, ['Cancel', 'Replace']); assert.equal(options.defaultId, 0);
      calls.confirmation.push({ message: options.message, buttons: options.buttons, response: 0 });
      return { response: 0, checkboxChecked: false };
    };
    try {
      if (kind === 'pdf') { await command('tools'); await click('#tools button[data-command="save-pdf"]'); }
      else { assert.ok(page, 'A visible-page screenshot must bind its actual WebContentsView'); await visiblePage(page); menu('Save visible screenshot'); }
      if (canceledReplacement) {
        await until(() => calls.confirmation.length === 1, 'the actual existing-file confirmation');
        // A normal IPC observation follows the completed dialog response; there
        // is no test-only storage flush or delayed retry. End-of-run/restart
        // digest readback below also catches any later accidental overwrite.
        await state();
      } else {
        const expected = `Page ${kind === 'pdf' ? 'PDF' : 'screenshot'} saved to the selected local file.`;
        await until(async () => {
          const messages = (await observations('notices')).slice(start);
          if (!messages.length) return false;
          assert.ok(messages.includes(expected), `The actual export handler reported: ${messages.join('; ')}`);
          return true;
        }, `completed ${kind} export and durable native save notice`, 30_000);
      }
      assert.equal(calls.save.length, 1); assert.equal(calls.confirmation.length, canceledReplacement ? 1 : 0);
      return calls;
    } finally {
      dialog.showSaveDialog = originalSave; dialog.showMessageBox = originalMessage;
      if ((await state()).panel) await command('panel-close');
    }
  }

  async function firstLaunch({ personalTab, personalIdentity, secondTab, secondIdentity }) {
    fs.mkdirSync(outputDirectory);
    await observe();
    try {
      let view = await activate(personalTab);
      view = await navigate(`${context.origin}/page?pageTools=find`);
      await menuWithNotice('Reset zoom', /^Page zoom: 100%\.$/); close(view.webContents.getZoomFactor(), 1);
      await check('actual find input, next, previous and clear render the correct native match results', async () => {
        const text = await view.webContents.executeJavaScript('document.body.innerText');
        for (const expected of FIXTURE_TEXT) assert.ok(text.includes(expected));
        assert.equal((text.match(/fixture/gi) || []).length, 3, 'This fixture must contain three real rendered matches');
        await frame(view.webContents);
        const before = (await view.webContents.capturePage()).toBitmap();
        const nativeEvents = []; evidence.find.nativeEvents = nativeEvents;
        const listener = (_event, value) => nativeEvents.push(value);
        view.webContents.on('found-in-page', listener);
        try {
          await click('#find-toggle');
          for (const [action, ordinal] of [['input', 1], ['next', 2], ['previous', 1]]) {
            const start = nativeEvents.length;
            if (action === 'input') await window.webContents.executeJavaScript(`(() => {const input=document.getElementById('find');if(input.disabled||!input.getClientRects().length)throw new Error('The actual find input must be visible and enabled');input.focus();input.value=${JSON.stringify(QUERY)};input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
            else await click(`#find-${action}`);
            const found = await until(() => nativeEvents.slice(start).find(item => item.finalUpdate && item.matches === 3 && item.activeMatchOrdinal === ordinal), `native find ${action} ordinal ${ordinal}`);
            assert.ok(found.selectionArea.width > 0 && found.selectionArea.height > 0, 'The native match must have a rendered selection rectangle');
            await until(() => window.webContents.executeJavaScript(`(() => {const counter=document.getElementById('find-count');return Boolean(counter.getClientRects().length)&&counter.textContent===${JSON.stringify(`${ordinal}/3`)};})()`), 'the actual visible match counter');
            if (action === 'input') {
              await frame(view.webContents);
              const file = path.join(outputDirectory, 'actual-find-selection.png');
              fs.writeFileSync(file, (await view.webContents.capturePage()).toPNG(), { flag: 'wx', mode: 0o600 });
              evidence.find.screenshot = fileEvidence(file, context.output);
            }
          }
          const start = (await observations('find')).length;
          await window.webContents.executeJavaScript("document.getElementById('find').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
          await until(async () => (await observations('find')).slice(start).some(item => item.matches === 0), 'the real clear-result notification');
          assert.deepEqual(await window.webContents.executeJavaScript("({query:document.getElementById('find').value,count:document.getElementById('find-count').textContent})"), { query: '', count: '' });
          await frame(view.webContents);
          const cleared = (await view.webContents.capturePage()).toBitmap();
          assert.deepEqual(cleared, before, 'Clearing find must remove its actual rendered page highlighting');
          evidence.find.clearedPixelsSha256 = sha256(cleared);
        } finally { view.webContents.removeListener('found-in-page', listener); }
      });
      await check('real page PDF and visible PNG controls export complete files and preserve declined existing destinations', async () => {
        const pdf = path.join(outputDirectory, 'actual-page.pdf'); assert.equal(fs.existsSync(pdf), false);
        const pdfDialogs = await exportThroughProduct('pdf', pdf);
        evidence.exports.push({ ...fileEvidence(pdf, context.output), kind: 'pdf', dialogs: pdfDialogs, readback: await inspectPDF(pdf) });
        await visiblePage(view);
        const reference = nativeImage.createFromBuffer((await view.webContents.capturePage()).toPNG());
        const png = path.join(outputDirectory, 'actual-visible-page.png'); assert.equal(fs.existsSync(png), false);
        const pngDialogs = await exportThroughProduct('png', png, false, view);
        const bytes = fs.readFileSync(png);
        assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
        const image = nativeImage.createFromBuffer(bytes); assert.equal(image.isEmpty(), false, 'The actual PNG must decode');
        assert.deepEqual(image.getSize(), reference.getSize(), 'The exported PNG must cover the actual visible page dimensions');
        assert.deepEqual(image.toBitmap(), reference.toBitmap(), 'The export must preserve the actual visible page pixels');
        evidence.exports.push({ ...fileEvidence(png, context.output), kind: 'png', dialogs: pngDialogs, dimensions: image.getSize(), viewBounds: view.getBounds(), pixelsSha256: sha256(image.toBitmap()) });
        for (const kind of ['pdf', 'png']) {
          const destination = path.join(outputDirectory, `existing-destination.${kind}`);
          fs.writeFileSync(destination, `Generated no-overwrite sentinel ${context.token}\n`, { flag: 'wx', mode: 0o600 });
          const before = fileEvidence(destination, context.output);
          const dialogs = await exportThroughProduct(kind, destination, true, view);
          assert.deepEqual(fileEvidence(destination, context.output), before, 'Canceling actual replacement must leave the existing bytes unchanged');
          evidence.preservedDestinations.push({ ...before, dialogs });
        }
      });
      await check('actual origin zoom changes viewport scale, remains isolated by identity and survives same-origin navigation', async () => {
        const baseline = await zoomSample(view, 'baseline'); close(baseline.factor, 1);
        await menuWithNotice('Zoom in', /^Page zoom: \d+%\.$/);
        const enlarged = await zoomSample(view, 'zoom-in'); assert.ok(enlarged.factor > baseline.factor); assert.ok(enlarged.viewport.width < baseline.viewport.width);
        await menuWithNotice('Zoom out', /^Page zoom: \d+%\.$/); close((await zoomSample(view, 'zoom-out')).factor, baseline.factor);
        await menuWithNotice('Zoom in', /^Page zoom: \d+%\.$/);
        await menuWithNotice('Reset zoom', /^Page zoom: 100%\.$/); close((await zoomSample(view, 'reset')).factor, 1);
        await menuWithNotice('Zoom in', /^Page zoom: \d+%\.$/);
        const persistent = await zoomSample(view, 'choice-to-persist'); assert.ok(persistent.factor > 1);
        view = await navigate(`${context.origin}/page?pageTools=same-origin`);
        close((await zoomSample(view, 'same-origin-new-document')).factor, persistent.factor);
        const other = await activate(secondTab); const isolated = await zoomSample(other, 'other-identity');
        assert.equal(isolated.identity, secondIdentity); assert.notEqual(other.webContents.session, view.webContents.session); close(isolated.factor, 1);
        view = await activate(personalTab); const selected = await zoomSample(view, 'selected-again');
        assert.equal(selected.identity, personalIdentity); close(selected.factor, persistent.factor);
      });
      await preserveExports(evidence);
      const current = await state(), selected = current.tabs.find(item => item.id === personalTab);
      return { schema: 1, fixtureToken: context.token, origin: context.origin, personalTab, personalIdentity, secondTab, secondIdentity,
        url: selected.url, zoomFactor: view.webContents.getZoomFactor(), exports: evidence.exports, preservedDestinations: evidence.preservedDestinations };
    } finally { await dispose(); }
  }
  async function afterRestart(expected) {
    assert.equal(expected.schema, 1); assert.equal(expected.fixtureToken, context.token); assert.equal(expected.origin, context.origin);
    assert.ok(expected.zoomFactor > 1 && expected.zoomFactor <= 5);
    await observe();
    try {
      await check('actual origin zoom and exported bytes survive a normal process restart', async () => {
        const view = await activate(expected.personalTab), actual = await zoomSample(view, 'after-real-restart');
        assert.equal(actual.identity, expected.personalIdentity); assert.equal(actual.origin, expected.origin); assert.equal(actual.viewport.url, expected.url);
        close(actual.factor, expected.zoomFactor);
        const other = await activate(expected.secondTab), isolated = await zoomSample(other, 'other-identity-after-restart');
        assert.equal(isolated.identity, expected.secondIdentity); close(isolated.factor, 1);
        await activate(expected.personalTab);
        await preserveExports(expected);
        evidence.exports = expected.exports; evidence.preservedDestinations = expected.preservedDestinations;
        evidence.restartReadback = { preserved: true, expectedZoom: expected.zoomFactor, actualZoom: actual.factor };
      });
    } finally { await dispose(); }
  }
  return { firstLaunch, afterRestart };
}

module.exports = { createPageTools, inspectPDF };
