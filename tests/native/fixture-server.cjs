'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const DOWNLOAD = Buffer.from('Noxviola synthetic download. No private data.\n'.repeat(2048));
function createFixtureServer() {
  const requests = [];
  const sockets = new Set();
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    requests.push({ method: request.method, path: url.pathname });
    response.setHeader('Cache-Control', 'no-store');
    if (url.pathname === '/echo-cookie') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ cookie: request.headers.cookie || '' }));
    } else if (['/storage-site.js', '/storage-worker.js'].includes(url.pathname)) {
      response.setHeader('Content-Type', 'text/javascript');
      response.end(fs.readFileSync(path.join(__dirname, 'fixtures', url.pathname.slice(1))));
    } else if (url.pathname === '/redirect') {
      response.writeHead(302, { Location: '/page?redirected=1' });
      response.end();
    } else if (url.pathname === '/download' || url.pathname === '/slow-download') {
      response.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename="noxviola-fixture.txt"',
        'Content-Length': DOWNLOAD.length,
      });
      if (url.pathname === '/download') response.end(DOWNLOAD);
      else {
        let position = 0;
        const timer = setInterval(() => {
          const end = Math.min(position + 1024, DOWNLOAD.length);
          response.write(DOWNLOAD.subarray(position, end));
          position = end;
          if (position === DOWNLOAD.length) { clearInterval(timer); response.end(); }
        }, 25);
        response.once('close', () => clearInterval(timer));
      }
    } else if (url.pathname === '/page' || url.pathname === '/') {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'");
      response.end('<!doctype html><html><head><meta charset="utf-8"><title>Noxviola synthetic fixture</title></head><body><h1>Local browser acceptance fixture</h1><p>Only generated test data is used.</p><a id="next" href="/page?next=1">Next fixture</a><a id="download" href="/download">Download fixture</a><script src="/storage-site.js"></script></body></html>');
    } else { response.writeHead(404); response.end('Fixture route not found'); }
  });
  server.on('connection', socket => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  return {
    requests,
    async listen() {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
      return `http://127.0.0.1:${server.address().port}`;
    },
    async close() {
      for (const socket of sockets) socket.destroy();
      if (server.listening) await new Promise(resolve => server.close(resolve));
    },
  };
}
module.exports = { createFixtureServer, DOWNLOAD };
