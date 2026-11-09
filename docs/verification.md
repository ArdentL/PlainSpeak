# Verification / 验证记录

## Public source repository (0.7.0)

The public source repository is [ArdentL/PlainSpeak](https://github.com/ArdentL/PlainSpeak). The initial publication uses the audited 86-file allowlist, including dotfiles, built adapter, licenses and synthetic evidence. Model weights, runtime binaries, credentials, local databases and real conversation records are excluded. Release assets and hosted CI results are available on the repository Releases and Actions pages. Earlier sections retain their historical publication status.

## Contextual round trips (0.7.0)

Both passes now receive bounded nearby original prose from the same assistant renderer. The frontend excludes the target, reasoning, tool output, code-containing paragraphs, media and host-hidden content; PlainSpeak-hidden original text remains available. Tests cover dispatch-time collection, root isolation, UTF-16 boundaries, streaming with at most one final refresh, cancellation/late-result races, Host/bridge validation, context-keyed cache reuse across restart and no separate background plaintext column. Schema 4 keeps older history but does not reuse older cache keys.

The complete Harness Python 3.12.14 suite ran 103 tests: 102 passed, one optional MCP SDK test skipped. All 50 Node adapter tests passed, including hidden descendant filtering and preserving PlainSpeak-hidden source context. Five actual local Hy-MT2 1.8B Q4 paired cases used temperature zero and the final prompt, with both intermediate and final outputs saved in [raw evidence](evidence/context-roundtrip.json). The heading stopped turning a bus into a train, the place name returned to 毛纺新村, and the research switch became 启用 rather than 开放. The reported dialogue remains wrong: 今天不下 was translated as 我今天不坐车了 rather than not getting off. A trial translating the entire excerpt together also failed that line; this is an observed model limitation, not a successful semantic fix. The English case had the same final output with and without context.

The updated 0.7.0 plugin was installed into the existing local Web preview and real Desktop profile without downloading a model. Source-only installation retained the Desktop profile manifest/YAML, settings/database bytes and model size/mtime; the Web database was also unchanged by installation. The actual Web page then produced 13/13 fresh ready outputs with its original Python block and four-by-two table intact. Read-only database inspection found 13 new records whose keys differed from context-free keys, confirming that nonempty context reached the running bridge and storage. There were no console errors; four connection retry warnings belonged to the deliberate test-Host restart. This UI run also changed a true blockquote description into a reference-document description, another observed semantic error retained in the test. Source hiding was saved and the page reloaded: all 13 outputs remained ready, eight changed sources were hidden and five identical outputs kept one original visible. The original display preference was restored afterward. Desktop requires restarting the existing app to load the update; its native window was not operated this round.

The initial design consulted the [official contextual-translation template](https://huggingface.co/tencent/Hy-MT2-1.8B/blob/main/README_CN.md). Extra decorative target labels sometimes leaked into model output during local trials; the shipped prompt uses plain background/target instructions instead. No automatic pivot change, larger-model download, or number-guard restoration was introduced.

## Plain-number policy update (0.6.1)

The ordinary-number guard was removed by user request. Tests confirm that Chinese number words may become Arabic digits, ordinary values/percentages/exponents and occurrence counts may change, and code/formula literals remain protected. The former numeric-drift fallback cases now expect an accepted rewrite; this is an intentional policy change. Existing settings and records are retained; failed/retained records remain ineligible for successful cache reuse. The complete Python suite ran on Harness Python 3.12.14: 95 tests, 94 passed and one optional MCP SDK test skipped. Versioned 0.6.0 results below describe the previous policy.

Checked 2026-11-09, version 0.6.0. Current checks used Windows, Python 3.13.12 and Harness-bundled Python 3.12.14, Node 24.14.1, Web Harness 0.1.1-rc.2 and installed Desktop Host 0.2.1-rc.5. Hosted CI has not been run. Older sections retain their original versions and results.

## Security fixes and Desktop profile integration (0.6.0)

Both Python interpreters ran the complete 92-test suite: **91 passed, one skipped**, no failures. The skipped optional MCP integration test requires the absent MCP SDK. All **38 Node adapter tests passed**. Installer checks cover actual child-process crashes and recovery on retry, including a Desktop profile manifest write; unknown files and genuine user edits still stop the installation.

The fixed boundaries cover loopback Host/peer/origin validation, scientific-notation exponent preservation and cache schema 3, media-containing paragraph preservation, cancellation of pending paragraph timers after clearing, recoverable installation writes, route disposal on reload, provider redirect refusal, cancellation between model calls and before final storage, and SQLite secure deletion. Synthetic legacy free-page, clear and eviction checks confirmed marker removal from the current SQLite file. Backups, snapshots and storage-device erasure are outside that check. Cancellation waits for an already-started provider call to return and then prevents further calls.

Desktop installation uses the existing profile bundle mechanism: the installer generates its own package-local patch and appends only its package name to `dsh.profile.bundles`, retaining other manifest fields and the original user YAML bytes. Restarting Desktop loads that bundle; no vendor files or separate browser transport are required. The existing `platform: "web"` declaration is correct for Desktop's shared web frontend.

The installed **0.2.1-rc.5 Desktop Host was actually started** with an isolated profile and one copied task-owned synthetic session. Its real frontend loaded the PlainSpeak controls without console errors. Twelve paragraphs underwent fresh local Hy-MT2 1.8B Q4 inference and displayed usable outputs. The settings panel saved source hiding; reload retained all twelve hidden sources, twelve ready translations, the original Python `print("hello")` block, and twelve records in the history panel. These are functionality checks; they do not establish semantic fidelity of the translations.

Desktop's actual `forwardWebRequest` and protocol handler were extracted from the installed application and tested against a temporary loopback receiver: legitimate app-origin traffic preserved the UTF-8 body and marker, replaced cookies with a synthetic Host cookie, and passed the fixed PlainSpeak boundary; foreign origins returned 403 without contacting the Host; an actual aborted fetch closed the receiving connection. Only these extracted functions were executed in that transport test. **Electron's native window itself was not operated or visually checked**; Desktop Host plus shared frontend and protocol behavior were verified separately. Linux and macOS remain untested.

Existing Web sessions, settings and records are preserved during the update. The release excludes model weights, runtime binaries, local profiles, databases, credentials, private paths and extracted vendor application code.

## Cleaner comparison (0.5.1)

The same actual Harness fixture was reloaded using the 13 previously stored real-model outputs. Four identical table-cell outputs were suppressed, leaving their original text visible once. Three changed table-cell outputs replaced their sources in the translated view; the table remained four rows by two columns. Clicking the table's original control hid all seven translated cell nodes and restored source styling. Switching back used the existing outputs without requesting another translation.

Actual GUI checks also confirmed that global source hiding hides the table comparison controls. Disabling translation removed all output nodes, controls and source-suppression classes while preserving the original table and Python code. Re-enabling restored the default translated table. Ordinary paragraph translations have no added quote rail; their native Markdown text resolved to `rgb(97, 102, 107)` and `15.04px`, with darker original text above. Genuine source blockquotes retain their layout.

All **30 Node tests passed**, including table switching, equal-cell deduplication and cleanup on disposal. Python code was unchanged apart from the version string; its previous 71-test result belongs to 0.5.0 below. This display update used cached real translations and did not rerun model inference. Source suppression inside cells still uses the CSS mechanism described below.

## Actual Markdown rendering experiment (0.5)

One fixed synthetic response was generated through actual DeepSeek-V4-Flash in the isolated Harness profile. It includes a heading, bold/italic/deleted text, a documentation link, inline code, inline TeX, two list items, a real blockquote, a 4×2 table and a Python code block. No content or network configuration from the user's screenshots was submitted. The same saved assistant response was then reloaded with the new renderer and rewritten by the real managed Hy-MT2 1.8B Q4 model on CPU.

Before the update, five eligible prose/list outputs had no rendered code, strong, link or math elements; headings and table prose were skipped. Formula extraction duplicated KaTeX's presentation and annotation text. The inline-command sample and formula sample fell back to their source under the old literal guards.

After the update, **13/13** eligible blocks completed with zero retained chunks and zero errors, and were rendered through the host's shared MarkdownText/ReactDOM portal. Observed output DOM included H2, strong, em, del, code, a and KaTeX with the exact TeX annotation `x^2 + y^2 = 1`. Both inline commands remained exactly `python -m plainspeak`; the documentation URL remained exactly `https://www.python.org/`. The table kept four rows of two cells, with prose translated in seven cells and the code-only `batch_size=8` value untouched. The Python block remained exactly `print("hello")\nbatch_size = 8`. Source hiding had zero extra border/padding and no added decorative pseudo-element; the source's real blockquote retained its own quote layout.

The actual GUI also restored all source blocks when source hiding was switched off. Turning automatic translation off removed all 13 output/portal nodes while preserving the original table and code. Re-enabling it reused the 13 stored outputs. A visual list-marker alignment issue found during this experiment was corrected with CSS confined to hidden-source list items.

The Python suite passed **71 tests**, including formula-symbol drift, indivisible formula spans, and refusing to reuse older cache-policy records while keeping them in history. Native Node tests passed **29 tests**, including Markdown extraction, single KaTeX annotation recovery, table/technical-value selection, native rendering delegation, lifecycle and controls. These checks establish functionality for the fixed sample, not semantic translation quality. Complex nested table cells remain unchanged. Naked source text inside list/table containers is visually suppressed using CSS; source text remains in the DOM for restoration.

Full synthetic source/output pairs and before observations are in [Markdown experiment evidence](evidence/markdown-rendering.json). Public repository creation remains blocked by the previously reported invalid connector credentials; no GitHub publication is claimed.

## Reading interface and optional source hiding (0.4)

0.4.1 visual update: the rebuilt native UI was reinstalled and checked in the actual Harness page. Switch backgrounds and the selected tab both resolved to `rgb(65, 118, 230)`, matching the host's `--dsw-alias-state-business-primary` (`#4176e6`). All 12 cached translations remained ready. The saved clear-writing, translation, history and source-hiding switches remained enabled. No backend behavior changed; no new full test run was performed for this CSS-only update.

The reading panel now has separate reading/history tabs, local paired-line branding, visible unsaved changes, a fixed save footer and keyboard navigation. A new `hideOriginal` boolean defaults to false and persists in SQLite. Existing 0.3 databases migrate this one missing field without changing older preferences, translation records or the cache epoch.

In the actual isolated Harness GUI, enabling source hiding hid all **12** successfully translated source paragraphs while keeping all 12 outputs and the Python code block visible. Disabling automatic translation removed the output elements and restored all original paragraphs. Re-enabling it reused all 12 records. A full host restart and page reload retained `hideOriginal=true`, all 12 records and the source-hidden display. The model runtime log stayed at 92,191 bytes; these display checks did not run new model inference.

The final panel was inspected at the normal 780×734 viewport and a temporary 390×844 viewport. At the narrow size, the panel had no horizontal overflow and its fixed footer stayed in view. The viewport override was reset afterward. Dark-theme tokens are implemented; an actual dark-theme GUI check was not performed.

The Python suite passed **67 tests**, including the actual MCP SDK call and the 0.3 database migration. Native Node tests passed **24 tests**: new checks cover source hiding only for complete usable outputs, pending/error/partial fallback, restoration on disable/dispose, list exclusions, tab navigation and focus boundaries. Switching only the source display reuses the existing output instead of calling translation again. Failed/partial output fallback was covered by automated tests, not by a new real-model failure experiment. The checked-in browser bundle was rebuilt. CI now includes the native Node suite and bundle reproducibility, but remains unrun remotely.

Public GitHub creation was attempted; the repository-creation connector returned `Authentication Failed: Bad credentials`. The in-app GitHub page required sign-in, and Chrome automation failed before a usable page was reached. No remote repository, push, tag or Release has been confirmed. A ready-to-upload local source archive is separate from a published release.

## Settings and durable records (0.3)

The visible `PlainSpeak 设置` panel controls automatic translation, output language, clear-writing instructions, and local record saving. Settings and up to 1,000 paragraph records are stored in `PLAINSPEAK_HOME/ui/records.sqlite3`; the default Windows home is `%LOCALAPPDATA%/PlainSpeak`. Records contain original/translated paragraph text, language, pivot, model, time and validation report. They do not contain hidden reasoning and do not replace Harness conversation storage. The source archive excludes local databases and generated configurations.

Clean translations can be reused after browser or host restarts using a key containing source, language, pivot, model and schema. Partially retained output preserves its report and is not reused as a clean translation. Disabling local saving stops both persistent writes and reuse while keeping existing records. Clearing records also invalidates in-flight saves; the current visible translations remain on screen. The panel can export records as JSON and requires a second click to clear them.

The Python suite passed **66 tests**, with the actual MCP SDK test enabled. New checks cover Unicode/settings persistence, restart reuse without starting the backend, model/language/pivot cache invalidation, partial results, a real 1,002-record limit test, clear/disable during delayed HTTP inference, and disk-save failure preserving a successful translation. Host tests verify that a persisted writing-rule switch changes the next prompt provider output and remains off when the host plugin reloads.

The native Node suite passed **18 tests**, including settings-controller loading/errors, exact-field save, accessible text-safe rendering, JSON Blob export, two-click clear, and keeping the UI available when local storage fails.

Actual Harness GUI checks passed: all 12 synthetic paragraphs were recorded; a saved record expanded to show its source/translation; export returned 12 records; disabling all three switches removed the translations. After a full host restart and page reload, all switches remained off and the 12 records remained. Re-enabling them restored all 12 translations with zero errors, without a new `llama-server` process or any growth in the runtime log (92,191 bytes before/after). The clear confirmation and cancel flow was checked in the GUI; actual deletion and in-flight fencing were exercised by automated HTTP tests. See [persistence evidence](evidence/harness-persistence.json). The demo was left with translation, clear-writing guidance and record saving enabled.

## Actual Harness UI experiment (0.2)

An isolated Harness profile loaded the native `@plainspeak/harness-ui` adapter, with its own Python bridge and managed llama.cpp CPU runtime. The model was the official Hy-MT2-1.8B Q4_K_M GGUF (1,133,080,448 bytes, SHA-256 `dc5f44fcf1fa496ee7ad725982c0c8c553a4de00259b53af84c4b89fb0c06699`). The test did not use Ollama or model-initiated MCP calls.

Three actual DeepSeek-V4-Flash replies produced **12 prose paragraphs** (3 + 4 + 5), covering research explanation, daily conversation, and project questions. All 12 acquired a separate, lighter translation below their original paragraph. The translations are display elements, outside the conversation store. Synthetic source/output pairs are saved in [evidence/harness-ui-smoke.json](evidence/harness-ui-smoke.json); their scientific explanations are test content, not independently verified research guidance.

Observed UI behavior:

- Turning translations off removed them; turning them back on restored cached results.
- A Python code block remained unchanged. Inline command text and the selected numeric literals were retained.
- During generation, completed paragraphs entered the queue while the last, changing paragraph waited. All five paragraphs of the longest reply completed afterward. A finished translation appearing before the entire reply ended was not observed in this run.
- The native renderer initially fell back to the stock component because wrapper registration lost its locale metadata. Copying the original renderer's locale, injection and store metadata fixed it. Bounded bridge queuing also fixed a busy error caused by cancelled development-mode mounts.

The host registers clear-writing guidance as a system-prompt section by default; registration and opt-out behavior are tested. This uses direct plugin prompt injection rather than relying on the model to choose a skill tool. No controlled quality comparison of this prompt was run.

Some translations grew longer or changed meaning. Literal checks protect selected numbers, URLs and code, but cannot verify semantics. Both versions remain visible for comparison. Rejected chunks retain their source; the UI labels partially retained results and does not cache them as clean translations. Only transient busy responses receive bounded retries.

## Managed setup and automated checks (0.2)

- The installer copied a standalone app and native adapter into an isolated installation and selected Harness profile. Rerunning updated its owned files; tests refuse unowned or locally modified files and preserve unrelated files.
- Setup imported and verified an existing local GGUF. The pinned official Windows CPU runtime archive was verified and extracted. No administrator privilege, global PATH change, or manual Ollama startup was needed.
- A real managed round trip completed, followed by shutdown. The own-child supervisor was exercised with a real subprocess and stdin EOF. Model switching, damaged weights, missing setup, unsafe archives and bad downloads have regression coverage.
- A clean-machine, full internet installation was **not** exercised. Existing model weights were reused. The runtime asset was downloaded with system curl after Python urllib received HTTP 504 through the existing proxy; this is not an automatic installer fallback. A small HTTPS download through the product downloader passed with existing proxy and TLS settings unchanged.
- Linux/macOS runtime assets are pinned but were not executed. All six official model entries have fixed revisions, sizes, SHA-256 and license metadata; only the default Q4 model was run.

The Python suite passed **55 tests**, including an actual official-SDK MCP stdio discovery and rewrite call. Run `python -m unittest discover -s tests -v` after installing `.[dev]`. Native adapter tests passed **9 tests**, covering the actual bridge subprocess, request validation, disposal, default writing-prompt registration, shared React bundling, renderer metadata, partial-source labels and bounded busy retries. Run `node --test tests/*.test.mjs` inside `adapters/harness-ui`; rebuild with `node scripts/build.mjs` after source changes.

## Earlier checks (0.1)

- Dependency-free core and CLI: complete text segmentation, language routes, Markdown code preservation, literal guards, source fallback and no input overwrite.
- Real HTTP requests to controlled local Ollama/OpenAI-compatible test endpoints, including truncation rejection.
- Official Python MCP SDK stdio initialize, tool discovery and `rewrite_text` call against a controlled local translation endpoint.
- Generated Codex TOML, Claude JSON and Harness Settings JSON each launched the exact configured command through the SDK, initialized and discovered the three tools; `list_languages` returned successfully.
- Three client skill bundles copied with canonical frontmatter names and complete license/resource files; dry-run, overwrite refusal, traversal refusal and canonical-name conflict checks.
- Both first-party skills passed the local skill format validator. Claude's read-only plugin validator passed; optional listing author/icon information is not configured.
- Offline editable install and wheel build completed. The normal isolated pip build encountered a PyPI TLS EOF while fetching setuptools; verification reused already installed build dependencies with `--no-index --no-build-isolation --no-deps`. TLS checks and network settings were not changed.

The full local suite passed **33 tests**, including 10 regressions for splitting inside code/URL/numeric literals and nested or unclosed Markdown code containers. The main command is `python -m unittest discover -s tests -v`, after installing `.[dev]`. Configured CI targets Windows/Linux and Python 3.10/3.13; local execution used Windows and Python 3.13.12, MCP SDK 1.30.0. A Python 3.10 syntax parse is separate from running on that interpreter.

Segmentation conservatively retains quoted/list fences, indented code, multiline inline spans and entire lines containing oversized literals. Some ambiguous indented prose may therefore remain unchanged. A skill/archive slug is mapped to its canonical frontmatter name before installation; this avoids invalid mixed-case vendor names in the client's skill directory.

## Actual Hunyuan Q4 execution

The model setup script imported an existing local GGUF after checking SHA-256. Six synthetic passages then went through both translation directions using the new core and Ollama backend: Simplified Chinese, English, Japanese, French, Spanish and Traditional Chinese. None was empty, truncated or retained by a literal guard. Full source/output pairs are in [evidence/hunyuan-smoke.json](evidence/hunyuan-smoke.json).

This checks execution and selected language routing, not writing quality across all configured languages. For example, the French smoke changed “shares errors” to “distributes errors”; the English smoke turned an instruction into a description. These are model outputs retained unchanged in the evidence. Literal guards cannot detect all meaning changes.

All examples are synthetic. No real conversation or hidden reasoning is included. The test model was unloaded and the isolated local service stopped afterward.

## Integration scope

Automatic paragraph display is implemented and exercised in the native Harness web adapter. Codex and Claude Code still use portable skills and optional MCP transformations; their UIs are not modified. No native package has been published to npm. Public source and release links are listed above.
