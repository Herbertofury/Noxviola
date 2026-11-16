'use strict';

// Native compositor observation for the separate real-package gate. The
// production browser never imports this module. A presented frame is stronger
// evidence than DOM load/rAF; it does not prove every later Viz copy will work.
function waitForPresentation(contents, {url, bounds, visible, scaleFactor = () => 1, timeout = 15_000}) {
  return new Promise((resolve, reject) => {
    let subscribed = false, settled = false, timer;
    const expected = {...bounds()}, density = scaleFactor();
    // Electron FrameSubscriber scales DIP view bounds by the native display
    // factor and emits a 1x bitmap. Page zoom/devicePixelRatio is not that factor.
    const pixels = {width: Math.round(expected.width * density), height: Math.round(expected.height * density)};
    function validTarget() {
      if (contents.isDestroyed() || contents.getURL() !== url || contents.isLoading() || !visible()) return false;
      const current = bounds();
      return current.width === expected.width && current.height === expected.height && expected.width > 0 && expected.height > 0 &&
        Number.isFinite(density) && density > 0 && scaleFactor() === density;
    }
    function finish(error, value) {
      if (settled) return;
      settled = true; clearTimeout(timer);
      contents.removeListener('destroyed', destroyed);
      contents.removeListener('render-process-gone', gone);
      contents.removeListener('did-start-navigation', navigation);
      if (subscribed) {
        try { contents.endFrameSubscription(); }
        catch (cleanupError) { error ||= cleanupError; }
      }
      if (error) reject(error); else resolve(value);
    }
    const destroyed = () => finish(new Error('The compositor target was destroyed before presentation.'));
    const gone = (_event, detail) => finish(new Error('The compositor renderer stopped before presentation: ' + detail?.reason));
    const navigation = details => { if (details.isMainFrame) finish(new Error('The document changed before compositor presentation.')); };
    try {
      if (!validTarget()) throw new Error('A visible, committed, loaded document with positive unchanged bounds is required for presentation.');
      contents.on('destroyed', destroyed); contents.on('render-process-gone', gone); contents.on('did-start-navigation', navigation);
      timer = setTimeout(() => finish(new Error('Timed out observing an actual full compositor frame; capturePage was not invoked.')), timeout);
      subscribed = true;
      contents.beginFrameSubscription(false, image => {
        if (settled) return;
        try {
          if (!validTarget()) throw new Error('The document or visible bounds changed during compositor observation.');
          if (image.isEmpty()) return;
          const size = image.getSize();
          if (size.width !== pixels.width || size.height !== pixels.height) return;
          finish(null, {webContentsId: contents.id, url, size, logicalSize: {width: expected.width, height: expected.height}, scaleFactor: density, fullFrame: true, method: 'beginFrameSubscription(false)'});
        } catch (error) { finish(error); }
      });
    } catch (error) { finish(error); }
  });
}

module.exports = {waitForPresentation};
