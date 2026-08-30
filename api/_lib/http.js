/* =========================================================
   nexvorai — HTTP helpers shared by every API route
   (files in api/_lib are ignored by Vercel's function detector)
   ========================================================= */

function applyCors(req, res) {
  var origin = req.headers.origin;
  if (origin) {
    // Echo the origin so credentialed requests work from a preview host.
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,x-upsert,cache-control");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function fail(res, status, message, code) {
  return json(res, status, code ? { error: message, code: code } : { error: message });
}

/** Reads and JSON-parses the request body (works on Vercel and on the local dev server). */
function readJson(req) {
  return new Promise(function (resolve) {
    if (req.body && typeof req.body === "object") return resolve(req.body);
    if (typeof req.body === "string") {
      try { return resolve(JSON.parse(req.body)); } catch (e) { return resolve({}); }
    }
    var chunks = [];
    req.on("data", function (c) { chunks.push(c); });
    req.on("end", function () {
      var raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { resolve({}); }
    });
    req.on("error", function () { resolve({}); });
  });
}

/** Reads the raw request body as a Buffer (used by the local dev upload endpoint). */
function readBuffer(req) {
  return new Promise(function (resolve, reject) {
    var chunks = [];
    req.on("data", function (c) { chunks.push(c); });
    req.on("end", function () { resolve(Buffer.concat(chunks)); });
    req.on("error", reject);
  });
}

/** Wraps a route handler with CORS, OPTIONS preflight and error safety. */
function handler(fn) {
  return async function (req, res) {
    applyCors(req, res);
    if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
    try {
      await fn(req, res);
    } catch (err) {
      // Never leak stack traces or secrets to the client.
      console.error("[nexvorai api]", err && err.stack ? err.stack : err);
      if (res.headersSent) return;
      var status = err && typeof err.status === "number" && err.status >= 400 && err.status <= 599 ? err.status : 500;
      fail(res, status, (err && err.publicMessage) || "Server error. Check the deployment logs.", err && err.code);
    }
  };
}

module.exports = { applyCors: applyCors, json: json, fail: fail, readJson: readJson, readBuffer: readBuffer, handler: handler };
