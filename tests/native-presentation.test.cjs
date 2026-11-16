'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const {waitForPresentation} = require('./native/presentation.cjs');

function fixture() {
  const rectangle = {x: 0, y: 0, width: 800, height: 500};
  const contents = Object.assign(new EventEmitter(), {id: 12, address: 'http://127.0.0.1/light', destroyed: false,
    starts: 0, ends: 0, isLoading: () => false, isDestroyed() {return this.destroyed;}, getURL() {return this.address;},
    beginFrameSubscription(onlyDirty, callback) {assert.equal(onlyDirty, false); this.starts++; this.callback = callback;},
    endFrameSubscription() {this.ends++;},
  });
  const options = {url: contents.address, bounds: () => rectangle, visible: () => true};
  const frame = (width = 800, height = 500, empty = false) => ({isEmpty: () => empty, getSize: () => ({width, height})});
  return {contents, options, rectangle, frame};
}
test('native presentation gate requires one actual full matching frame and always ends observation', async () => {
  const f = fixture(); let completed = false;
  const pending = waitForPresentation(f.contents, f.options).then(value => {completed = true; return value;});
  f.contents.callback(f.frame(800, 500, true)); f.contents.callback(f.frame(1, 1));
  await Promise.resolve(); assert.equal(completed, false); assert.equal(f.contents.ends, 0);
  f.contents.callback(f.frame());
  assert.deepEqual(await pending, {webContentsId: 12, url: f.options.url, size: {width: 800, height: 500}, logicalSize: {width: 800, height: 500}, scaleFactor: 1, fullFrame: true, method: 'beginFrameSubscription(false)'});
  assert.equal(f.contents.starts, 1); assert.equal(f.contents.ends, 1); assert.equal(f.contents.eventNames().length, 0);
});
test('native presentation uses physical display scaling rather than logical bounds or page zoom', async () => {
  const f = fixture(); let completed = false;
  const pending = waitForPresentation(f.contents, {...f.options, scaleFactor: () => 1.25}).then(value => {completed = true; return value;});
  f.contents.callback(f.frame()); await Promise.resolve(); assert.equal(completed, false);
  f.contents.callback(f.frame(1000, 625)); const value = await pending;
  assert.deepEqual(value.size, {width: 1000, height: 625}); assert.equal(value.scaleFactor, 1.25); assert.equal(f.contents.ends, 1);
});
test('native presentation rejects navigation, renderer loss, destruction and missing frames without retries', async () => {
  for (const failure of ['navigate', 'crash', 'destroy', 'timeout', 'size', 'begin']) {
    const f = fixture();
    if (failure === 'begin') f.contents.beginFrameSubscription = () => {throw new Error('Native subscription failed');};
    const pending = waitForPresentation(f.contents, {...f.options, timeout: 10});
    if (failure === 'navigate') f.contents.emit('did-start-navigation', {isMainFrame: true});
    if (failure === 'crash') f.contents.emit('render-process-gone', {}, {reason: 'crashed'});
    if (failure === 'destroy') {f.contents.destroyed = true; f.contents.emit('destroyed');}
    if (failure === 'size') {f.rectangle.width = 900; f.contents.callback(f.frame());}
    await assert.rejects(pending, /changed|stopped|destroyed|Timed out|subscription failed/);
    assert.equal(f.contents.ends, 1, failure); assert.equal(f.contents.eventNames().length, 0, failure);
    assert.ok(f.contents.starts <= 1);
  }
});
