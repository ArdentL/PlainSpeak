# PlainSpeak

[GitHub](https://github.com/ArdentL/PlainSpeak) · [下载 / Releases](https://github.com/ArdentL/PlainSpeak/releases)

English · [中文](README.md)

**Readable local translations for DeepSeek Harness answers.** By default, keep the original answer with a muted translation below each complete assistant paragraph. Clear-writing instructions improve the first draft by default.

v0.7.0 is a **public preview for Windows and DeepSeek Harness**, with installers for web and desktop profiles. This round used the installed `@deepseek-ai/dsh 0.2.1-rc.5` desktop Host and its web frontend; see the validation scope below and [publication status](docs/publishing.md). Distribution uses a source ZIP and local installer, with no marketplace listing or published npm plugin.

## Install and start

Use an existing working Harness installation and Python 3.10+; Harness's bundled Python is also supported. For desktop installation, launch Harness once to initialize its desktop profile, extract the source ZIP, then run:

```powershell
.\install-harness.ps1 --client desktop
```

The installer activates the native bundle in the desktop profile, preserving other JSON fields and existing user YAML bytes. Close and restart Harness Desktop to load it; no additional patch argument is needed.

For the web profile, the default installation command remains:

```powershell
powershell -ExecutionPolicy Bypass -File .\install-harness.ps1
```

This installs a hash-verified llama.cpp runtime and the default **Hy-MT2 1.8B Q4_K_M model, approximately 1.13 GB**. No Ollama, pip, npm, administrator rights or PATH changes are required. The app/data directory defaults to `%LOCALAPPDATA%\PlainSpeak`. The installer adds its own plugin files while preserving existing Harness settings, credentials and chats.

The installer does not launch Harness. For the web profile, start it with the generated overlay:

```powershell
dsh --profile web --patch "$env:LOCALAPPDATA\PlainSpeak\harness.patch.yml"
```

An official GGUF can be reused with `--source`; installation and profile locations are configurable. See [installation](docs/harness-install.md). The first translation starts the local model; later UI loading does not download it again.

## Use

Open **PlainSpeak 设置** beside the conversation title to control automatic translation, hiding originals, language, clear-writing instructions and record saving. Simplified Chinese is the default; English, Japanese, Korean, French, German and Spanish are also available. Writing-rule changes apply to the next assistant reply.

The host's original rendering remains in place; translations also use its native Markdown component. Assistant prose, headings and prose in simple table cells can be translated, with emphasis, links, inline code and formulas rendered as Markdown. Code blocks, technical-only values, tool output, user messages, thinking and complex nested cells remain unchanged. Blocks containing unsupported images, SVG, audio, video or other media also remain intact. The final streaming block waits for completion. Partial source retention and request failures have visible states.

Round trips now include nearby source prose from the same assistant answer (up to 1600 preceding and 700 following UTF-16 units). Both passes receive that background, and cache keys include it. Reasoning, tool output, code, media, other answers and host-hidden content are excluded. Neighbor changes do not continuously retrigger live translation; completion allows at most one final-context refresh. Outputs remain per paragraph. Local 1.8B Q4 trials improved a last-bus heading and place names, but still misread an elliptical “not getting off” line as “not taking the bus.”

Plain prose numbers, percentages, scientific notation and occurrence counts are not guarded. Number spellings can change. Code, links and formulas remain protected as complete literals.

Paragraphs use stacked comparison, with identical source and translated text shown only once. Tables show one version at a time, defaulting to translation; use **译文 / 原文** above a table to switch without translating again.

Enable **隐藏原文** (hide originals) to show only ready paragraph translations and hide table comparison controls. Originals stay visible while translation is pending or fails. This locally saved setting is off by default. Disabling it restores paragraph comparison; disabling automatic translation restores all originals without changing Harness chats.

Settings and up to 1,000 paragraph records persist locally in `ui/records.sqlite3` across refreshes and restarts. Records contain source, output, language, model, time and processing report. Matching source, background, route and model can reuse successful guarded results. The panel supports viewing, JSON export and two-step clearing. Disabling saving stops persistent writes and historical reuse; existing records can be cleared separately. Records do not alter Harness chats or their model context, are not uploaded, and are excluded from source releases.

Clearing cancels old paragraph timers and requests on the current page, while preserving displayed translations and allowing new text to be processed. Disabling translation, changing language or unloading also cancels old work. An already started provider call is allowed to return; no subsequent call is started. Record clearing and eviction use SQLite `secure_delete`, with legacy free pages reclaimed. This addresses the current database file, not backups, snapshots or physical storage erasure.

## Models

```powershell
& "$env:LOCALAPPDATA\PlainSpeak\plainspeak.cmd" models list
& "$env:LOCALAPPDATA\PlainSpeak\plainspeak.cmd" models install hy-mt2-7b-q4
& "$env:LOCALAPPDATA\PlainSpeak\plainspeak.cmd" models use hy-mt2-7b-q4
& "$env:LOCALAPPDATA\PlainSpeak\plainspeak.cmd" models status
```

The [catalog](docs/models.md) contains six official Tencent variants: 1.8B and 7B, each in Q4/Q6/Q8, with pinned revisions, sizes and SHA-256 hashes. The small default has been run; upgrade quality has not been compared in this project.

## Preview scope

- On the Windows `0.2.1-rc.5` desktop Host and its web frontend, Hy-MT2 Q4 completed 12/12 paragraph round trips. After saving hide-originals and refreshing, all 12 outputs remained ready, all 12 source blocks were hidden, Python code `print("hello")` was unchanged, and the record panel showed 12 entries. API responses were 200, with no console errors. The Electron shell GUI has not been accepted because the available tools could not inspect it.
- Linux/macOS acceptance has not been run. Earlier version evidence remains in the verification document.
- Setup and inference reused local model weights. A clean-machine, full network installation has not been exercised.
- Translation can change meaning; code and literal guards do not replace content review.

See [verification](docs/verification.md) and [CHANGELOG](CHANGELOG.md). Other host adapters are planned. Existing Codex/Claude skill and MCP code remains an [advanced experiment](docs/clients.md#advanced-experimental-skill--mcp), outside the initial UI support scope.

## Development and licensing

Original code and skills use [MIT](LICENSE). The adapter uses official host slots and components without copying their implementation. Models, runtimes and third-party materials retain their own licenses: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Source releases include no weights, runtime binaries or local records.

[Clients and developer entry points](docs/clients.md) · [Skill catalog](docs/skill-catalog.md) · [Publishing](docs/publishing.md)
