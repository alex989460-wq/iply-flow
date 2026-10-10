# Architecture Rules

- Keep ZUI Player public-site presentation isolated from activation, payment, playlist and admin logic; deploy only reviewed static assets with a rollback copy to prevent functional regressions.
- ZUI version upgrades must exclude installed public-site assets from overwrite/deletion, and admin layout overrides must load only on admin pages, so bundled releases cannot regress the reviewed website.
- Track ZUI web-app and API versions separately; frontend-only releases must not relabel or restart the API, because their compatible versions can legitimately differ.
- Promote a reviewed ZUI web release by copying its static dependencies before atomically replacing the /app/ entry HTML, with protected site/API hashes and a rollback copy; this preserves the public site and avoids restarting operational services.
- Keep deployable ZUI presentation overrides in deploy/zui-presentation and scope admin selectors to site-admin, so reviewed styling is reproducible without changing operational handlers.
- Keep official header and illustrated-app branding and native language-option contrast in a site-scoped presentation override, so installed app assets and operational handlers remain unchanged.
- Embed reviewed ZUI presentation CSS and self-contained font faces in the existing served HTML when custom asset routes are unavailable, so typography works under the existing security policy without relaxing it.
- Build Super Gestor for supergestor.top with the VPS env (/opt/supergestor/src-app/.env.production values exported in the shell) and confirm the bundle contains only https://supergestor.top before deploying; a sandbox build silently points the live site at the stale Cloud database.
- Apply ZUI motion as a site-scoped CSS-only override with reduced-motion support and keep security headers isolated to reviewed Nginx locations, because site polish must not modify device authentication or playback compatibility.
