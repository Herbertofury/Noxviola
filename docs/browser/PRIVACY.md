# Privacy and account boundaries

- Browser sessions use named persistent Electron partitions. This is implementation wiring; native isolation has not yet been proven. Avoid sensitive real accounts in the preview.
- Local favorites and account inventory are **plaintext metadata** in the per-user application-data directory. They are not an encrypted vault. Backups can contain names, handles, URLs and notes; keep them private.
- The account atlas accepts only metadata. It does not save passwords, tokens, cookies, TOTP secrets or recovery codes. Password-manager checkboxes are owner-maintained tracking markers, not proof of storage or integration. Do not enter secrets into any text field.
- No cloud sync, account creation, new grants or credential import. Export is explicit and local. The app-wide favorites library is shared across browser identities, not a separate confidential store for each identity.
- Public source contains synthetic test records only. The owner's offline account atlas inspired requirements; its records and files are not distributed.
- Current site permission requests default to deny. There is no blanket permission bypass, certificate-warning bypass, sandbox disabling or privileged remote-page bridge.
- Future supported password-manager/OS-secret-storage integration must be reviewed separately, with encryption, lock and origin-bound autofill tests. No custom crypto or secure-storage claims from this metadata feature.
