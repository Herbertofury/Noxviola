'use strict';

// Native Find results are asynchronous. A cleared/superseded request must not
// repaint the chrome with an obsolete match count, even on the same tab.
function createFindSession() {
  const requests = new WeakMap();
  return {
    search(contents, query, options) {
      requests.delete(contents);
      const requestId = contents.findInPage(query, options);
      requests.set(contents, requestId);
      return requestId;
    },
    clear(contents) {
      // Invalidate before native stop: even a reentrant result is obsolete.
      requests.delete(contents);
      contents.stopFindInPage('clearSelection');
    },
    accepts(contents, result) {
      return requests.has(contents) && requests.get(contents) === result.requestId;
    }
  };
}
module.exports = {createFindSession};
