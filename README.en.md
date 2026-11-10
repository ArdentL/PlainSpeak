# PlainSpeak

[GitHub](https://github.com/ArdentL/PlainSpeak) · [Releases](https://github.com/ArdentL/PlainSpeak/releases) · English · [中文](README.md)

**[See 10 real side-by-side examples →](docs/comparisons/README.md)**: untouched DeepSeek responses versus clear-writing rules plus local round trips, with full outputs, intermediate drafts, and observed regressions. The examples are in Chinese.

**Make DeepSeek Harness answers easier to read.**

LLM replies often suffer from stiff phrasing, wordy filler, and repetitive defensive disclaimers. PlainSpeak makes responses easier to read in two ways:

1. **Default plain-writing rules**: Injects clear-expression prompts to reduce filler and hedging in drafts, taking effect starting from the next assistant reply.
2. **Paragraph-by-paragraph local back-translation**: Uses a local small translation model—with adjacent paragraph context from the same reply—to translate prose through another language and back, such as Chinese → English → Chinese.

Public preview **v0.7.0** targets **Windows + DeepSeek Harness**, supporting both `desktop` and `web` profile installations. The web frontend hosted by the desktop Host has been verified in live testing (the native Electron window shell has not yet been verified). Codex and Claude Code entries remain experimental developer skill / MCP integrations (see [Clients Guide](docs/clients.md)) without an automatic translation UI.

## How It Looks and Works

- **Stacked paragraph comparison**: Keeps the original text by default and renders a lighter translation directly beneath each completed assistant paragraph. When "Hide original" is enabled, completed paragraphs show only the translation (while paragraphs still translating or failing keep the original text visible).
- **Tables and code blocks**: Tables display translated text by default with a whole-table "Translation / Original" toggle above the table. Code blocks, inline code, links, math formulas, tool outputs, thinking traces, and blocks with complex media are left untouched.
- **Non-destructive to chat history**: Translations and display toggles only affect the UI layer and local cache. PlainSpeak never rewrites the raw conversation saved by Harness or feeds translations back into model context.
- **Managed local inference**: Defaults to Tencent's **Hy-MT2 1.8B Q4_K_M** model (~1.13 GB) running on a managed `llama.cpp` runtime. You do not need Ollama, pip, or npm. The model and runtime are downloaded once during initial setup, and subsequent inference in the default mode runs locally (configuring an optional external provider will send requests to that provider).

> **Note**: Back-translation can alter meaning. PlainSpeak is a reading aid and is not guaranteed to fix factual or comprehension errors in the original reply. Always check the original text when verifying critical details.

## Installation and Launch (Windows)

**Prerequisites**:

- A working DeepSeek Harness installation
- Python 3.10+ (the installer automatically detects system Python or the Python bundled with Harness; no admin rights or PATH edits required)

PlainSpeak is currently installed from the source archive (it is not yet published on PyPI, npm, or a host marketplace). Download and extract the source ZIP from [Releases](https://github.com/ArdentL/PlainSpeak/releases), then open PowerShell in the extracted directory:

### Option 1: Desktop Profile

1. Launch Harness Desktop once to initialize its desktop profile, then **close Harness**.
2. Run the installer from the extracted source directory:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\install-harness.ps1 --client desktop
   ```
3. Once the script finishes setting up the plugin, runtime, and default model, **restart Harness Desktop**. The plugin loads automatically.

### Option 2: Web Profile

1. Run the default installer from the extracted source directory:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\install-harness.ps1
   ```
2. The installer does not launch the host. Start Harness Web with the generated patch file:
   ```powershell
   dsh --profile web --patch "$env:LOCALAPPDATA\PlainSpeak\harness.patch.yml"
   ```

By default, application files and models are stored in `%LOCALAPPDATA%\PlainSpeak`. To reuse an existing official GGUF file or customize directories, see the [Installation Guide](docs/harness-install.md).

## Usage and Settings

Click **PlainSpeak 设置** (Settings) next to the conversation title in Harness to open the control panel:

- **Display controls**: Toggle automatic translation and "Hide original" at any time. Turning them off immediately restores the original text.
- **Output language**: Choose Simplified Chinese (default), English, Japanese, Korean, French, German, or Spanish as the translation output language.
- **Clear-expression rules**: Enable or disable writing rules; changes apply starting from the next assistant reply.
- **Local records**: Saves up to 1,000 translated paragraph records locally so translations persist across page refreshes and restarts. From the panel, you can disable record saving, export records as JSON, or clear stored records after confirmation.

## Managing Models

The built-in catalog includes six official Tencent Hy-MT2 GGUF models (1.8B and 7B in Q4, Q6, and Q8 quantizations). Only the default `hy-mt2-1.8b-q4` has been tested in this project; larger or higher-bit models have not been benchmarked for back-translation quality. Manage models via the CLI (see [Models Guide](docs/models.md)):

```powershell
& "$env:LOCALAPPDATA\PlainSpeak\plainspeak.cmd" models list
& "$env:LOCALAPPDATA\PlainSpeak\plainspeak.cmd" models install hy-mt2-7b-q4
& "$env:LOCALAPPDATA\PlainSpeak\plainspeak.cmd" models use hy-mt2-7b-q4
& "$env:LOCALAPPDATA\PlainSpeak\plainspeak.cmd" models status
```

## Acknowledgements and Third-Party Components

PlainSpeak builds on the following upstream projects, models, and writing skills. Please refer to [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and the individual license files for complete terms, pinned revisions, and hashes.

| Upstream Project | Role in PlainSpeak | Attribution, License & Activation |
| --- | --- | --- |
| [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) | Native plugin host, official UI slots, and host Markdown component | Calls official public interfaces without copying host component source; host retains its upstream license |
| [tencent/Hy-MT2-1.8B-GGUF](https://huggingface.co/tencent/Hy-MT2-1.8B-GGUF) & [tencent/Hy-MT2-7B-GGUF](https://huggingface.co/tencent/Hy-MT2-7B-GGUF) | Default local translation model (1.8B Q4) and optional upgrade models | Tencent; pinned revisions verified as Apache-2.0 ([LICENSE.txt](https://huggingface.co/tencent/Hy-MT2-1.8B-GGUF/blob/a0c709d9fac510f2c807aa3af52872340dc37a4a/LICENSE.txt)); downloaded separately during installation, not bundled in source |
| [ggml-org/llama.cpp](https://github.com/ggml-org/llama.cpp) | Managed local GGUF inference runtime | MIT; official binary archive downloaded separately during installation, preserving bundled dependency notices |
| [blader/humanizer](https://github.com/blader/humanizer) | Bundled English-first writing skill | MIT ([LICENSE](third_party/blader--humanizer/LICENSE)); located under `third_party/`, manually enabled (opt-in) |
| [Kiterlin/anti-defensive-writing](https://github.com/Kiterlin/anti-defensive-writing) | Bundled anti-defensive writing skill | MIT ([LICENSE](third_party/Kiterlin--anti-defensive-writing/LICENSE)); located under `third_party/`, manually enabled (opt-in) |
| [op7418/Humanizer-zh](https://github.com/op7418/Humanizer-zh) | Bundled Chinese rewriting skill | MIT ([LICENSE](third_party/op7418--Humanizer-zh/LICENSE)); located under `third_party/`, manually enabled (opt-in), with [upstream source notices](third_party/op7418--Humanizer-zh/licenses/) preserved |
| [modelcontextprotocol/python-sdk](https://github.com/modelcontextprotocol/python-sdk) | Optional experimental MCP interface | MIT; not bundled, used only when installing optional MCP dependencies |

Other entries in the [Skill Catalog](docs/skill-catalog.md) are curated reference links only and are neither bundled nor enabled by default (for example, goldengrape's prompt instructions have an unconfirmed license and are linked for reference only without redistributing the text).

## License and Documentation

PlainSpeak's own code and first-party skills are released under the [MIT License](LICENSE). Third-party models, the host application, runtimes, and opt-in materials under `third_party/` are governed by their respective licenses and are not covered by PlainSpeak's MIT license. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for full details.

- [Installation & Data Guide](docs/harness-install.md) · [Model Catalog](docs/models.md) · [Clients & Experimental MCP](docs/clients.md)
- [Verification Records](docs/verification.md) · [Skill Catalog](docs/skill-catalog.md) · [Changelog](CHANGELOG.md)
