# Architecture Rules

- Build Super Gestor for supergestor.top with the VPS env (/opt/supergestor/src-app/.env.production values exported in the shell) and confirm the bundle contains only https://supergestor.top before deploying; a sandbox build silently points the live site at the stale Cloud database.
- Subdirectories have their own AGENTS.md (deploy/AGENTS.md holds all ZUI/VPS rules); read it before changing files there.
- Keep ZUI platform availability in the isolated Pool metadata module and render the public catalogue from its validated endpoint; never infer installed-device identity from availability settings.
- Keep public partner-page presentation in the isolated page generator and its shared stylesheet; deploy page assets atomically with rollback and protected app/API hashes so catalogue polish cannot alter playback.
- Guard ZUI partner-code deletion and edits to bound codes before operational handlers, preserving audited DNS migrations and existing playback rules.
- Keep ZUI admin playlist management in deploy/zui-admin-playlists (server route via apply-server.py, inline UI via apply-admin.py) reusing owns/resolveSourceInput/saveDb, so licence reconciliation and partner bindings stay authoritative; re-apply after API/admin upgrades.
- Report ZUI presence through the shared read-only presence helper using recent device contact or a valid playback lease, and refresh device lists without interrupting open editors; playback-only clients must not appear offline.
