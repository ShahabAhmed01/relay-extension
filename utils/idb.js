/**
 * Relay v2 — Minimal promise wrapper over IndexedDB.
 *
 * Runs in: background service worker, extension pages, and unit tests
 * (via fake-indexeddb). Content scripts never touch this directly —
 * they message the background, which owns the archive connection.
 *
 * Design notes:
 *  - Service workers can be suspended at any time; openDB() re-opens
 *    lazily and stale connections are detected and replaced.
 *  - Every helper resolves a single transaction so callers get
 *    atomicity guarantees from IndexedDB itself.
 */

var RelayIDB = (function () {
  'use strict';

  var DB_NAME = 'relay-archive';
  var DB_VERSION = 1;
  var _db = null;
  var _opening = null;

  function idb() {
    // In browsers: global indexedDB. In tests: fake-indexeddb injected global.
    return typeof indexedDB !== 'undefined' ? indexedDB : null;
  }

  function isStale(db) {
    try { return !db || db.closed_ === true; } catch (_e) { return false; }
  }

  function openDB() {
    if (_db && !isStale(_db)) return Promise.resolve(_db);
    if (_opening) return _opening;
    var factory = idb();
    if (!factory) return Promise.reject(new Error('IndexedDB unavailable'));
    _opening = new Promise(function (resolve, reject) {
      var req;
      try { req = factory.open(DB_NAME, DB_VERSION); } catch (e) { reject(e); return; }
      req.onupgradeneeded = function (event) {
        var db = req.result;
        if (event.oldVersion < 1) {
          var conversations = db.createObjectStore('conversations', { keyPath: 'id' });
          conversations.createIndex('byUpdated', 'updatedAt');
          conversations.createIndex('byPlatform', 'platformId');

          var messages = db.createObjectStore('messages', { keyPath: 'id' });
          messages.createIndex('byConversationSeq', ['conversationId', 'seq']);
          messages.createIndex('byConversation', 'conversationId');

          var attachments = db.createObjectStore('attachments', { keyPath: 'id' });
          attachments.createIndex('byConversation', 'conversationId');
          attachments.createIndex('byMessage', 'messageId');

          var transfers = db.createObjectStore('transfers', { keyPath: 'id' });
          transfers.createIndex('byUpdated', 'updatedAt');
        }
      };
      req.onsuccess = function () {
        _db = req.result;
        _db.onversionchange = function () { try { _db.close(); } catch (_e) {} _db = null; };
        _db.onerror = null;
        resolve(_db);
      };
      req.onerror = function () { reject(req.error || new Error('IndexedDB open failed')); };
      req.onblocked = function () { /* another tab holds an older version; keep waiting */ };
    });
    _opening.then(function () { _opening = null; }, function () { _opening = null; });
    return _opening;
  }

  function tx(storeNames, mode) {
    return openDB().then(function (db) {
      try {
        return db.transaction(storeNames, mode);
      } catch (e) {
        // Stale connection after SW restart — force reopen once.
        _db = null;
        return openDB().then(function (db2) { return db2.transaction(storeNames, mode); });
      }
    });
  }

  function reqToPromise(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error('IDB request failed')); };
    });
  }

  function put(storeName, value) {
    return tx(storeName, 'readwrite').then(function (t) {
      return reqToPromise(t.objectStore(storeName).put(value)).then(function (r) {
        return { result: r, transaction: t };
      });
    });
  }

  function get(storeName, key) {
    return tx(storeName, 'readonly').then(function (t) {
      return reqToPromise(t.objectStore(storeName).get(key));
    });
  }

  function getAll(storeName) {
    return tx(storeName, 'readonly').then(function (t) {
      return reqToPromise(t.objectStore(storeName).getAll());
    });
  }

  function deleteKey(storeName, key) {
    return tx(storeName, 'readwrite').then(function (t) {
      return reqToPromise(t.objectStore(storeName).delete(key));
    });
  }

  function clearStore(storeName) {
    return tx(storeName, 'readwrite').then(function (t) {
      return reqToPromise(t.objectStore(storeName).clear());
    });
  }

  function count(storeName) {
    return tx(storeName, 'readonly').then(function (t) {
      return reqToPromise(t.objectStore(storeName).count());
    });
  }

  // Query an index with an exact key or IDBKeyRange; returns all matches.
  function queryIndex(storeName, indexName, key) {
    return tx(storeName, 'readonly').then(function (t) {
      var index = t.objectStore(storeName).index(indexName);
      return reqToPromise(index.getAll(key));
    });
  }

  // Run a readwrite transaction across multiple stores with a callback that
  // receives the object stores. The callback may schedule requests; the
  // promise resolves on transaction completion (commit) or rejects on abort.
  function withStores(storeNames, mode, fn) {
    return tx(storeNames, mode).then(function (t) {
      var stores = {};
      for (var i = 0; i < storeNames.length; i++) stores[storeNames[i]] = t.objectStore(storeNames[i]);
      return new Promise(function (resolve, reject) {
        t.oncomplete = function () { resolve(); };
        t.onerror = function () { reject(t.error || new Error('IDB transaction failed')); };
        t.onabort = function () { reject(t.error || new Error('IDB transaction aborted')); };
        try { fn(stores); } catch (e) {
          try { t.abort(); } catch (_e) {}
          reject(e);
        }
      });
    });
  }

  // Run a transaction whose body may chain requests: body receives the
  // transaction and can await request promises; as long as it only awaits
  // IDB requests (their success handlers re-enter the same microtask
  // chain), the transaction stays alive. Resolves with body's return value
  // on commit; rejects and aborts otherwise. This is what gives capture
  // batches their atomicity: a quota failure aborts the whole transaction
  // and the previous archive stays untouched.
  function runTx(storeNames, mode, body) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t;
        try { t = db.transaction(storeNames, mode); } catch (e) { reject(e); return; }
        var resultBox = { has: false, value: undefined };
        var settled = false;
        function fail(err) { if (!settled) { settled = true; reject(err); } }
        // Resolve ONLY on commit — a body that finished issuing requests can
        // still see the whole transaction fail (e.g. quota), and callers
        // must never be told "saved" before the data is durable.
        t.oncomplete = function () {
          if (!settled) { settled = true; resolve(resultBox.has ? resultBox.value : undefined); }
        };
        t.onerror = function (ev) {
          fail(t.error || (ev && ev.target && ev.target.error) || new Error('IDB transaction failed'));
        };
        t.onabort = function () { fail(t.error || new Error('IDB transaction aborted')); };
        Promise.resolve(body(t)).then(function (result) {
          resultBox.has = true; resultBox.value = result;
        }, function (err) {
          fail(err);
          try { t.abort(); } catch (_e) {}
        });
      });
    });
  }

  return {
    DB_NAME: DB_NAME,
    DB_VERSION: DB_VERSION,
    open: openDB,
    put: put,
    get: get,
    getAll: getAll,
    delete: deleteKey,
    clear: clearStore,
    count: count,
    queryIndex: queryIndex,
    withStores: withStores,
    runTx: runTx,
    req: reqToPromise,
    _resetForTests: function () { _db = null; _opening = null; },
  };
})();

if (typeof window !== 'undefined') window.RelayIDB = RelayIDB;
if (typeof module !== 'undefined' && module.exports) module.exports = RelayIDB;
