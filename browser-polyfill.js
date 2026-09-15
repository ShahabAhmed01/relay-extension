/**
 * Relay v1.1.0 — Browser API Compatibility Layer (fixed).
 * - Forwards event objects (onChanged/onUpdated/...) instead of dropping them.
 * - Keeps callback-style Chrome APIs working while exposing promises.
 */
(function (global) {
  'use strict';
  if (typeof global.browser !== 'undefined' && global.browser.runtime && global.browser.runtime.id) return;
  if (typeof global.chrome === 'undefined' || !global.chrome.runtime) return;
  var chrome = global.chrome;

  function isEventObj(v) {
    return v && typeof v === 'object' && typeof v.addListener === 'function';
  }

  function promisify(ns, name, fn) {
    return function () {
      var args = Array.prototype.slice.call(arguments);
      var last = args[args.length - 1];
      // Preserve callback style: if caller passed a function, use it directly.
      if (typeof last === 'function') {
        try { return fn.apply(ns, args); } catch (e) { return last(e); }
      }
      return new Promise(function (resolve, reject) {
        args.push(function (result) {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve(result);
        });
        try { fn.apply(ns, args); } catch (e) { reject(e); }
      });
    };
  }

  function wrapObject(ns, names) {
    var out = {};
    names.forEach(function (n) {
      var v = ns[n];
      if (typeof v === 'function') out[n] = promisify(ns, n, v);
      else if (isEventObj(v)) out[n] = v; // events must stay identical
      else if (v && typeof v === 'object') out[n] = v;
      else out[n] = v;
    });
    return out;
  }

  var browser = {
    runtime: chrome.runtime,
    storage: chrome.storage,
    tabs: chrome.tabs,
    action: chrome.action || chrome.browserAction,
    browserAction: chrome.browserAction,
    alarms: chrome.alarms,
    scripting: chrome.scripting,
    commands: chrome.commands,
    i18n: chrome.i18n,
    extension: chrome.extension,
  };

  if (chrome.storage && chrome.storage.local) {
    browser.storage = {
      local: wrapObject(chrome.storage.local, ['get', 'set', 'remove', 'clear', 'getBytesInUse']),
      onChanged: chrome.storage.onChanged,
    };
  }

  if (chrome.tabs) {
    browser.tabs = {
      create: promisify(chrome.tabs, 'create', chrome.tabs.create),
      query: promisify(chrome.tabs, 'query', chrome.tabs.query),
      get: chrome.tabs.get ? promisify(chrome.tabs, 'get', chrome.tabs.get) : undefined,
      sendMessage: promisify(chrome.tabs, 'sendMessage', chrome.tabs.sendMessage),
      onUpdated: chrome.tabs.onUpdated,
      onActivated: chrome.tabs.onActivated,
      onRemoved: chrome.tabs.onRemoved,
    };
  }

  if (chrome.action) {
    browser.action = {
      setBadgeText: promisify(chrome.action, 'setBadgeText', chrome.action.setBadgeText),
      setBadgeBackgroundColor: promisify(chrome.action, 'setBadgeBackgroundColor', chrome.action.setBadgeBackgroundColor),
      getBadgeText: chrome.action.getBadgeText ? promisify(chrome.action, 'getBadgeText', chrome.action.getBadgeText) : undefined,
    };
  }

  if (chrome.browserAction) {
    browser.browserAction = {
      setBadgeText: promisify(chrome.browserAction, 'setBadgeText', chrome.browserAction.setBadgeText),
      setBadgeBackgroundColor: promisify(chrome.browserAction, 'setBadgeBackgroundColor', chrome.browserAction.setBadgeBackgroundColor),
    };
  }

  if (chrome.alarms) {
    browser.alarms = {
      create: chrome.alarms.create.bind(chrome.alarms),
      clear: chrome.alarms.clear ? chrome.alarms.clear.bind(chrome.alarms) : undefined,
      get: chrome.alarms.get ? chrome.alarms.get.bind(chrome.alarms) : undefined,
      onAlarm: chrome.alarms.onAlarm,
    };
  }

  global.browser = browser;

})(typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : this);
