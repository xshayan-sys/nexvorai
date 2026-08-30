/* =========================================================
   nexvorai — local development server (dev only)
   ---------------------------------------------------------
   Vercel does NOT use this file. It exists so you can run the
   exact same api/ handlers locally with `npm run dev`.

   Serves: static files, /uploads/*, and every route in api/.
   ========================================================= */
var http = require("http");
var fs = require("fs");
var path = require("path");
var url = require("url");

var ROOT = __dirname;
var PORT = Number(process.env.PORT || 3000);

// Load .env (simple parser — no dependency needed).
(function loadEnv() {
  var file = path.join(ROOT, ".env");
  if (!fs.existsSync(file)) return;
  fs.readFileSync(file, "utf8").split(/\r?\n/).forEach(function (line) {
    if (!line || /^\s*#/.test(line)) return;
    var i = line.indexOf("=");
    if (i < 0) return;
    var k = line.slice(0, i).trim();
    var v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (!(k in process.env)) process.env[k] = v;
  });
})();

var MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".ico": "image/x-icon", ".mp4": "video/mp4", ".webm": "video/webm",
  ".mov": "video/quicktime", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8"
};

var routes = {
  "/api/login": "./api/login.js",
  "/api/logout": "./api/logout.js",
  "/api/projects": "./api/projects.js",
  "/api/upload-url": "./api/upload-url.js"
};

function serveFile(filePath, req, res) {
  fs.stat(filePath, function (err, stat) {
    if (err || !stat.isFile()) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/plain");
      return res.end("Not found");
    }
    var ext = path.extname(filePath).toLowerCase();
    res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
    res.setHeader("Access-Control-Allow-Origin", "*");
    // Dev server: never cache source files so edits show up immediately.
    var isMedia = [".mp4", ".webm", ".mov", ".png", ".jpg", ".jpeg", ".webp"].indexOf(ext) !== -1;
    res.setHeader("Cache-Control", isMedia ? "public, max-age=300" : "no-store");

    // Range support so <video> seeking works locally.
    var range = req.headers.range;
    if (range && /^bytes=/.test(range)) {
      var parts = range.replace("bytes=", "").split("-");
      var start = parseInt(parts[0], 10) || 0;
      var end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      if (start >= stat.size) { res.statusCode = 416; return res.end(); }
      res.statusCode = 206;
      res.setHeader("Content-Range", "bytes " + start + "-" + end + "/" + stat.size);
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Content-Length", end - start + 1);
      return fs.createReadStream(filePath, { start: start, end: end }).pipe(res);
    }
    res.setHeader("Content-Length", stat.size);
    res.setHeader("Accept-Ranges", "bytes");
    fs.createReadStream(filePath).pipe(res);
  });
}

var server = http.createServer(function (req, res) {
  var parsed = url.parse(req.url, true);
  var pathname = decodeURIComponent(parsed.pathname);
  req.query = parsed.query;

  // --- API ---
  if (pathname.indexOf("/api/") === 0) {
    var mod = routes[pathname];
    if (!mod && /^\/api\/projects\/[^/]+$/.test(pathname)) {
      mod = "./api/projects/[id].js";
      req.query.id = pathname.split("/").pop();
    }
    if (!mod) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ error: "Unknown API route: " + pathname }));
    }
    var handler = require(mod);
    return handler(req, res);
  }

  // --- uploads (dev storage) ---
  if (pathname.indexOf("/uploads/") === 0) {
    return serveFile(path.join(ROOT, pathname.replace(/\.\.+/g, "")), req, res);
  }

  // --- static ---
  var rel = pathname === "/" ? "/index.html" : pathname;
  if (!path.extname(rel)) rel += ".html";
  var target = path.join(ROOT, rel.replace(/\.\.+/g, ""));
  if (!target.startsWith(ROOT)) { res.statusCode = 403; return res.end("Forbidden"); }
  serveFile(target, req, res);
});

server.listen(PORT, function () {
  console.log("nexvorai dev server → http://localhost:" + PORT);
  console.log("  public site : http://localhost:" + PORT + "/");
  console.log("  admin       : http://localhost:" + PORT + "/admin.html");
  console.log("  storage mode: " + require("./api/_lib/store.js").mode());
});
