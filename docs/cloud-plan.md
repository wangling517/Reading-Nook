# Family accounts and sync implementation plan

Goal: one parent account shares its reading records and private audio across devices. Keep offline saving, existing stories, word ranges and complete backups.

The approved free family pilot uses an administrator-provisioned account, not public registration or email recovery. Use Supabase Free; no paid upgrades or SMTP subscription. Canonical source is C:/Users/18652/Desktop/学习agent/阅读小屋; this folder is an isolated release checkout.

1. Create `supabase/setup.sql`: owner RLS, explicitly granted read access, atomic versioned save RPC with retry IDs, private audio storage. SQL must work when automatic grants are disabled. Verify foreign and anonymous requests are rejected.
2. Bundle the official Supabase browser client locally. Add `cloud-config.js` (public URL/key only) and `cloud-api.js` for authenticated snapshot and immutable audio transfer.
3. Extend `store.js` with per-account databases and durable synchronization metadata. Add `sync-model.js` and `sync.js`: dirty generations, compare-and-swap pulls, safe retries, explicit conflicts, local-only drafts/backup markers.
4. Add `account-ui.js` and `account.css`; integrate login, logout, status, migration and conflict handling with `app.js`. Keep settings and login visually consistent with the existing mobile app. Retain old data until an explicit migration.
5. Verify with `node --test tests/*.test.js`; browser integration covers independent devices, login/logout, local persistence, offline audio, conflicts and refreshed sessions. Use synthetic data. Live backend verification needs SQL installation and test account configuration; never claim mock tests prove production isolation.
6. Restrict the service worker to app assets in its own path and bump the cache. Build an allowlisted static deployment package. Copy tested source back to canonical folder.
7. Push main to wangling517/Reading-Nook, enable Pages and verify HTTPS at /Reading-Nook/. Preserve existing records; ask for missing backend setup only after creating concrete runnable configuration.
