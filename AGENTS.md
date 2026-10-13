# Architecture Rules

- Build Super Gestor for supergestor.top with the VPS env (/opt/supergestor/src-app/.env.production values exported in the shell) and confirm the bundle contains only https://supergestor.top before deploying; a sandbox build silently points the live site at the stale Cloud database.
- Subdirectories have their own AGENTS.md (deploy/AGENTS.md holds all ZUI/VPS rules); read it before changing files there.
- Keep ZUI platform availability in the isolated Pool metadata module and render the public catalogue from its validated endpoint; never infer installed-device identity from availability settings.
- Guard ZUI partner-code deletion and edits to bound codes before operational handlers, preserving audited DNS migrations and existing playback rules.
