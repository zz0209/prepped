# prepped

The MCP server and command line that let coding tools (Claude Code, Codex, Cursor, Antigravity, Gemini CLI and other MCP clients) work with a [Prepped](https://ai-overlay-alpha.fly.dev) account: meetings and weekly meetings, their material and projects, preparation, talks, calendar events, resumes, the question bank and practice.

Installing and connecting it is described in the package's [README](agent/README.md), which is also its page on [npm](https://www.npmjs.com/package/prepped). In short, ask your tool to run `npx -y prepped connect` and allow the request in Prepped. Ideas for what to ask once it is connected are in [examples/prompts.md](examples/prompts.md).

## How it works

Each operation in [agent/src/operations.ts](agent/src/operations.ts) is described once, with its input as a [zod](https://zod.dev) schema and the Prepped HTTP requests it makes. The command line ([agent/src/cli.ts](agent/src/cli.ts)) turns every operation into a subcommand, and the MCP server ([agent/src/mcp.ts](agent/src/mcp.ts)) into a tool, so both always offer the same operations.

The server and the command line run on your computer, so they can read the files you point your tool to and upload them as a meeting's material. They reach Prepped in one of two ways:

- the Prepped desktop app on the same computer, through its local service on `127.0.0.1` (its port is in `local-service.json` in the app's data folder); when the app is closed, the first request starts it in the background as `launch.json` in that folder says;
- Prepped on the web, at its address.

The key for each tool comes from `prepped connect` ([agent/src/connect.ts](agent/src/connect.ts)): the tool asks without a key, you allow the request in Prepped, and the tool collects its own key, kept in a file only you can read. The command recognises which tool runs it from the tool's environment or its parent processes ([agent/src/detect-client.ts](agent/src/detect-client.ts)), so each tool gets its own connection with its own name.

`shared/` holds the parts of Prepped's own code that the command uses: meeting types and their fields, limits, and the list of coding tools it knows.

## Building

Node.js 20 or later.

```bash
npm install
npm run build        # agent/dist/prepped.mjs, one file with its dependencies, and THIRD_PARTY_LICENSES.txt
npm run check        # types
node agent/dist/prepped.mjs --help
```

The package is published from `agent/`.

## License

MIT, see [LICENSE](LICENSE). The licences of the packages bundled into `prepped.mjs` are listed in `agent/dist/THIRD_PARTY_LICENSES.txt` after a build. The Prepped name and logo are not covered by the license.
