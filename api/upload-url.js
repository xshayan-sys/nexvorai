/* POST /api/upload-url → returns a short-lived signed upload target
                            for Supabase Storage (admin only).
   PUT  /api/upload-url?path=…  → local-dev only byte sink so the whole
                            upload flow can be tested without Supabase. */
var http = require("./_lib/http");
var auth = require("./_lib/auth");
var store = require("./_lib/store");

var VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm", "video/x-m4v", "video/x-matroska", "video/mpeg", "video/ogg"];
var IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

function originOf(req) {
  var proto = (req.headers["x-forwarded-proto"] || (req.socket && req.socket.encrypted ? "https" : "http")).split(",")[0].trim();
  var host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
  return proto + "://" + host;
}

module.exports = http.handler(async function (req, res) {
  if (!auth.requireAdmin(req, res)) return;

  /* ---- local dev byte sink ---- */
  if (req.method === "PUT") {
    if (!store.LOCAL) return http.fail(res, 405, "Direct uploads are handled by Supabase Storage in this environment.");
    var qs = new URL(req.url, "http://localhost");
    var objPath = qs.searchParams.get("path");
    if (!objPath) return http.fail(res, 400, "Missing path.");
    var buf = await http.readBuffer(req);
    var saved = store.saveLocalUpload(objPath, buf);
    return http.json(res, 200, { ok: true, path: objPath, url: saved });
  }

  if (req.method !== "POST") return http.fail(res, 405, "Method not allowed.");

  var body = await http.readJson(req);
  var kind = body.kind === "poster" ? "poster" : "video";
  var contentType = String(body.contentType || "").toLowerCase();
  var allowed = kind === "poster" ? IMAGE_TYPES : VIDEO_TYPES;

  if (contentType && allowed.indexOf(contentType) === -1 && contentType.indexOf(kind === "poster" ? "image/" : "video/") !== 0) {
    return http.fail(res, 415, kind === "poster"
      ? "Unsupported image type. Use JPG, PNG or WebP."
      : "Unsupported video type. MP4 (H.264) is preferred; MOV and WebM also work.");
  }

  var target = await store.createUploadTarget(kind, body.filename, contentType || (kind === "poster" ? "image/jpeg" : "video/mp4"), originOf(req));
  return http.json(res, 200, target);
});
