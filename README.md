# Epoch

A Pomodoro study timer with stats. It runs entirely in your browser: no account, no server,
your history stays on your device. Installable as an app and works offline.

**Use it:** https://epoch.mouhannedsghaier2004.workers.dev

> Status: first release: timer, stats, settings, backups, sounds and notifications, light and
> dark themes, offline install.

## How it works

```
src/engine/     Timer logic in plain TypeScript, no UI code
  countdown.ts    one countdown, computed from timestamps (stays accurate in background tabs)
  pomodoro.ts     focus → short break cycle, long break every N sessions, session records
  schedule.ts     the next phases with projected clock times
src/storage/    localStorage (settings, running timer) and IndexedDB (session history)
src/app/        the timer store, browser wiring (ticks, tab sync) and React hooks
src/alerts/     end-of-phase chime and notification, played by exactly one open tab
src/stats/      day totals, streaks, ranges, weekday and hour-of-day breakdowns
src/ui/         the React screens
tools/          Python tooling: study report, chimes, icons, sample history
fixtures/       sample-backup.json, written by tools/ and used in development and tests
tests/          Vitest tests
```

The timer never counts ticks. It stores when the current phase ends and derives the remaining
time from the clock, so throttled tabs, sleep and page refreshes don't make it drift. The engine
is a pure reducer: given a state, an action and the current time, it returns the next state and,
when a phase ends, a record of the session for stats.

## Development

Requires Node 22+ and, for the tooling, [uv](https://docs.astral.sh/uv/).

```bash
npm install
npm run dev        # local dev server
npm test           # engine tests
npm run build      # production build into dist/
```

To see the interface with realistic data, open the dev server with
`http://localhost:5173/?seed&at=15:20`: `seed` loads three weeks of sample history into this
browser, and `at` pins the clock to that time today. Both exist only in development builds.

Python tooling lives in [`tools/`](tools/README.md). The one you'd use day to day is the study
report, which reads a backup downloaded from Settings:

```bash
uv run --project tools epoch-stats epoch-backup-2026-10-24.json --days 30
```

The others build the app's assets (`epoch-chime`, `epoch-icons`, `epoch-sample`) and are covered by
`uv run --project tools pytest tools`. The app and the report compute the same figures; a contract
test in each language checks them against `fixtures/sample-stats-30d.json`.

## Deployment

Epoch is a static site: `npm run build` writes everything to `dist/`. It is served by Cloudflare
Workers as static assets ([`wrangler.jsonc`](wrangler.jsonc), no server code), connected to this
repository so every push to `main` deploys.

| Setting in Cloudflare | Value |
|---|---|
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Root directory | `/` |

[`public/_headers`](public/_headers) sets the caching and security headers, including a strict
Content Security Policy. To try the built site with those headers locally:
`npm run preview:headers` (serves on port 4175). `npx wrangler deploy --dry-run` checks the
deploy config without uploading.

## Design

The visual base is [`DESIGN.md`](DESIGN.md), a single-accent design system modelled on
Linear's design language, refined for app screens, in a dark and a light theme (Settings >
Appearance: System, Light or Dark). Epoch is not affiliated with Linear.

## License

[MIT](LICENSE). Third-party material is listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
