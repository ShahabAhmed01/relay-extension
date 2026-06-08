/**
 * Relay — Browser Polyfill
 * webextension-polyfill v0.10.0 — Mozilla Public License 2.0
 * Provides unified `browser.*` API across Chrome and Firefox.
 *
 * This is a lightweight inline polyfill that wraps chrome.* APIs
 * to return Promises (matching the browser.* API contract).
 */

(function(global) {
  'use strict';

  if (typeof global.browser !== 'undefined' && global.browser.runtime && global.browser.runtime.id) {
    return;
  }

  if (typeof global.chrome === 'undefined' || !global.chrome.runtime) {
    return;
  }

  const chrome = global.chrome;

  function wrapAPIs(target, source) {
    const wrapped = {};
    for (const key in source) {
      if (typeof source[key] === 'function') {
        wrapped[key] = promisify(source[key].bind(source));
      } else if (typeof source[key] === 'object' && source[key] !== null) {
        wrapped[key] = wrapAPIs({}, source[key]);
      } else {
        wrapped[key] = source[key];
      }
    }
    return wrapped;
  }

  function promisify(fn) {
    return function() {
      const args = Array.from(arguments);
      return new Promise((resolve, reject) => {
        args.push(function(result) {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(result);
          }
        });
        try {
          fn.apply(null, args);
        } catch (e) {
          reject(e);
        }
      });
    };
  }

  const browser = {
    runtime: chrome.runtime,
    storage: chrome.storage,
    tabs: chrome.tabs,
    action: chrome.action || chrome.browserAction,
    browserAction: chrome.browserAction,
    alarms: chrome.alarms,
    scripting: chrome.scripting,
    i18n: chrome.i18n,
    extension: chrome.extension,
  };

  if (chrome.storage && chrome.storage.local) {
    browser.storage = {
      local: {
        get: function(keys) {
          return new Promise((resolve, reject) => {
            chrome.storage.local.get(keys, (result) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve(result);
              }
            });
          });
        },
        set: function(items) {
          return new Promise((resolve, reject) => {
            chrome.storage.local.set(items, () => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve();
              }
            });
          });
        },
        remove: function(keys) {
          return new Promise((resolve, reject) => {
            chrome.storage.local.remove(keys, () => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve();
              }
            });
          });
        },
        clear: function() {
          return new Promise((resolve, reject) => {
            chrome.storage.local.clear(() => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve();
              }
            });
          });
        },
      },
      onChanged: chrome.storage.onChanged,
    };
  }

  if (chrome.tabs) {
    browser.tabs = {
      create: function(createProperties) {
        return new Promise((resolve, reject) => {
          chrome.tabs.create(createProperties, (tab) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(tab);
            }
          });
        });
      },
      query: function(queryInfo) {
        return new Promise((resolve, reject) => {
          chrome.tabs.query(queryInfo, (tabs) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(tabs);
            }
          });
        });
      },
      sendMessage: function(tabId, message) {
        return new Promise((resolve, reject) => {
          chrome.tabs.sendMessage(tabId, message, (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(response);
            }
          });
        });
      },
      onUpdated: chrome.tabs.onUpdated,
      onActivated: chrome.tabs.onActivated,
    };
  }

  if (chrome.action) {
    browser.action = {
      setBadgeText: function(details) {
        return new Promise((resolve, reject) => {
          chrome.action.setBadgeText(details, () => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve();
            }
          });
        });
      },
      setBadgeBackgroundColor: function(details) {
        return new Promise((resolve, reject) => {
          chrome.action.setBadgeBackgroundColor(details, () => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve();
            }
          });
        });
      },
    };
  }

  if (chrome.browserAction) {
    browser.browserAction = {
      setBadgeText: function(details) {
        return new Promise((resolve, reject) => {
          chrome.browserAction.setBadgeText(details, () => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve();
            }
          });
        });
      },
      setBadgeBackgroundColor: function(details) {
        return new Promise((resolve, reject) => {
          chrome.browserAction.setBadgeBackgroundColor(details, () => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve();
            }
          });
        });
      },
    };
  }

  if (chrome.alarms) {
    browser.alarms = {
      create: chrome.alarms.create.bind(chrome.alarms),
      clear: chrome.alarms.clear.bind(chrome.alarms),
      onAlarm: chrome.alarms.onAlarm,
    };
  }

  global.browser = browser;

})(typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : this);
