# epoch-tools

Python tooling for Epoch. The app itself is TypeScript (browsers only run JavaScript);
these scripts run on your machine at build time. Managed with [uv](https://docs.astral.sh/uv/).

```bash
uv run --project tools epoch-chime --out public/sounds   # regenerate alarm sounds
uv run --project tools pytest tools                       # tests
uv run --project tools ruff check tools                   # lint
```

| Command | What it does |
|---|---|
| `epoch-chime` | Synthesises the end-of-phase chimes as WAV files, so the app ships no third-party audio. |
