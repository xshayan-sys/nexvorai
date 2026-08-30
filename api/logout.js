/* POST /api/logout → clears the admin session cookie */
var http = require("./_lib/http");
var auth = require("./_lib/auth");

module.exports = http.handler(async function (req, res) {
  if (req.method !== "POST") return http.fail(res, 405, "Method not allowed.");
  auth.clearSessionCookie(req, res);
  return http.json(res, 200, { ok: true });
});
