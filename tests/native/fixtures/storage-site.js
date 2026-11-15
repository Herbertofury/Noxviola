'use strict';
async function openFixtureDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('noxviola-native-fixture', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('values');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}
async function readDatabase() {
  const db = await openFixtureDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('values', 'readonly');
      const request = tx.objectStore('values').get('identity');
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}
window.fixture = {
  async writeIdentity(value) {
    document.cookie = `noxviola_fixture=${encodeURIComponent(value)}; Path=/; SameSite=Strict`;
    localStorage.setItem('noxviola-fixture', value);
    const db = await openFixtureDatabase();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('values', 'readwrite');
        tx.objectStore('values').put(value, 'identity');
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
    const cache = await caches.open('noxviola-native-fixture');
    await cache.put('/cached-identity', new Response(value));
    await navigator.serviceWorker.register('/storage-worker.js');
    await navigator.serviceWorker.ready;
    return this.readIdentity();
  },
  async readIdentity() {
    const cached = await caches.match('/cached-identity');
    return {
      cookie: (await (await fetch('/echo-cookie')).json()).cookie,
      localStorage: localStorage.getItem('noxviola-fixture'),
      indexedDB: await readDatabase(),
      cache: cached ? await cached.text() : null,
      serviceWorkers: (await navigator.serviceWorker.getRegistrations()).length,
      privilegedBridge: typeof window.browser,
      nodeRequire: typeof require,
      nodeProcess: typeof process,
    };
  },
};
document.documentElement.dataset.fixtureReady = 'true';
