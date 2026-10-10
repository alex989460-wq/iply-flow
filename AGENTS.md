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
- Embed reviewed homepage preview imagery when the installed static asset allowlist does not serve its path, keeping original branding bytes and operational handlers unchanged rather than weakening the allowlist.
- Keep homepage illustration navigation in a self-contained, site-home-scoped demo with fictional artwork and in-memory state; never connect demo interactions to account, playlist, payment or playback handlers.
- Keep ZUI backup decompression bounded and test oversized valid archives plus tamper rejection; accumulated static releases can exceed the upstream bound without indicating a wrong encryption key.
- Organize ZUI admin navigation by ordering existing page buttons and adding presentation labels only; preserve all operational listeners and recognize late-loaded admin pages without changing authorization.
- Keep ZUI license Pix as a separate bridge (deploy/zui-efi-pix) wired through ZUI's external HMAC provider and confirmed by polling Efí, so ZUI upgrades don't overwrite it and Super Gestor's Efí webhook stays untouched.
