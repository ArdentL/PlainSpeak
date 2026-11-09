# Client adapters

The [native Harness adapter](harness-ui/README.md) adds automatic paragraph translations below the original response and injects clear-writing guidance by default. Use the [Harness installer](../docs/harness-install.md); this path does not require MCP or Ollama.

Run `scripts/client_setup.py` to prepare client-specific MCP snippets and portable skills.
See [client instructions](../docs/clients.md). These snippets are deliberately not active client config files.
Native plugin manifests at the project root package first-party skills only; they do not start MCP.
