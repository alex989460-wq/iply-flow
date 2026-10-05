# Architecture Rules

- Keep ZUI Player public-site presentation isolated from activation, payment, playlist and admin logic; deploy only reviewed static assets with a rollback copy to prevent functional regressions.
- ZUI version upgrades must exclude installed public-site assets from overwrite/deletion, and admin layout overrides must load only on admin pages, so bundled releases cannot regress the reviewed website.