# Contributing

Please include the macOS version, Node version, deck model and a reproducible description in bug reports. Remove personal task titles, device serials and paths. Never attach credentials, Codex session files or databases.

Use Node >=22.13, run `npm ci`, `npm test` and `npm audit`. Tests must remain hardware-free and must mock all application-control callbacks. Add a regression for a behavior fix; do not weaken a failing check. Keep direct mode independent of app patching and app restarts.

Pull requests should describe the problem, resulting behavior, checks performed and any untested hardware/app behavior. Preserve MIT attribution and third-party notices.
