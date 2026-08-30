/* GET    /api/projects/:id → single project (public)
   PUT    /api/projects/:id → update (admin)
   DELETE /api/projects/:id → delete record + uploaded files (admin) */
var http = require("../_lib/http");
var auth = require("../_lib/auth");
var store = require("../_lib/store");

function resolveId(req) {
  if (req.query && req.query.id) return Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  var url = req.url || "";
  var clean = url.split("?")[0].replace(/\/+$/, "");
  return decodeURIComponent(clean.split("/").pop() || "");
}

module.exports = http.handler(async function (req, res) {
  var id = resolveId(req);
  if (!id) return http.fail(res, 400, "Missing project id.");

  if (req.method === "GET") {
    var row = await store.getProject(id);
    if (!row) return http.fail(res, 404, "Project not found.");
    return http.json(res, 200, { project: row });
  }

  if (req.method === "PUT" || req.method === "PATCH") {
    if (!auth.requireAdmin(req, res)) return;
    var body = await http.readJson(req);
    var updated = await store.updateProject(id, body);
    return http.json(res, 200, { project: updated });
  }

  if (req.method === "DELETE") {
    if (!auth.requireAdmin(req, res)) return;
    var result = await store.deleteProject(id);
    return http.json(res, 200, { ok: true, deleted: result });
  }

  return http.fail(res, 405, "Method not allowed.");
});
