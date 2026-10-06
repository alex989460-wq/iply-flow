# ZUI 1.2.10 security review — 2026-10-06

## Scope and evidence
- Reviewed the admin-api tree fetched from the deployed server; systemd ExecStart points to `/opt/zuiplayer/admin-api/server.mjs`, WorkingDirectory `/opt/zuiplayer`.
- Frontend release 1.2.10, API release 1.2.7, protocol 7; versions intentionally independent.
- Service stayed on the same PID during update; 30 API files and both frontend configuration files passed before/after SHA-256 checks.
- Public probes: unauthenticated admin devices 401, local-admin login 403, encoded app traversal 403, server source and app environment-file requests 404.
- Reviewed device/session authentication, account ownership, provider fetch private-network filtering, static file serving, webhook signatures, backup controls and updater integrity checks.

## Configuration verified
- TRUST_PROXY_IPS includes loopback nginx addresses.
- ALLOW_LOCAL_ADMIN and ALLOW_PRIVATE_PROVIDERS unset.
- COOKIE_SECURE enabled; app listener bound to loopback.

## Findings and limits
No exploitable vulnerability was confirmed in the reviewed paths; this is not a guarantee of security.
The existing CSP permits inline scripts. No concrete injection was found; migrating to nonces/hashes is defense in depth and needs compatibility tests for the existing site/admin inline scripts and TV app. No CSP, CORS, authentication, payment or device-identity changes were made.
No authenticated customer/admin operations or live payment/playback tests were performed. The preexisting app diagnostic “API não configurada” remains; local interface mounts and opens successfully in Chromium, not verified on an actual TV.

## Deployment and rollback
Frontend applied with the supplied verified updater, preserving remote-config.js/local-panel.js and old hashed chunks; published entry HTML last without restarting services.
Server `/root/zui1210-backup-path` records the site backup directory; updater stores the frontend rollback under `/opt/zui-frontend-backups/`.
The site-only logo/language override is tracked alongside other reviewed presentation overrides.