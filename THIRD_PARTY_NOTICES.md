# Third-party notices

PlainSpeak's own license does not replace the licenses below. Third-party skills are opt-in source material under third_party/, outside the auto-enabled root skills/. No third-party installer, runtime binary or executable script is bundled in this source distribution. The first-party installer explicitly downloads the selected upstream runtime and model; those materials retain their separate terms.

## blader/humanizer

Source: [blader/humanizer](https://github.com/blader/humanizer), commit `0ef9fe5bc3572734fd3ae6c448fe00a30cd5dcf0`.

Bundled unchanged: [SKILL.md](third_party/blader--humanizer/SKILL.md), [LICENSE](third_party/blader--humanizer/LICENSE). The upstream MIT copyright and permission text are preserved in full in that LICENSE. No runtime references or extra packages are required by this payload.

## Kiterlin/anti-defensive-writing

Source: [Kiterlin/anti-defensive-writing](https://github.com/Kiterlin/anti-defensive-writing), commit `f516147d017a3fe43ae99192cb89d8261b0c8679`.

Bundled unchanged: [SKILL.md](third_party/Kiterlin--anti-defensive-writing/SKILL.md), [LICENSE](third_party/Kiterlin--anti-defensive-writing/LICENSE). The upstream MIT copyright and permission text are preserved in full in that LICENSE. No runtime references or extra packages are required by this payload.

## op7418/Humanizer-zh

Source: [op7418/Humanizer-zh](https://github.com/op7418/Humanizer-zh), commit `f4518a8eab97b8bfebc66a89d34320a89bef6930`.

Bundled unchanged: [SKILL.md](third_party/op7418--Humanizer-zh/SKILL.md), [LICENSE](third_party/op7418--Humanizer-zh/LICENSE). The upstream MIT copyright and permission text are preserved in full in that LICENSE. No runtime references or extra packages are required by this payload.

The upstream skill credits blader/humanizer v3.0.0, Humanizer-zh PR 39, hardikpandya/stop-slop and Wikipedia's Signs of AI writing. Those source links remain unchanged. As additional attribution, the distribution preserves [Siqi Chen's MIT notice](third_party/op7418--Humanizer-zh/licenses/blader-humanizer-MIT.txt) from blader/humanizer commit `0ef9fe5bc3572734fd3ae6c448fe00a30cd5dcf0` and [Hardik Pandya's MIT notice](third_party/op7418--Humanizer-zh/licenses/hardikpandya-stop-slop-MIT.txt) from stop-slop commit `8da1f030185bdfe8471220585162991eaeb970e9`. No stop-slop skill or Wikipedia text is bundled.

## Link-only sources

All other catalog entries are links and audit metadata only. They are not bundled or enabled. “Publicly readable” does not establish permission to redistribute. Sources with absent/unclear licenses, unaudited reference license chains or unresolved versions remain link-only. See [catalog](docs/skill-catalog.md) and [structured metadata](catalog/skills.json).

## External runtime and model

- [Official Python MCP SDK](https://github.com/modelcontextprotocol/python-sdk): optional runtime dependency installed separately; upstream MIT license. Its implementation is not copied into this source distribution. Local protocol checks used version 1.30.0.
- [llama.cpp](https://github.com/ggml-org/llama.cpp/releases/tag/b12110): managed local runtime, release `b12110`, commit `cd959bae99ff4bed22bef2604f45241c09bbb8c8`; copyright (c) 2023–2026 The ggml authors, [MIT license](https://github.com/ggml-org/llama.cpp/blob/b12110/LICENSE). PlainSpeak downloads the official platform archive only during explicit installation, verifies its pinned SHA-256 and extracts it into the user's data directory. The source package includes runtime metadata and the full MIT notice in [runtimes.json](src/plainspeak/data/runtimes.json), not the binary. Installation writes that notice as `LICENSE.llama.cpp.txt` beside the runtime.
- Runtime release archives can include third-party libraries with their own terms. Extraction preserves upstream archive files and notices; the inspected Windows CPU archive contains `LICENSE-LLVM-OpenMP` with Apache-2.0 and LLVM Exceptions terms. That notice remains in the installed runtime directory. PlainSpeak's MIT license does not replace archive dependency licenses.
- [Ollama](https://github.com/ollama/ollama): optional external model runtime, installed separately and not required by the default managed backend. This project calls its documented HTTP/CLI interfaces.
- [Tencent Hy-MT2-1.8B-GGUF](https://huggingface.co/tencent/Hy-MT2-1.8B-GGUF): default small translation model, not bundled. Copyright (C) 2026 Tencent; actual [Apache-2.0 license text](https://huggingface.co/tencent/Hy-MT2-1.8B-GGUF/blob/a0c709d9fac510f2c807aa3af52872340dc37a4a/LICENSE.txt) verified at revision `a0c709d9fac510f2c807aa3af52872340dc37a4a`.
- [Tencent Hy-MT2-7B-GGUF](https://huggingface.co/tencent/Hy-MT2-7B-GGUF): optional larger translation model, not bundled. Copyright (C) 2026 Tencent; actual [Apache-2.0 license text](https://huggingface.co/tencent/Hy-MT2-7B-GGUF/blob/ab8472660ac61fac25f1af43fac2599d52a8a775/LICENSE.txt) verified at revision `ab8472660ac61fac25f1af43fac2599d52a8a775`.

The two official model repositories supply the six Q4/Q6/Q8 entries in [models.json](src/plainspeak/data/models.json). Exact filenames, pinned revisions, byte counts and LFS SHA-256 hashes are recorded there; [model documentation](docs/models.md) distinguishes locally tried defaults from unbenchmarked upgrades. Weights download only on explicit installation. PlainSpeak's MIT license does not license those weights.

## Native host integration

The first-party Harness adapter uses public plugin interfaces, official UI slots and the host's existing component at runtime. It does not copy Harness component source into this distribution and has no bundled host implementation or host React payload. The native package is an unpublished experiment; third-party host code retains its upstream license.
