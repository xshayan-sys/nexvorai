/* GET  /api/projects  → public list (no auth)
   POST /api/projects  → create (admin session required)             */
var http = require("./_lib/http");
var auth = require("./_lib/auth");
var store = require("./_lib/store");

module.exports = http.handler(async function (req, res) {
  if (req.method === "GET") {
    if (store.mode() === "unconfigured") {
      // Never blank the page — return an empty, clearly-flagged payload.
      return http.json(res, 200, {
        projects: [],
        configured: false,
        mode: "unconfigured",
        message: "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel, then redeploy."
      });
    }
    var rows = await store.listProjects();
    return http.json(res, 200, {
      projects: rows,
      configured: store.isConfigured(),
      mode: store.mode()
    });
  }

  if (req.method === "POST") {
    if (!auth.requireAdmin(req, res)) return;
    var body = await http.readJson(req);
    var row = await store.createProject(body);
    return http.json(res, 201, { project: row });
  }

  return http.fail(res, 405, "Method not allowed.");
});
