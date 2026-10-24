# Epoch

A Pomodoro study timer with stats. It runs entirely in your browser: no account, no server,
your history stays on your device. Installable as an app and works offline.

> Status: early development. The timer engine is done; the interface is next.

## How it works

```
src/engine/     Timer logic in plain TypeScript, no UI code
  countdown.ts    one countdown, computed from timestamps (stays accurate in background tabs)
  pomodoro.ts     focus → short break cycle, long break every N sessions, session records
src/            React interface (in progress)
tools/          Python build tooling (alarm sound synthesis, more to come)
tests/          Vitest tests for the engine
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

Python tooling lives in [`tools/`](tools/README.md):

```bash
uv run --project tools pytest tools
uv run --project tools epoch-chime --out public/sounds
```

## Design

The visual base is [`DESIGN.md`](DESIGN.md), a dark, single-accent design system modelled on
Linear's design language, refined for app screens. Epoch is not affiliated with Linear.

## License

[MIT](LICENSE). Third-party material is listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
