# Architecture Rules

- Keep ZUI Player public-site presentation isolated from activation, payment, playlist and admin logic; deploy only reviewed static assets with a rollback copy to prevent functional regressions.
- ZUI version upgrades must exclude installed public-site assets from overwrite/deletion, and admin layout overrides must load only on admin pages, so bundled releases cannot regress the reviewed website.
- Track ZUI web-app and API versions separately; frontend-only releases must not relabel or restart the API, because their compatible versions can legitimately differ.
- Keep deployable ZUI presentation overrides in deploy/zui-presentation and scope admin selectors to site-admin, so reviewed styling is reproducible without changing operational handlers.
- Embed reviewed ZUI presentation CSS and self-contained font faces in the existing served HTML when custom asset routes are unavailable, so typography works under the existing security policy without relaxing it.