# Architecture Rules

- Keep ZUI Player public-site presentation isolated from activation, payment, playlist and admin logic; deploy only reviewed static assets with a rollback copy to prevent functional regressions.