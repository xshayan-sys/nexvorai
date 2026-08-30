/* =========================================================
   nexvorai — admin console behaviour
   No password, key or secret is stored in this file.
   ========================================================= */
(function () {
  "use strict";

  var API = window.NexvoraAPI;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var gate = $("#gate");
  var console_ = $("#console");
  var projects = [];
  var editingId = null;
  var pendingDelete = null;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function setMsg(el, text, kind) {
    el.textContent = text || "";
    el.className = el.className.replace(/\s*is-(ok|err)/g, "") + (kind ? " is-" + kind : "");
  }

  /* =============== LOGIN =============== */
  var loginForm = $("#loginForm");
  var pw = $("#pw");
  var loginMsg = $("#loginMsg");
  var loginBtn = $("#loginBtn");

  $("#pwToggle").addEventListener("click", function () {
    var show = pw.type === "password";
    pw.type = show ? "text" : "password";
    this.textContent = show ? "Hide" : "Show";
    this.setAttribute("aria-label", show ? "Hide password" : "Show password");
  });

  loginForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    var value = pw.value;
    if (!value) { setMsg(loginMsg, "Enter the access password.", "err"); return; }
    loginBtn.disabled = true;
    setMsg(loginMsg, "Checking…");
    try {
      var res = await API.post("/api/login", { password: value });
      if (res && res.token) API.setToken(res.token);
      setMsg(loginMsg, "Unlocked.", "ok");
      pw.value = "";
      enterConsole();
    } catch (err) {
      setMsg(loginMsg, err.status === 401 ? "Incorrect password." : err.message, "err");
      pw.select();
    } finally {
      loginBtn.disabled = false;
    }
  });

  $("#logoutBtn").addEventListener("click", async function () {
    try { await API.post("/api/logout", {}); } catch (e) {}
    API.setToken(null);
    console_.hidden = true;
    gate.hidden = false;
    setMsg(loginMsg, "Signed out.", "ok");
  });

  function enterConsole() {
    gate.hidden = true;
    console_.hidden = false;
    loadProjects();
  }

  // Resume an existing HttpOnly cookie session (same-origin deployments).
  (async function bootstrap() {
    try {
      var res = await API.get("/api/login");
      if (res && res.authenticated) { enterConsole(); return; }
      if (res && res.mode === "unconfigured") {
        setMsg(loginMsg, "Server is running, but Supabase is not configured yet — see README.", "err");
      } else if (res && res.mode === "local") {
        setMsg(loginMsg, "Demo storage mode — uploads are kept in a local dev store.", "");
      }
    } catch (err) {
      setMsg(loginMsg, err.code === "NETWORK" ? "API unreachable. Is the deployment live?" : "", "err");
    }
  })();

  /* =============== FILE PICKERS =============== */
  function wirePicker(inputSel, nameSel, dropSel) {
    var input = $(inputSel), label = $(nameSel), drop = $(dropSel);
    label.classList.add("is-empty");
    input.addEventListener("change", function () {
      var f = input.files && input.files[0];
      if (!f) {
        label.textContent = "No file selected";
        label.classList.add("is-empty");
        drop.classList.remove("is-armed");
        return;
      }
      label.textContent = f.name + "  ·  " + (f.size / (1024 * 1024)).toFixed(1) + " MB";
      label.classList.remove("is-empty");
      drop.classList.add("is-armed");
    });
  }
  wirePicker("#pVideo", "#videoName", "#videoDrop");
  wirePicker("#pPoster", "#posterName", "#posterDrop");

  function showProgress(sel, pct) {
    var box = $(sel);
    box.hidden = false;
    $("i", box).style.setProperty("--p", pct + "%");
    $("span", box).textContent = pct + "%";
  }
  function resetProgress(sel) {
    var box = $(sel);
    box.hidden = true;
    $("i", box).style.setProperty("--p", "0%");
    $("span", box).textContent = "0%";
  }

  /* =============== UPLOAD =============== */
  function xhrUpload(target, file, onProgress) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open(target.method || "PUT", target.uploadUrl, true);
      var headers = target.headers || {};
      Object.keys(headers).forEach(function (k) { xhr.setRequestHeader(k, headers[k]); });
      if (target.withCredentials) xhr.withCredentials = true;
      if (target.withCredentials && API.token()) xhr.setRequestHeader("Authorization", "Bearer " + API.token());
      xhr.upload.onprogress = function (e) {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) { onProgress(100); resolve(); }
        else reject(new Error("Upload failed (" + xhr.status + "). " + (xhr.responseText || "").slice(0, 160)));
      };
      xhr.onerror = function () { reject(new Error("Upload failed — network error.")); };
      xhr.ontimeout = function () { reject(new Error("Upload timed out.")); };
      xhr.send(file);
    });
  }

  async function uploadFile(file, kind, progSel) {
    var target = await API.post("/api/upload-url", {
      filename: file.name,
      contentType: file.type || (kind === "video" ? "video/mp4" : "image/jpeg"),
      kind: kind
    });
    showProgress(progSel, 0);
    await xhrUpload(target, file, function (p) { showProgress(progSel, p); });
    return { publicUrl: target.publicUrl, path: target.path };
  }

  /* =============== SAVE (create / update) =============== */
  var form = $("#projectForm");
  var formMsg = $("#formMsg");
  var saveBtn = $("#saveBtn");

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    var title = $("#pTitle").value.trim();
    var client = $("#pClient").value.trim();
    var category = $("#pCategory").value;
    var description = $("#pDesc").value.trim();
    var videoFile = $("#pVideo").files[0];
    var posterFile = $("#pPoster").files[0];

    if (!title || !client) { setMsg(formMsg, "Title and client are required.", "err"); return; }
    if (!editingId && !videoFile) { setMsg(formMsg, "Choose a video file to publish a new project.", "err"); return; }

    saveBtn.disabled = true;
    setMsg(formMsg, "Uploading…");

    try {
      var payload = { title: title, client: client, category: category, description: description };

      if (videoFile) {
        setMsg(formMsg, "Uploading video…");
        var v = await uploadFile(videoFile, "video", "#videoProg");
        payload.video_url = v.publicUrl;
        payload.video_path = v.path;
      }
      if (posterFile) {
        setMsg(formMsg, "Uploading poster…");
        var ps = await uploadFile(posterFile, "poster", "#posterProg");
        payload.poster_url = ps.publicUrl;
        payload.poster_path = ps.path;
      }

      setMsg(formMsg, "Saving…");
      if (editingId) await API.put("/api/projects/" + encodeURIComponent(editingId), payload);
      else await API.post("/api/projects", payload);

      setMsg(formMsg, editingId ? "Changes saved and live." : "Project published — it is live for every visitor.", "ok");
      resetForm();
      await loadProjects();
    } catch (err) {
      setMsg(formMsg, err.message, "err");
    } finally {
      saveBtn.disabled = false;
    }
  });

  function resetForm() {
    editingId = null;
    form.reset();
    $("#pId").value = "";
    $("#formTitle").textContent = "Add project";
    saveBtn.textContent = "Publish project";
    $("#cancelEdit").hidden = true;
    $("#videoKeep").hidden = true;
    $("#videoName").textContent = "No file selected";
    $("#videoName").classList.add("is-empty");
    $("#posterName").textContent = "No file selected";
    $("#posterName").classList.add("is-empty");
    $("#videoDrop").classList.remove("is-armed");
    $("#posterDrop").classList.remove("is-armed");
    resetProgress("#videoProg");
    resetProgress("#posterProg");
    $$(".prow.is-editing").forEach(function (r) { r.classList.remove("is-editing"); });
  }
  $("#cancelEdit").addEventListener("click", function () { resetForm(); setMsg(formMsg, ""); });

  function startEdit(p) {
    editingId = p.id;
    $("#pId").value = p.id;
    $("#pTitle").value = p.title || "";
    $("#pClient").value = p.client || "";
    $("#pCategory").value = p.category || "Social";
    $("#pDesc").value = p.description || "";
    $("#pVideo").value = "";
    $("#pPoster").value = "";
    $("#formTitle").textContent = "Edit project";
    saveBtn.textContent = "Save changes";
    $("#cancelEdit").hidden = false;
    $("#videoKeep").hidden = false;
    resetProgress("#videoProg");
    resetProgress("#posterProg");
    setMsg(formMsg, "Editing “" + p.title + "”.");
    $$(".prow").forEach(function (r) { r.classList.toggle("is-editing", r.dataset.id === String(p.id)); });
    $("#formPanel").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* =============== LIST =============== */
  var plist = $("#plist");
  var ICON = {
    play: '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>',
    edit: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l10-10-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>',
    trash: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>',
    film: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v14M17 5v14"/></svg>'
  };

  function fmtDate(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    if (isNaN(d)) return "—";
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }

  function renderList() {
    $("#pCount").textContent = String(projects.length);
    if (!projects.length) {
      plist.innerHTML = '<p class="plist__empty">No projects yet. Publish the first one from the form.</p>';
      return;
    }
    plist.innerHTML = "";
    projects.forEach(function (p) {
      var row = document.createElement("div");
      row.className = "prow";
      row.dataset.id = p.id;
      row.innerHTML =
        '<div class="prow__thumb">' + (p.poster_url ? '<img src="' + esc(p.poster_url) + '" alt="" loading="lazy" />' : ICON.film) + "</div>" +
        '<div class="prow__main">' +
          '<p class="prow__title">' + esc(p.title) + "</p>" +
          '<div class="prow__meta">' +
            '<span class="prow__badge">' + esc(p.category || "—") + "</span>" +
            "<span>" + esc(p.client || "") + "</span>" +
            "<span>" + fmtDate(p.created_at) + "</span>" +
          "</div>" +
        "</div>" +
        '<div class="prow__acts">' +
          '<button class="iact" data-act="preview" title="Preview" aria-label="Preview ' + esc(p.title) + '">' + ICON.play + "</button>" +
          '<button class="iact" data-act="edit" title="Edit" aria-label="Edit ' + esc(p.title) + '">' + ICON.edit + "</button>" +
          '<button class="iact iact--danger" data-act="delete" title="Delete" aria-label="Delete ' + esc(p.title) + '">' + ICON.trash + "</button>" +
        "</div>";

      $('[data-act="preview"]', row).addEventListener("click", function () { openModal(p); });
      $('[data-act="edit"]', row).addEventListener("click", function () { startEdit(p); });
      $('[data-act="delete"]', row).addEventListener("click", function () { askDelete(p); });
      plist.appendChild(row);
    });
  }

  async function loadProjects() {
    try {
      var data = await API.get("/api/projects");
      projects = (data && data.projects) || [];
      var notice = $("#configNotice");
      if (data && data.mode === "local") {
        notice.hidden = false;
        notice.innerHTML = "<strong>Demo storage mode.</strong> Supabase is not configured, so projects are held in a local dev store " +
          "and will not persist on Vercel. Add <code>SUPABASE_URL</code> and <code>SUPABASE_SERVICE_ROLE_KEY</code> to go fully live.";
        $("#modeTag").hidden = false;
        $("#modeTag").textContent = "Demo storage";
      } else if (data && data.mode === "unconfigured") {
        notice.hidden = false;
        notice.innerHTML = "<strong>Storage not configured.</strong> Add <code>SUPABASE_URL</code> and <code>SUPABASE_SERVICE_ROLE_KEY</code> " +
          "to your environment variables and redeploy \u2014 uploads and saves will fail until then.";
        $("#modeTag").hidden = false;
        $("#modeTag").textContent = "Not configured";
      } else {
        notice.hidden = true;
        $("#modeTag").hidden = true;
      }
      renderList();
    } catch (err) {
      if (err.status === 401) { API.setToken(null); console_.hidden = true; gate.hidden = false; return; }
      plist.innerHTML = '<p class="plist__empty">Couldn\'t load projects — ' + esc(err.message) + "</p>";
    }
  }
  $("#refreshBtn").addEventListener("click", loadProjects);

  /* =============== DELETE =============== */
  var confirmBox = $("#confirm");
  function askDelete(p) {
    pendingDelete = p;
    $("#confirmBody").textContent = 'Delete “' + p.title + '”? This removes the project record and its uploaded video. This cannot be undone.';
    confirmBox.hidden = false;
    document.body.classList.add("is-locked");
    $("#confirmYes").focus();
  }
  function closeConfirm() {
    confirmBox.hidden = true;
    pendingDelete = null;
    document.body.classList.remove("is-locked");
  }
  $$("[data-cancel]", confirmBox).forEach(function (el) { el.addEventListener("click", closeConfirm); });
  $("#confirmYes").addEventListener("click", async function () {
    if (!pendingDelete) return;
    var p = pendingDelete;
    closeConfirm();
    setMsg(formMsg, "Deleting…");
    try {
      await API.del("/api/projects/" + encodeURIComponent(p.id));
      if (editingId === p.id) resetForm();
      setMsg(formMsg, "Project deleted.", "ok");
      await loadProjects();
    } catch (err) {
      setMsg(formMsg, err.message, "err");
    }
  });

  /* =============== PREVIEW MODAL =============== */
  var modal = $("#modal"), modalVideo = $("#modalVideo");
  function openModal(p) {
    $("#modalTitle").textContent = p.title || "Preview";
    $("#modalSub").textContent = [p.client, p.category].filter(Boolean).join(" · ");
    modalVideo.poster = p.poster_url || "";
    modalVideo.src = p.video_url || "";
    modal.hidden = false;
    document.body.classList.add("is-locked");
    var pr = modalVideo.play();
    if (pr && pr.catch) pr.catch(function () {});
  }
  function closeModal() {
    if (modal.hidden) return;
    modal.classList.add("is-closing");
    try { modalVideo.pause(); } catch (e) {}
    setTimeout(function () {
      modal.hidden = true;
      modal.classList.remove("is-closing");
      modalVideo.removeAttribute("src");
      modalVideo.load();
      document.body.classList.remove("is-locked");
    }, 200);
  }
  $$("[data-close]", modal).forEach(function (el) { el.addEventListener("click", closeModal); });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    closeModal();
    if (!confirmBox.hidden) closeConfirm();
  });
})();
