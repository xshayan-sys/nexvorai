/* =========================================================
   nexvorai — data + storage layer
   ---------------------------------------------------------
   Primary mode  : Supabase Postgres (REST) + Supabase Storage.
   Fallback mode : a local JSON/file store used ONLY for local
                   development (`npm run dev`), so the site never
                   renders a blank page while unconfigured.

   The service-role key is read from the environment inside
   server functions only. It is never sent to the browser.
   ========================================================= */
var fs = require("fs");
var path = require("path");
var crypto = require("crypto");

var BUCKET = process.env.VIDEO_BUCKET || "videos";
var LOCAL = process.env.NEXVORAI_LOCAL_STORE === "1";

function supabaseUrl() { return (process.env.SUPABASE_URL || "").replace(/\/+$/, ""); }
function serviceKey() { return process.env.SUPABASE_SERVICE_ROLE_KEY || ""; }

/** Supabase is usable when both the URL and the service-role key are present. */
function isConfigured() { return !!supabaseUrl() && !!serviceKey(); }
function mode() { return isConfigured() ? "supabase" : (LOCAL ? "local" : "unconfigured"); }

function configError() {
  var err = new Error(
    "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your Vercel project settings, then redeploy."
  );
  err.status = 503;
  err.code = "NOT_CONFIGURED";
  err.publicMessage = err.message;
  return err;
}

/* ---------------------------------------------------------
   Supabase REST helpers
   --------------------------------------------------------- */
async function rest(pathname, options) {
  options = options || {};
  var res = await fetch(supabaseUrl() + pathname, {
    method: options.method || "GET",
    headers: Object.assign({
      apikey: serviceKey(),
      Authorization: "Bearer " + serviceKey(),
      "Content-Type": "application/json",
      Prefer: options.prefer || "return=representation"
    }, options.headers || {}),
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  var text = await res.text();
  var data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = { raw: text }; }
  if (!res.ok) {
    var err = new Error((data && (data.message || data.error || data.hint)) || ("Supabase error " + res.status));
    err.status = res.status === 404 ? 404 : 502;
    err.publicMessage = err.message;
    throw err;
  }
  return data;
}

async function storage(pathname, options) {
  options = options || {};
  var res = await fetch(supabaseUrl() + "/storage/v1" + pathname, {
    method: options.method || "GET",
    headers: Object.assign({
      apikey: serviceKey(),
      Authorization: "Bearer " + serviceKey(),
      "Content-Type": "application/json"
    }, options.headers || {}),
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  var text = await res.text();
  var data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = { raw: text }; }
  if (!res.ok) {
    var err = new Error((data && (data.message || data.error)) || ("Storage error " + res.status));
    err.status = 502;
    err.publicMessage = err.message;
    throw err;
  }
  return data;
}

/* ---------------------------------------------------------
   Local dev store
   --------------------------------------------------------- */
var ROOT = path.join(__dirname, "..", "..");
var DATA_FILE = path.join(ROOT, ".data", "projects.json");
var UPLOAD_DIR = path.join(ROOT, "uploads");

function localRead() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); } catch (e) { return []; }
}
function localWrite(rows) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(rows, null, 2));
}

/* ---------------------------------------------------------
   Public helpers
   --------------------------------------------------------- */
var ALLOWED = ["Social", "Brand Film", "Motion", "Creator"];

function safeName(name, fallbackExt) {
  var base = String(name || "file").split(/[\\/]/).pop();
  var ext = (base.match(/\.[a-z0-9]{2,5}$/i) || [fallbackExt || ""])[0].toLowerCase();
  var stem = base.replace(/\.[^.]*$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "clip";
  return stem + ext;
}

function objectPath(kind, filename) {
  var stamp = new Date().toISOString().slice(0, 10);
  var rand = crypto.randomBytes(5).toString("hex");
  return (kind === "poster" ? "posters/" : "clips/") + stamp + "/" + rand + "-" + safeName(filename, kind === "poster" ? ".jpg" : ".mp4");
}

function publicUrl(objPath) {
  if (isConfigured()) return supabaseUrl() + "/storage/v1/object/public/" + BUCKET + "/" + objPath;
  return "/uploads/" + objPath;
}

function normalise(body) {
  var out = {
    title: String(body.title || "").trim().slice(0, 160),
    client: String(body.client || "").trim().slice(0, 160),
    category: ALLOWED.indexOf(body.category) !== -1 ? body.category : "Social",
    description: String(body.description || "").trim().slice(0, 600) || null
  };
  if (body.video_url) out.video_url = String(body.video_url).slice(0, 1000);
  if (body.poster_url) out.poster_url = String(body.poster_url).slice(0, 1000) || null;
  return out;
}

/* ---------- projects ---------- */
async function listProjects() {
  if (isConfigured()) {
    var rows = await rest("/rest/v1/projects?select=*&order=created_at.desc");
    return Array.isArray(rows) ? rows : [];
  }
  if (LOCAL) return localRead().slice().sort(function (a, b) { return String(b.created_at).localeCompare(String(a.created_at)); });
  throw configError();
}

async function createProject(body) {
  var record = normalise(body);
  if (!record.title || !record.client) {
    var e = new Error("Title and client are required.");
    e.status = 400; e.publicMessage = e.message; throw e;
  }
  if (!record.video_url) {
    var e2 = new Error("A video must be uploaded before publishing.");
    e2.status = 400; e2.publicMessage = e2.message; throw e2;
  }
  if (isConfigured()) {
    var rows = await rest("/rest/v1/projects", { method: "POST", body: [record] });
    return rows && rows[0];
  }
  if (!LOCAL) throw configError();
  var all = localRead();
  var now = new Date().toISOString();
  var row = Object.assign({ id: crypto.randomUUID(), created_at: now, updated_at: now, poster_url: null }, record);
  all.push(row);
  localWrite(all);
  return row;
}

async function updateProject(id, body) {
  var patch = normalise(body);
  patch.updated_at = new Date().toISOString();
  if (!body.video_url) delete patch.video_url;   // keep existing video
  if (!body.poster_url) delete patch.poster_url; // keep existing poster
  if (isConfigured()) {
    var rows = await rest("/rest/v1/projects?id=eq." + encodeURIComponent(id), { method: "PATCH", body: patch });
    if (!rows || !rows.length) { var e = new Error("Project not found."); e.status = 404; e.publicMessage = e.message; throw e; }
    return rows[0];
  }
  if (!LOCAL) throw configError();
  var all = localRead();
  var i = all.findIndex(function (r) { return String(r.id) === String(id); });
  if (i === -1) { var e2 = new Error("Project not found."); e2.status = 404; e2.publicMessage = e2.message; throw e2; }
  all[i] = Object.assign({}, all[i], patch);
  localWrite(all);
  return all[i];
}

async function getProject(id) {
  if (isConfigured()) {
    var rows = await rest("/rest/v1/projects?select=*&id=eq." + encodeURIComponent(id));
    return rows && rows[0];
  }
  if (!LOCAL) throw configError();
  return localRead().find(function (r) { return String(r.id) === String(id); });
}

/** Extracts the storage object path from a stored public URL, if it points at our bucket. */
function pathFromUrl(url) {
  if (!url) return null;
  var marker = "/storage/v1/object/public/" + BUCKET + "/";
  var str = String(url);
  var i = str.indexOf(marker);
  if (i !== -1) return decodeURIComponent(str.slice(i + marker.length));
  // Local dev store (relative or absolute dev-server URL).
  var j = str.indexOf("/uploads/");
  if (j === 0 || (j > 0 && /^https?:\/\//i.test(str))) return decodeURIComponent(str.slice(j + "/uploads/".length));
  return null;
}

async function deleteProject(id) {
  var row = await getProject(id);
  if (!row) { var e = new Error("Project not found."); e.status = 404; e.publicMessage = e.message; throw e; }

  var removed = [];
  [row.video_url, row.poster_url].forEach(function (u) {
    var p = pathFromUrl(u);
    if (p) removed.push(p);
  });

  if (isConfigured()) {
    await rest("/rest/v1/projects?id=eq." + encodeURIComponent(id), { method: "DELETE", prefer: "return=minimal" });
    if (removed.length) {
      // Best effort — a missing object must not block the record deletion.
      try { await storage("/object/" + BUCKET, { method: "DELETE", body: { prefixes: removed } }); }
      catch (err) { console.error("[nexvorai] storage cleanup skipped:", err.message); }
    }
    return { id: id, removedFiles: removed.length };
  }

  if (!LOCAL) throw configError();
  localWrite(localRead().filter(function (r) { return String(r.id) !== String(id); }));
  removed.forEach(function (p) {
    try { fs.unlinkSync(path.join(UPLOAD_DIR, p)); } catch (e) {}
  });
  return { id: id, removedFiles: removed.length };
}

/* ---------- uploads ---------- */
async function createUploadTarget(kind, filename, contentType, baseUrl) {
  var objPath = objectPath(kind === "poster" ? "poster" : "video", filename);
  var origin = (baseUrl || "").replace(/\/+$/, "");

  if (isConfigured()) {
    var signed = await storage("/object/upload/sign/" + BUCKET + "/" + objPath, { method: "POST", body: { expiresIn: 3600 } });
    var rel = signed && (signed.url || signed.signedURL || signed.signedUrl);
    if (!rel) { var e = new Error("Supabase did not return a signed upload URL. Check that the bucket exists."); e.status = 502; e.publicMessage = e.message; throw e; }
    if (rel.charAt(0) !== "/") rel = "/" + rel;
    return {
      mode: "supabase",
      method: "PUT",
      uploadUrl: supabaseUrl() + "/storage/v1" + rel,
      headers: { "Content-Type": contentType || "application/octet-stream", "x-upsert": "true", "cache-control": "3600" },
      withCredentials: false,
      path: objPath,
      publicUrl: publicUrl(objPath)
    };
  }

  if (!LOCAL) throw configError();
  return {
    mode: "local",
    method: "PUT",
    uploadUrl: origin + "/api/upload-url?path=" + encodeURIComponent(objPath),
    headers: { "Content-Type": contentType || "application/octet-stream" },
    withCredentials: true,
    path: objPath,
    publicUrl: origin + publicUrl(objPath)
  };
}

/** Local-dev only: writes the uploaded bytes to ./uploads. */
function saveLocalUpload(objPath, buffer) {
  var clean = String(objPath).replace(/\.\.+/g, "").replace(/^\/+/, "");
  var dest = path.join(UPLOAD_DIR, clean);
  if (!dest.startsWith(UPLOAD_DIR)) throw new Error("Invalid upload path.");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buffer);
  return "/uploads/" + clean;
}

module.exports = {
  BUCKET: BUCKET,
  LOCAL: LOCAL,
  mode: mode,
  isConfigured: isConfigured,
  configError: configError,
  listProjects: listProjects,
  createProject: createProject,
  updateProject: updateProject,
  deleteProject: deleteProject,
  getProject: getProject,
  createUploadTarget: createUploadTarget,
  saveLocalUpload: saveLocalUpload,
  ALLOWED_CATEGORIES: ALLOWED
};
