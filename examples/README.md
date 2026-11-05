# Examples

- [prompts.md](prompts.md): things to ask your coding tool once Prepped is connected.
- [weekly-lab-meeting.json](weekly-lab-meeting.json): a weekly meeting as one input file, for `prepped groups create --input @weekly-lab-meeting.json`.
- [thesis-defense.sh](thesis-defense.sh): a defense with its slides, draft script and code, step by step on the command line.
- MCP settings by hand, for a connection named `my-tool` made with `npx -y prepped connect --name my-tool`:
  - [claude-code.sh](claude-code.sh)
  - [codex.toml](codex.toml)
  - [cursor-mcp.json](cursor-mcp.json)
  - [antigravity-mcp_config.json](antigravity-mcp_config.json)

On Windows, tools start `npx` through `cmd /c npx …`, as the JSON examples show. On macOS and Linux the command is `npx` and the arguments start at `-y`.
