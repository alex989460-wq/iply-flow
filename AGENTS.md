# Architecture Rules

- Build Super Gestor for supergestor.top with the VPS env (/opt/supergestor/src-app/.env.production values exported in the shell) and confirm the bundle contains only https://supergestor.top before deploying; a sandbox build silently points the live site at the stale Cloud database.
- Subdirectories have their own AGENTS.md (deploy/AGENTS.md holds all ZUI/VPS rules); read it before changing files there.
