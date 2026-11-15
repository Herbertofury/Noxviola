'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const {DownloadManager, filename} = require('../browser/downloads.cjs');
class Item extends EventEmitter {
  constructor() { super(); this.path = ''; this.state = 'progressing'; this.paused = false; this.withinCallback = true; }
  getFilename() { return 'synthetic.txt'; } getURL() { return 'https://example.com/file'; }
  getTotalBytes() { return 100; } getReceivedBytes() { return 30; }
  getSavePath() { return this.path; } getState() { return this.state; }
  isPaused() { return this.paused; } canResume() { return this.paused; }
  setSaveDialogOptions(options) { assert.equal(this.withinCallback, true); this.options = options; }
  pause() { this.paused = true; this.emit('updated', {}, this.state); }
  resume() { this.paused = false; this.emit('updated', {}, this.state); }
  cancel() { this.state = 'cancelled'; this.emit('done', {}, this.state); }
}
test('native download destination is configured synchronously and actual item lifecycle is retained', async () => {
  const session = new EventEmitter(), revealed = [];
  const manager = new DownloadManager({directory:'/tmp/synthetic-downloads', reveal:file => revealed.push(file)});
  manager.attach(session, 'personal'); manager.attach(session, 'personal'); assert.equal(session.listenerCount('will-download'), 1);
  const item = new Item(); session.emit('will-download', {}, item); item.withinCallback = false;
  assert.ok(item.options.defaultPath.endsWith('synthetic.txt'));
  assert.equal(manager.list()[0].state, 'choosing-location');
  item.path = '/tmp/synthetic-downloads/chosen.txt'; item.emit('updated', {}, 'progressing');
  const id = manager.list()[0].id; manager.action(id, 'pause'); assert.equal(manager.list()[0].paused, true);
  manager.action(id, 'resume'); assert.equal(manager.list()[0].paused, false);
  item.emit('done', {}, 'completed'); assert.equal(manager.activeCount(), 0);
  manager.action(id, 'reveal'); assert.deepEqual(revealed, [item.path]);
  assert.throws(() => manager.action(id, 'resume'), /finished/); manager.dispose();
  assert.equal(session.listenerCount('will-download'), 0);
});
test('cancelled chooser is not reported as completed and arbitrary names cannot escape default directory', () => {
  const session = new EventEmitter(), manager = new DownloadManager({directory:'/tmp', reveal:()=>{}}); manager.attach(session, 'creator');
  const item = new Item(); session.emit('will-download', {}, item); manager.action(manager.list()[0].id, 'cancel');
  assert.equal(manager.list()[0].state, 'cancelled'); assert.equal(manager.list()[0].identity, 'creator');
  assert.throws(() => manager.action(manager.list()[0].id, 'reveal'), /completed/);
  assert.equal(filename('..'), 'download'); assert.equal(filename('..\\private.exe'), '.._private.exe');
});
test('resumable interruptions remain active; terminal interrupted items cannot resume', () => {
  const session = new EventEmitter(), manager = new DownloadManager({directory:'/tmp',reveal:()=>{}}); manager.attach(session,'personal');
  const item = new Item(); session.emit('will-download',{},item); item.path = '/tmp/example.txt'; item.paused = true;
  item.emit('updated',{},'interrupted'); assert.equal(manager.activeCount(),1); assert.equal(manager.list()[0].canResume,true);
  item.emit('done',{},'interrupted'); assert.equal(manager.activeCount(),0); assert.equal(manager.list()[0].canResume,false);
  assert.throws(()=>manager.action(manager.list()[0].id,'resume'),/finished/);
});
test('pause and immediate resume do not depend on an updated event; chooser setup failure is terminal', () => {
  const session = new EventEmitter(), manager = new DownloadManager({directory:'/tmp',reveal:()=>{}}); manager.attach(session,'personal');
  const item = new Item(); item.pause = () => {item.paused = true;}; item.resume = () => {item.paused = false;};
  session.emit('will-download',{},item); item.path = '/tmp/example.txt'; item.emit('updated',{},'progressing');
  const id = manager.list()[0].id; manager.action(id,'pause'); assert.equal(manager.list()[0].paused,true);
  manager.action(id,'resume'); assert.equal(manager.list()[0].paused,false); manager.action(id,'cancel');
  const failed = new Item(); failed.setSaveDialogOptions = () => {throw new Error('destination unavailable');};
  session.emit('will-download',{},failed); assert.equal(manager.activeCount(),0); assert.equal(manager.list()[1].terminal,true);
  assert.equal(manager.list()[1].error,'destination unavailable');
});
