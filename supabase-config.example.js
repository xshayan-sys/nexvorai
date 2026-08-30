/* =========================================================
   nexvorai — browser-safe Supabase values (OPTIONAL)
   ---------------------------------------------------------
   Copy to supabase-config.js only if you want the public page
   to read Supabase directly instead of going through
   GET /api/projects.

   The site works fully WITHOUT this file — every read goes
   through the serverless API by default.

   Only ever put publishable values here.
   NEVER put SUPABASE_SERVICE_ROLE_KEY in this file.
   ========================================================= */
const SUPABASE_URL = "https://your-project.supabase.co";
const SUPABASE_ANON_KEY = "your-anon-public-key";
const VIDEO_BUCKET = "videos";
