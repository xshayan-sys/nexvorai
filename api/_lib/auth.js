/* =========================================================
   nexvorai — password-only admin session
   ---------------------------------------------------------
   • One password, read from process.env.ADMIN_PASSWORD.
   • No accounts, no sign-ups, no email.
   • Session = HMAC-SHA256 signed token in an HttpOnly cookie.
   • A bearer copy is issued only for cross-origin previews.
   ========================================================= */
var crypto = require("crypto");

var COOKIE = "nexvorai_session";
var TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

function secret() {
  return process.env.SESSION_SECRET || "";
}

function isConfigured() {
  return !!process.env.ADMIN_PASSWORD && secret().length >= 16;
}

function b64u(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64u(str) {
  return Buffer.from(String(str).replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function sign(payload) {
  return b64u(crypto.createHmac("sha256", secret()).update(payload).digest());
}

/** Constant-time string compare that never throws on length mismatch. */
function safeEqual(a, b) {
  var ab = Buffer.from(String(a));
  var bb = Buffer.from(String(b));
  if (ab.length !== bb.length) {
    // Still burn a comparison so timing stays flat.
    crypto.timingSafeEqual(ab, ab);
    return false;
  }
  return crypto.timingSafeEqual(ab, bb);
}

function checkPassword(input) {
  var expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  return safeEqual(input == null ? "" : input, expected);
}

function createToken() {
  var body = b64u(JSON.stringify({ r: "admin", exp: Date.now() + TTL_MS, n: crypto.randomBytes(8).toString("hex") }));
  return body + "." + sign(body);
}

function verifyToken(token) {
  if (!token || !secret()) return false;
  var parts = String(token).split(".");
  if (parts.length !== 2) return false;
  if (!safeEqual(parts[1], sign(parts[0]))) return false;
  try {
    var data = JSON.parse(unb64u(parts[0]).toString("utf8"));
    return data && data.r === "admin" && typeof data.exp === "number" && data.exp > Date.now();
  } catch (e) {
    return false;
  }
}

function parseCookies(req) {
  var out = {};
  var raw = req.headers.cookie;
  if (!raw) return out;
  raw.split(";").forEach(function (pair) {
    var i = pair.indexOf("=");
    if (i < 0) return;
    out[pair.slice(0, i).trim()] = decodeURIComponent(pair.slice(i + 1).trim());
  });
  return out;
}

function isSecureRequest(req) {
  var proto = req.headers["x-forwarded-proto"];
  if (proto) return String(proto).split(",")[0].trim() === "https";
  return !!(req.socket && req.socket.encrypted);
}

function crossSite(req) {
  var origin = req.headers.origin;
  if (!origin) return false;
  var host = req.headers["x-forwarded-host"] || req.headers.host || "";
  try { return new URL(origin).host !== host; } catch (e) { return true; }
}

function setSessionCookie(req, res, token) {
  var secure = isSecureRequest(req);
  var sameSite = crossSite(req) && secure ? "None" : "Lax";
  var parts = [
    COOKIE + "=" + encodeURIComponent(token),
    "Path=/",
    "HttpOnly",
    "Max-Age=" + Math.floor(TTL_MS / 1000),
    "SameSite=" + sameSite
  ];
  if (secure) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function clearSessionCookie(req, res) {
  var secure = isSecureRequest(req);
  var parts = [COOKIE + "=", "Path=/", "HttpOnly", "Max-Age=0", "SameSite=" + (crossSite(req) && secure ? "None" : "Lax")];
  if (secure) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

/** True when the request carries a valid admin session (cookie or bearer). */
function isAdmin(req) {
  var cookieToken = parseCookies(req)[COOKIE];
  if (verifyToken(cookieToken)) return true;
  var auth = req.headers.authorization || "";
  if (/^Bearer\s+/i.test(auth)) return verifyToken(auth.replace(/^Bearer\s+/i, "").trim());
  return false;
}

/** Guard for write routes. Responds 401 and returns false when not authorised. */
function requireAdmin(req, res) {
  if (isAdmin(req)) return true;
  res.statusCode = 401;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify({ error: "Admin session required.", code: "UNAUTHORISED" }));
  return false;
}

module.exports = {
  COOKIE: COOKIE,
  isConfigured: isConfigured,
  checkPassword: checkPassword,
  createToken: createToken,
  verifyToken: verifyToken,
  setSessionCookie: setSessionCookie,
  clearSessionCookie: clearSessionCookie,
  isAdmin: isAdmin,
  requireAdmin: requireAdmin,
  crossSite: crossSite
};
