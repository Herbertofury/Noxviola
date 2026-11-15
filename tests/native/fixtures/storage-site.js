'use strict';
async function storageStep(step, action) {
  window.fixture.lastStep = step;
  try { return await action(); }
  catch (error) {
    const detail = {
      step, name: String(error?.name || typeof error),
      message: String(error?.message || error), stack: String(error?.stack || ''),
      code: typeof error?.code === 'number' ? error.code : null,
    };
    window.fixture.lastFailure = detail;
    // DOMException/Event objects can lose their properties across Electron's
    // executeJavaScript boundary. Preserve the original fields and throw an Error.
    throw new Error(`${step}: ${detail.name}: ${detail.message}`);
  }
}
async function openFixtureDatabase() {
  return storageStep('indexedDB.open', () => new Promise((resolve, reject) => {
    const request = indexedDB.open('noxviola-native-fixture', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('values');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  }));
}
async function readDatabase() {
  const db = await openFixtureDatabase();
  try {
    return await storageStep('indexedDB.read', () => new Promise((resolve, reject) => {
      const tx = db.transaction('values', 'readonly');
      const request = tx.objectStore('values').get('identity');
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    }));
  } finally { db.close(); }
}
window.fixture = {
  lastStep: null,
  lastFailure: null,
  async writeIdentity(value) {
    this.lastFailure = null;
    await storageStep('cookie.write', () => { document.cookie = `noxviola_fixture=${encodeURIComponent(value)}; Path=/; SameSite=Strict`; });
    await storageStep('localStorage.write', () => localStorage.setItem('noxviola-fixture', value));
    const db = await openFixtureDatabase();
    try {
      await storageStep('indexedDB.write', () => new Promise((resolve, reject) => {
        const tx = db.transaction('values', 'readwrite');
        tx.objectStore('values').put(value, 'identity');
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }));
    } finally { db.close(); }
    const cache = await storageStep('cacheStorage.open', () => caches.open('noxviola-native-fixture'));
    await storageStep('cacheStorage.write', () => cache.put('/cached-identity', new Response(value)));
    await storageStep('serviceWorker.register', () => navigator.serviceWorker.register('/storage-worker.js'));
    await storageStep('serviceWorker.ready', () => navigator.serviceWorker.ready);
    return this.readIdentity();
  },
  async readIdentity() {
    this.lastFailure = null;
    const cached = await storageStep('cacheStorage.match', () => caches.match('/cached-identity'));
    return {
      cookie: await storageStep('cookie.read-server-echo', async () => (await (await fetch('/echo-cookie')).json()).cookie),
      localStorage: await storageStep('localStorage.read', () => localStorage.getItem('noxviola-fixture')),
      indexedDB: await readDatabase(),
      cache: cached ? await storageStep('cacheStorage.read', () => cached.text()) : null,
      serviceWorkers: await storageStep('serviceWorker.getRegistrations', async () => (await navigator.serviceWorker.getRegistrations()).length),
      privilegedBridge: typeof window.browser,
      nodeRequire: typeof require,
      nodeProcess: typeof process,
    };
  },
};
document.documentElement.dataset.fixtureReady = 'true';
