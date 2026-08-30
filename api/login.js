/* POST /api/login  → password check, sets HttpOnly session cookie
   GET  /api/login  → is the current session still valid?              */
var http = require("./_lib/http");
var auth = require("./_lib/auth");
var store = require("./_lib/store");

module.exports = http.handler(async function (req, res) {
  if (req.method === "GET") {
    return http.json(res, 200, {
      authenticated: auth.isAdmin(req),
      configured: store.isConfigured(),
      mode: store.mode()
    });
  }

  if (req.method !== "POST") return http.fail(res, 405, "Method not allowed.");

  if (!auth.isConfigured()) {
    return http.fail(
      res,
      503,
      "Admin login is not configured. Set ADMIN_PASSWORD and a SESSION_SECRET of at least 16 characters in your environment, then redeploy.",
      "NOT_CONFIGURED"
    );
  }

  var body = await http.readJson(req);

  if (!auth.checkPassword(body.password)) {
    // Small delay to blunt brute-force attempts.
    await new Promise(function (r) { setTimeout(r, 450); });
    return http.fail(res, 401, "Incorrect password.", "BAD_PASSWORD");
  }

  var token = auth.createToken();
  auth.setSessionCookie(req, res, token);

  return http.json(res, 200, {
    ok: true,
    mode: store.mode(),
    configured: store.isConfigured(),
    // Bearer copy only when the console is served from a different origin
    // (sandbox preview), where third-party cookies may be blocked.
    token: auth.crossSite(req) ? token : undefined
  });
});
