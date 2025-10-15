import { B as r } from "./browser-hack-3aaf2896.js";
import { h as T, g as S, A as k, N as g } from "./user-config-ba23153d.js";
import { o as b, s as E } from "./open-times-7416fc5c.js";
import "./_commonjsHelpers-de833af9.js";
globalThis.jotaiAtomCache = globalThis.jotaiAtomCache || {
  cache: new Map(),
  get(e, t) {
    if (this.cache.has(e)) {
      return this.cache.get(e);
    } else {
      this.cache.set(e, t);
      return t;
    }
  },
};
const C = {}.VITE_PLAUSIBLE_API_HOST || "https://plausible.io";
async function A(e, t) {
  await b(`${C}/api/event`, {
    method: "POST",
    body: {
      domain: "aichatone.com",
      name: e,
      url: location.href,
      props: t,
    },
    mode: "no-cors",
  });
}
async function O() {
  const { source: e } = await b("https://aichatone.com/api/user/source", {
    credentials: "include",
  });
  A("install", {
    source: e,
    language: navigator.language,
  });
}
var w = {
  parse: I,
  serialize: M,
};
/*!
 * cookie
 * Copyright(c) 2012-2014 Roman Shtylman
 * Copyright(c) 2015 Douglas Christopher Wilson
 * MIT Licensed
 */
var P = Object.prototype.toString;
var f = /^[\u0009\u0020-\u007e\u0080-\u00ff]+$/;
function I(e, t) {
  if (typeof e != "string") {
    throw new TypeError("argument str must be a string");
  }
  var n = {};
  var i = t || {};
  var s = i.decode || L;
  for (var o = 0; o < e.length; ) {
    var a = e.indexOf("=", o);
    if (a === -1) {
      break;
    }
    var c = e.indexOf(";", o);
    if (c === -1) {
      c = e.length;
    } else if (c < a) {
      o = e.lastIndexOf(";", a - 1) + 1;
      continue;
    }
    var d = e.slice(o, a).trim();
    if (n[d] === undefined) {
      var u = e.slice(a + 1, c).trim();
      if (u.charCodeAt(0) === 34) {
        u = u.slice(1, -1);
      }
      n[d] = j(u, s);
    }
    o = c + 1;
  }
  return n;
}
function M(e, t, n) {
  var i = n || {};
  var s = i.encode || _;
  if (typeof s != "function") {
    throw new TypeError("option encode is invalid");
  }
  if (!f.test(e)) {
    throw new TypeError("argument name is invalid");
  }
  var o = s(t);
  if (o && !f.test(o)) {
    throw new TypeError("argument val is invalid");
  }
  var a = e + "=" + o;
  if (i.maxAge != null) {
    var c = i.maxAge - 0;
    if (isNaN(c) || !isFinite(c)) {
      throw new TypeError("option maxAge is invalid");
    }
    a += "; Max-Age=" + Math.floor(c);
  }
  if (i.domain) {
    if (!f.test(i.domain)) {
      throw new TypeError("option domain is invalid");
    }
    a += "; Domain=" + i.domain;
  }
  if (i.path) {
    if (!f.test(i.path)) {
      throw new TypeError("option path is invalid");
    }
    a += "; Path=" + i.path;
  }
  if (i.expires) {
    var d = i.expires;
    if (!x(d) || isNaN(d.valueOf())) {
      throw new TypeError("option expires is invalid");
    }
    a += "; Expires=" + d.toUTCString();
  }
  if (i.httpOnly) {
    a += "; HttpOnly";
  }
  if (i.secure) {
    a += "; Secure";
  }
  if (i.partitioned) {
    a += "; Partitioned";
  }
  if (i.priority) {
    var u =
      typeof i.priority == "string" ? i.priority.toLowerCase() : i.priority;
    switch (u) {
      case "low":
        a += "; Priority=Low";
        break;
      case "medium":
        a += "; Priority=Medium";
        break;
      case "high":
        a += "; Priority=High";
        break;
      default:
        throw new TypeError("option priority is invalid");
    }
  }
  if (i.sameSite) {
    var v =
      typeof i.sameSite == "string" ? i.sameSite.toLowerCase() : i.sameSite;
    switch (v) {
      case true:
        a += "; SameSite=Strict";
        break;
      case "lax":
        a += "; SameSite=Lax";
        break;
      case "strict":
        a += "; SameSite=Strict";
        break;
      case "none":
        a += "; SameSite=None";
        break;
      default:
        throw new TypeError("option sameSite is invalid");
    }
  }
  return a;
}
function L(e) {
  if (e.indexOf("%") !== -1) {
    return decodeURIComponent(e);
  } else {
    return e;
  }
}
function _(e) {
  return encodeURIComponent(e);
}
function x(e) {
  return P.call(e) === "[object Date]" || e instanceof Date;
}
function j(e, t) {
  try {
    return t(e);
  } catch {
    return e;
  }
}
globalThis.jotaiAtomCache = globalThis.jotaiAtomCache || {
  cache: new Map(),
  get(e, t) {
    if (this.cache.has(e)) {
      return this.cache.get(e);
    } else {
      this.cache.set(e, t);
      return t;
    }
  },
};
const p = "twitter-csrf-token";
async function N({ refresh: e } = {}) {
  if (!e) {
    const { [p]: n } = await r.storage.session.get(p);
    if (n) {
      return n;
    }
  }
  const t = await r.tabs.create({
    url: "https://x.com/",
    active: false,
  });
  try {
    const n = await r.scripting.executeScript({
      target: {
        tabId: t.id,
      },
      func: () => document.cookie,
      injectImmediately: true,
    });
    const s = w.parse(n[0].result || "").ct0 || "";
    await r.storage.session.set({
      [p]: s,
    });
    return s;
  } finally {
    await r.tabs.remove(t.id);
  }
}
globalThis.jotaiAtomCache = globalThis.jotaiAtomCache || {
  cache: new Map(),
  get(e, t) {
    if (this.cache.has(e)) {
      return this.cache.get(e);
    } else {
      this.cache.set(e, t);
      return t;
    }
  },
};
const m = "moontshot-refresh-token";
async function D({ refresh: e } = {}) {
  if (!e) {
    const { [m]: n } = await r.storage.session.get(m);
    if (n) {
      return n;
    }
  }
  const t = await r.tabs.create({
    url: "https://kimi.moonshot.cn/",
    active: false,
  });
  try {
    const i =
      (
        await r.scripting.executeScript({
          target: {
            tabId: t.id,
          },
          func: () => localStorage.getItem("refresh_token"),
          injectImmediately: true,
        })
      )[0].result || "";
    await r.storage.session.set({
      [m]: i,
    });
    return i;
  } finally {
    await r.tabs.remove(t.id);
  }
}
globalThis.jotaiAtomCache = globalThis.jotaiAtomCache || {
  cache: new Map(),
  get(e, t) {
    if (this.cache.has(e)) {
      return this.cache.get(e);
    } else {
      this.cache.set(e, t);
      return t;
    }
  },
};
chrome.storage.session.setAccessLevel({
  accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS",
});
let h = false;
function U() {
  r.runtime.lastError;
}
async function R(e, t) {
  if (e.menuItemId === "open-side") {
    await chrome.sidePanel.open({
      tabId: t == null ? undefined : t.id,
    });
  }
}
async function y() {
  const e = await r.tabs.query({});
  const t = r.runtime.getURL("index.html");
  const n = e.find((o) => {
    var a;
    if ((a = o.url) == null) {
      return undefined;
    } else {
      return a.startsWith(t);
    }
  });
  if (n) {
    await r.tabs.update(n.id, {
      active: true,
    });
    return;
  }
  const { startupPage: i } = await S();
  const s = i === k ? "" : i === g ? `#/${g}` : `#/chat/${i}`;
  await r.tabs.create({
    url: `index.html${s}`,
  });
}
r.action.onClicked.addListener(async () => {
  await y();
});
r.runtime.onInstalled.addListener(async (e) => {
  if (e.reason === "install") {
    await r.tabs.create({
      url: "index.html#/setting",
    });
    await E();
    await O();
  }
});
r.contextMenus.create(
  {
    id: "open-side",
    title: "Open Side Panel",
    contexts: ["all"],
  },
  U
);
r.contextMenus.onClicked.addListener(R);
r.commands.onCommand.addListener(async (e, t) => {
  if (e === "open-app") {
    await y();
  } else if (e === "open-side") {
    if (h) {
      chrome.sidePanel
        .setOptions({
          enabled: false,
        })
        .then(() =>
          chrome.sidePanel.setOptions({
            enabled: true,
          })
        );
    } else {
      await chrome.sidePanel.open({
        tabId: t.id,
      });
    }
  }
});
r.runtime.onMessage.addListener(async (e, t) => {
  var n;
  var i;
  if (Object.keys(e).includes("sidebarMode")) {
    if (e.sidebarMode) {
      if (h) {
        return;
      }
      await chrome.sidePanel.open({
        tabId: (n = t.tab) == null ? undefined : n.id,
      });
    } else {
      if (!h) {
        return;
      }
      await chrome.sidePanel
        .setOptions({
          enabled: false,
        })
        .then(() =>
          chrome.sidePanel.setOptions({
            enabled: true,
          })
        );
    }
  }
  if (e.type === T) {
    if (!h) {
      await chrome.sidePanel.open({
        tabId: (i = t.tab) == null ? undefined : i.id,
      });
      const s = setInterval(() => {
        if (l) {
          if (l != null) {
            l.postMessage(e);
          }
          clearInterval(s);
          clearTimeout(o);
        }
      }, 100);
      const o = setTimeout(() => {
        if (!l) {
          clearInterval(s);
        }
      }, 10000);
    }
    return;
  }
  if (e.type == "openSetting") {
    await r.tabs.create({
      url: "index.html#/setting",
    });
    return;
  } else if (e.type == "readPage") {
    chrome.windows.getCurrent(
      {
        populate: true,
      },
      function (s) {
        const a = s.tabs.find((c) => c.active === true).id;
        chrome.tabs.sendMessage(a, e);
      }
    );
    return;
  }
  if (e.target === "background") {
    if (e.type === "read-twitter-csrf-token") {
      return N(e.data);
    }
    if (e.type === "read-moonshot-refresh-token") {
      return D(e.data);
    }
  }
});
let l;
chrome.runtime.onConnect.addListener(async function (e) {
  if (e.name === "AiChatOneSide") {
    h = true;
    l = e;
    await chrome.storage.session.set({
      sidebarMode: true,
    });
    e.onDisconnect.addListener(async () => {
      h = false;
      l = undefined;
      await chrome.storage.session.set({
        sidebarMode: false,
      });
    });
  }
});


