# nexvorai — portfolio site + password-only admin portal

A production-ready portfolio site for a video editing / post-production studio, with a
password-only admin console that publishes videos to **every** visitor (shared backend,
not localStorage).

- **Public site** — `index.html` — hero, animated metrics, filterable video work grid, services, process, contact.
- **Admin console** — `admin.html` — one password, upload video from phone gallery or desktop, add / edit / delete projects.
- **Backend** — Vercel serverless functions in `/api`, Supabase Postgres for records, Supabase Storage for video files.
- **Zero npm dependencies.** No build step. Zero-config Vercel deploy.

---

## File tree

```
nexvorai/
├── index.html                   # public site (no admin link anywhere)
├── admin.html                   # admin portal — reachable only by typing /admin.html
├── package.json                 # no dependencies; "npm run dev" for local preview
├── server.js                    # local dev server only (not used on Vercel)
├── .env.example                 # server-side env vars to copy into Vercel
├── supabase.sql                 # database + storage bucket + RLS policies
├── supabase-config.example.js   # browser-safe values only (optional)
├── README.md
├── assets/
│   ├── logo.svg                 # replace this file to swap the logo
│   ├── favicon.svg
│   └── samples/                 # demo clips + posters (delete once you upload real work)
├── css/
│   ├── styles.css               # public site design system
│   └── admin.css                # admin console styles
├── js/
│   ├── api.js                   # tiny fetch wrapper (no secrets, no localStorage auth)
│   ├── main.js                  # public site: reveal, counters, filters, lazy video, modal
│   └── admin.js                 # admin: login, upload w/ progress, CRUD
└── api/
    ├── _lib/
    │   ├── http.js              # CORS, JSON helpers, error handling
    │   ├── auth.js              # signed HttpOnly session cookie, password check
    │   └── store.js             # Supabase REST + Storage access (service role, server only)
    ├── login.js                 # GET session status · POST password login
    ├── logout.js                # POST clears the session cookie
    ├── projects.js              # GET public list · POST create (admin)
    ├── projects/[id].js         # PUT update (admin) · DELETE remove (admin)
    └── upload-url.js            # POST signed upload target (admin)
```

---

## 1. Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** → **New query**, paste the whole contents of `supabase.sql`, and run it.
   This creates the `projects` table, turns on row level security, allows anonymous
   read-only access, creates the public `videos` storage bucket, allows public playback,
   and keeps every write restricted to the server-side service role.
3. Go to **Project Settings → API** and copy:
   - **Project URL** → `SUPABASE_URL`
   - **service_role** secret key → `SUPABASE_SERVICE_ROLE_KEY`
4. Go to **Authentication → Providers → Email** and turn **Enable sign ups** off.
   The site never uses Supabase Auth — this just guarantees nobody can create an account.

The `projects` table columns: `id`, `title`, `client`, `category`, `description`,
`video_url`, `poster_url`, `created_at`, `updated_at`.

---

## 2. Vercel environment variables

Deploy the folder to Vercel (drag-and-drop, Git import, or `vercel`). Vercel detects the
root `api/` folder automatically — **there is no `vercel.json` and no custom runtime**, so
the `now-php` / invalid-runtime errors cannot occur.

Then in **Project → Settings → Environment Variables**, add these four for *Production*,
*Preview* and *Development* (values come from `.env.example`):

| Name | Value |
| --- | --- |
| `ADMIN_PASSWORD` | `Nexvorai109$$` |
| `SESSION_SECRET` | a long random string, 32+ characters |
| `SUPABASE_URL` | `https://your-project.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | the service_role secret from Supabase |

Generate a session secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

**Redeploy after adding variables** — Vercel only injects them at build/run time.

Security notes that are already enforced in the code:

- The service-role key exists **only** inside `/api` functions. It is never sent to the browser.
- The password is compared server-side with a timing-safe comparison. It is never in frontend JS.
- The session is a signed, `HttpOnly`, `Secure`, `SameSite` cookie with an 8-hour lifetime.
- `localStorage` is not used for authentication or for the project database.
- Public visitors get read-only access; create / update / delete / upload all require the session.

---

## 3. Admin login

1. Go to `https://your-domain.com/admin.html` — type the path manually. There is
   deliberately **no admin link** in the public navigation or footer, and the page is `noindex`.
2. Enter the password (`Nexvorai109$$` by default) and press **Unlock console**.
3. To change the password later, edit `ADMIN_PASSWORD` in Vercel and redeploy. Nobody can
   self-register or reset it — there is exactly one password.
4. **Log out** clears the cookie immediately.

---

## 4. Uploading a video from your phone gallery

1. Open `/admin.html` on your phone and unlock the console.
2. Fill in **Project title** and **Client or descriptor**, pick a **Category**
   (Social, Brand Film, Motion, Creator), and optionally a one-line description.
3. Tap **Choose video from gallery or files**. On iPhone this opens Photos / Files; on
   Android it opens Gallery / Files. MP4 (H.264) is preferred; MOV, WebM and M4V also work.
4. The filename and size appear, then a live **progress bar** as the file uploads straight
   to Supabase Storage through a short-lived signed URL.
5. Optionally add a **thumbnail / poster image** (JPG, PNG, WebP) so the card shows a still
   before the video loads.
6. Tap **Publish project**. It appears instantly on the public site for every visitor, on
   every browser and device.

**Editing:** press the pencil on any row — every field pre-fills. Leave the file pickers
empty to keep the existing video and poster, or choose new files to replace them.

**Deleting:** press the trash icon, then confirm. The database row and the uploaded video
file are both removed.

**Recommended exports:** H.264 MP4, AAC audio, `faststart` enabled, 1080p or less,
under ~50 MB per clip for snappy loading. The public grid uses `preload="metadata"` and
lazy loading, so no video downloads fully until someone presses play.

---

## 5. Local development

```bash
npm run dev      # http://localhost:3000
```

`server.js` is a dependency-free dev server that serves the static files and routes
`/api/*` to the same handler files Vercel uses. It reads `.env` if present.

To try the console without Supabase, start it in demo mode:

```bash
NEXVORAI_LOCAL_STORE=1 npm run dev
```

Projects are then kept in `.data/projects.json` and uploads in `uploads/` — both
gitignored, and neither is used in production.

---

## 6. Replacing the logo

Overwrite `assets/logo.svg` with your own file. Keep the `viewBox` roughly square and use
`currentColor` for strokes if you want it to follow the theme. `assets/favicon.svg` is a
simplified version of the same mark.

---

## 7. Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| Amber "Backend not configured yet" banner on the public site | `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is missing in Vercel. Add both, then redeploy. The site still renders — it never goes blank. |
| "Admin login is not configured" | `ADMIN_PASSWORD` is missing, or `SESSION_SECRET` is shorter than 16 characters. |
| "Incorrect password." | Check for a trailing space in the Vercel value. The default is `Nexvorai109$$` — the two `$$` are part of it. If you set it via a shell, quote it: `'Nexvorai109$$'`. |
| Login succeeds then immediately logs out | The session cookie was blocked. Use the admin portal on the same domain as the API (the normal deployment), not through a third-party embed or iframe. |
| Upload fails with 401 | Session expired after 8 hours. Reload `/admin.html` and unlock again. |
| Upload fails with 415 | Unsupported file type. Export as MP4 / MOV / WebM / M4V. |
| Upload starts then stalls | The file is very large. Compress to 1080p H.264 under ~50 MB, or upload over Wi-Fi. |
| Videos do not play on iPhone | The clip must be H.264 + AAC in an MP4 container. Re-export; some HEVC and ProRes files will not play in Safari. |
| Project saved but not visible to other people | Confirm `supabase.sql` ran fully — the anonymous read policy on `projects` and the public read policy on the `videos` bucket must both exist. |
| Cards show a poster but the video never loads | The storage bucket is not public. Re-run the bucket section of `supabase.sql`. |
| `now-php` or "invalid runtime" error on Vercel | This project has no `vercel.json` at all. If you added one, delete it — Vercel's zero-config Node runtime is what this expects. |
| 404 on `/api/projects` | The `api/` folder must sit at the repository root, not inside a subdirectory. |
| Changes not showing after deploy | Hard-refresh, or check that Vercel built the latest commit. |

---

## Environment reference

`.env.example` (server-side only — never shipped to the browser):

```
ADMIN_PASSWORD=Nexvorai109$$
SESSION_SECRET=replace-with-a-long-random-secret
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=keep-this-only-on-the-server
```

`supabase-config.example.js` holds browser-safe values only (`SUPABASE_URL`,
`SUPABASE_ANON_KEY`, `VIDEO_BUCKET`). The site does not need it — all Supabase access goes
through the server — but it is there if you ever add a direct client-side read.
**Never put the service-role key in that file.**
