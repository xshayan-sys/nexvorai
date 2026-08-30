/* =========================================================
   nexvorai — shared API client
   ---------------------------------------------------------
   API_BASE resolution:
   - On Vercel (or any single-origin host) the placeholder below is
     never rewritten, so we fall back to same-origin relative calls.
   - Inside a sandboxed preview the placeholder is rewritten to the
     backend URL, so calls are sent cross-origin with credentials.
   No secrets live in this file.
   ========================================================= */
(function () {
  "use strict";

  var RAW_BASE = "port/3000";
  var API_BASE = RAW_BASE.indexOf("_PORT_") !== -1 ? "" : RAW_BASE.replace(/\/+$/, "");

  // In-memory bearer token. Never persisted to localStorage/sessionStorage,
  // so it disappears on reload and cannot be replayed from disk.
  var memoryToken = null;

  function setToken(t) { memoryToken = t || null; }
  function hasToken() { return !!memoryToken; }

  function url(path) {
    if (path.charAt(0) !== "/") path = "/" + path;
    return API_BASE + path;
  }

  async function request(path, options) {
    options = options || {};
    var headers = Object.assign({}, options.headers || {});
    if (options.json !== undefined) {
      headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(options.json);
    }
    if (memoryToken) headers["Authorization"] = "Bearer " + memoryToken;

    var res;
    try {
      res = await fetch(url(path), {
        method: options.method || "GET",
        headers: headers,
        body: options.body,
        credentials: "include",
        cache: "no-store"
      });
    } catch (networkErr) {
      throw Object.assign(new Error("Network unreachable — is the API running?"), { code: "NETWORK" });
    }

    var text = await res.text();
    var data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = { error: text }; }

    if (!res.ok) {
      throw Object.assign(new Error((data && (data.error || data.message)) || ("Request failed (" + res.status + ")")), {
        status: res.status,
        code: (data && data.code) || null,
        data: data
      });
    }
    return data;
  }

  window.NexvoraAPI = {
    base: API_BASE,
    url: url,
    request: request,
    setToken: setToken,
    hasToken: hasToken,
    get: function (p) { return request(p); },
    post: function (p, body) { return request(p, { method: "POST", json: body || {} }); },
    put: function (p, body) { return request(p, { method: "PUT", json: body || {} }); },
    del: function (p) { return request(p, { method: "DELETE" }); },
    token: function () { return memoryToken; }
  };
})();
