/* =========================================================
   nexvorai — public site behaviour
   ========================================================= */
(function () {
  "use strict";

  var API = window.NexvoraAPI;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------------- year ---------------- */
  var yearEl = $("#year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------------- sticky nav ---------------- */
  var nav = $("#nav");
  var onScroll = function () {
    if (nav) nav.classList.toggle("is-stuck", window.scrollY > 8);
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* ---------------- mobile menu ---------------- */
  var burger = $("#burger");
  var menu = $("#mobileMenu");
  function closeMenu() {
    if (!nav) return;
    nav.classList.remove("is-open");
    if (menu) menu.hidden = true;
    if (burger) { burger.setAttribute("aria-expanded", "false"); burger.setAttribute("aria-label", "Open menu"); }
  }
  function openMenu() {
    nav.classList.add("is-open");
    if (menu) menu.hidden = false;
    burger.setAttribute("aria-expanded", "true");
    burger.setAttribute("aria-label", "Close menu");
  }
  if (burger) {
    burger.addEventListener("click", function () {
      if (nav.classList.contains("is-open")) closeMenu(); else openMenu();
    });
  }
  if (menu) $$("a", menu).forEach(function (a) { a.addEventListener("click", closeMenu); });
  window.addEventListener("resize", function () { if (window.innerWidth > 860) closeMenu(); });

  /* ---------------- scroll reveal ---------------- */
  var revealObserver = null;
  if ("IntersectionObserver" in window && !reduceMotion) {
    revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (e, i) {
        if (!e.isIntersecting) return;
        var el = e.target;
        var delay = parseFloat(el.dataset.delay || 0) || Math.min(i * 70, 280);
        setTimeout(function () { el.classList.add("is-in"); }, delay);
        revealObserver.unobserve(el);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    $$(".reveal").forEach(function (el) { revealObserver.observe(el); });
  } else {
    $$(".reveal").forEach(function (el) { el.classList.add("is-in"); });
  }
  function observeReveal(el) {
    if (revealObserver) revealObserver.observe(el); else el.classList.add("is-in");
  }

  /* ---------------- animated counters ---------------- */
  function formatNumber(n) { return n.toLocaleString("en-US"); }

  function runCounter(el) {
    var target = parseFloat(el.dataset.target || "0");
    var suffix = el.dataset.suffix || "";
    if (reduceMotion) { el.textContent = formatNumber(target) + suffix; return; }
    var dur = 1600;
    var start = null;
    function frame(ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = formatNumber(Math.round(target * eased)) + suffix;
      if (p < 1) requestAnimationFrame(frame);
      else el.textContent = formatNumber(target) + suffix;
    }
    requestAnimationFrame(frame);
  }

  var metricsGrid = $("#metricsGrid");
  if (metricsGrid) {
    if ("IntersectionObserver" in window) {
      var mo = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          $$(".metric__num", metricsGrid).forEach(runCounter);
          mo.disconnect();
        });
      }, { threshold: 0.35 });
      mo.observe(metricsGrid);
    } else {
      $$(".metric__num", metricsGrid).forEach(runCounter);
    }
  }

  /* ---------------- desktop pointer parallax ---------------- */
  var heroVisual = $("#heroVisual");
  if (heroVisual && canHover && !reduceMotion) {
    var layers = $$("[data-depth]", heroVisual);
    var raf = null, tx = 0, ty = 0;
    window.addEventListener("mousemove", function (e) {
      var cx = window.innerWidth / 2, cy = window.innerHeight / 2;
      tx = (e.clientX - cx) / cx;
      ty = (e.clientY - cy) / cy;
      if (raf) return;
      raf = requestAnimationFrame(function () {
        raf = null;
        layers.forEach(function (l) {
          var d = parseFloat(l.dataset.depth) || 0;
          l.style.setProperty("transform", "translate3d(" + (tx * d * 260).toFixed(2) + "px," + (ty * d * 200).toFixed(2) + "px,0)");
        });
      });
    }, { passive: true });
  }

  /* ---------------- video modal ---------------- */
  var modal = $("#modal");
  var modalVideo = $("#modalVideo");
  var modalTitle = $("#modalTitle");
  var modalSub = $("#modalSub");
  var lastFocus = null;

  function openModal(project) {
    if (!modal) return;
    lastFocus = document.activeElement;
    modalTitle.textContent = project.title || "Project";
    modalSub.textContent = [project.client, project.category].filter(Boolean).join(" · ");
    modalVideo.poster = project.poster_url || "";
    modalVideo.src = project.video_url || "";
    modal.hidden = false;
    modal.classList.remove("is-closing");
    document.body.classList.add("is-locked");
    var play = modalVideo.play();
    if (play && play.catch) play.catch(function () { /* autoplay blocked — user can press play */ });
    $(".modal__close", modal).focus();
  }

  function closeModal() {
    if (!modal || modal.hidden) return;
    modal.classList.add("is-closing");
    try { modalVideo.pause(); } catch (e) {}
    setTimeout(function () {
      modal.hidden = true;
      modal.classList.remove("is-closing");
      modalVideo.removeAttribute("src");
      modalVideo.load();
      document.body.classList.remove("is-locked");
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }, 200);
  }

  if (modal) {
    $$("[data-close]", modal).forEach(function (el) { el.addEventListener("click", closeModal); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeModal(); });
  }

  /* ---------------- portfolio ---------------- */
  var grid = $("#workGrid");
  var empty = $("#workEmpty");
  var notice = $("#workNotice");
  var activeFilter = "All";
  var projects = [];

  var PLAY_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>';

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function buildCard(p) {
    var card = document.createElement("article");
    card.className = "card reveal";
    card.dataset.category = p.category || "";

    var poster = p.poster_url
      ? '<img src="' + esc(p.poster_url) + '" alt="" loading="lazy" decoding="async" />'
      : "";

    card.innerHTML =
      '<div class="card__media">' +
        poster +
        '<video muted loop playsinline preload="none" tabindex="-1" aria-hidden="true"></video>' +
        '<span class="card__scan"></span>' +
        (p.category ? '<span class="card__cat">' + esc(p.category) + "</span>" : "") +
        '<button class="card__play" type="button" aria-label="Play ' + esc(p.title) + '">' + PLAY_ICON + "</button>" +
      "</div>" +
      '<div class="card__body">' +
        '<h3 class="card__title">' + esc(p.title) + "</h3>" +
        (p.client ? '<p class="card__client">' + esc(p.client) + "</p>" : "") +
        (p.description ? '<p class="card__desc">' + esc(p.description) + "</p>" : "") +
      "</div>";

    var video = $("video", card);
    var media = $(".card__media", card);
    var loaded = false;

    // Lazy: attach the source (preload="metadata") only when the card nears the viewport.
    if ("IntersectionObserver" in window) {
      var vo = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting || loaded) return;
          loaded = true;
          video.preload = "metadata";
          // #t=0.1 makes the browser paint a real first frame without
          // downloading the whole file — keeps the grid from looking empty.
          video.src = p.video_url + "#t=0.1";
          vo.disconnect();
        });
      }, { rootMargin: "220px 0px" });
      vo.observe(card);
    } else {
      video.preload = "metadata";
      video.src = p.video_url + "#t=0.1";
    }

    video.addEventListener("loadeddata", function () { video.classList.add("is-ready"); });

    if (canHover) {
      media.addEventListener("mouseenter", function () {
        if (!video.src) { video.preload = "metadata"; video.src = p.video_url + "#t=0.1"; loaded = true; }
        card.classList.add("is-previewing");
        var pr = video.play();
        if (pr && pr.catch) pr.catch(function () {});
      });
      media.addEventListener("mouseleave", function () {
        card.classList.remove("is-previewing");
        try { video.pause(); video.currentTime = 0; } catch (e) {}
      });
    }

    $(".card__play", card).addEventListener("click", function (e) {
      e.preventDefault();
      try { video.pause(); } catch (err) {}
      openModal(p);
    });

    return card;
  }

  function render() {
    if (!grid) return;
    grid.innerHTML = "";
    var list = activeFilter === "All"
      ? projects
      : projects.filter(function (p) { return (p.category || "") === activeFilter; });

    if (!list.length) {
      if (empty) {
        empty.hidden = false;
        empty.textContent = projects.length
          ? "No projects in this category yet."
          : "No projects published yet — add the first one from the admin portal.";
      }
      return;
    }
    if (empty) empty.hidden = true;

    var frag = document.createDocumentFragment();
    list.forEach(function (p, i) {
      var card = buildCard(p);
      card.dataset.delay = String(Math.min(i * 70, 280));
      frag.appendChild(card);
    });
    grid.appendChild(frag);
    $$(".card.reveal", grid).forEach(observeReveal);
  }

  $$("#filters .chip").forEach(function (chip) {
    chip.addEventListener("click", function () {
      $$("#filters .chip").forEach(function (c) {
        c.classList.remove("is-active");
        c.setAttribute("aria-selected", "false");
      });
      chip.classList.add("is-active");
      chip.setAttribute("aria-selected", "true");
      activeFilter = chip.dataset.filter;
      render();
    });
  });

  function showNotice(html) {
    if (!notice) return;
    notice.hidden = false;
    notice.innerHTML = html;
  }

  async function loadProjects() {
    try {
      var data = await API.get("/api/projects");
      projects = (data && data.projects) || [];
      if (data && data.mode === "unconfigured") {
        showNotice(
          "<strong>Backend not configured yet.</strong> The site is live but Supabase environment variables are missing, " +
          "so no published projects can be loaded. Set <code>SUPABASE_URL</code> and <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel, then redeploy."
        );
      }
      render();
    } catch (err) {
      projects = [];
      if (grid) grid.innerHTML = "";
      if (empty) { empty.hidden = false; empty.textContent = "Work is temporarily unavailable."; }
      showNotice(
        "<strong>Couldn't reach the projects API.</strong> " + esc(err.message) +
        " The rest of the page still works — check that the <code>/api</code> routes are deployed and configured."
      );
    }
  }
  loadProjects();

  /* ---------------- contact form (mailto fallback) ---------------- */
  var form = $("#contactForm");
  var note = $("#formNote");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var name = $("#cName"), email = $("#cEmail"), brief = $("#cBrief");
      var ok = true;
      [name, email, brief].forEach(function (input) {
        var field = input.closest(".field");
        var valid = input.value.trim() !== "" && input.checkValidity();
        field.classList.toggle("is-invalid", !valid);
        if (!valid) ok = false;
      });
      if (!ok) {
        note.className = "form__note is-err";
        note.textContent = "Please add your name, a valid email and a short brief.";
        return;
      }
      var subject = "New project brief — " + name.value.trim();
      var body =
        "Name: " + name.value.trim() + "\n" +
        "Email: " + email.value.trim() + "\n\n" +
        "Brief:\n" + brief.value.trim() + "\n";
      window.location.href =
        "mailto:nexvoraidot@gmail.com?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
      note.className = "form__note is-ok";
      note.textContent = "Opening your mail app with the brief ready to send. If nothing opens, email hello@nexvorai.com directly.";
    });
  }
})();
