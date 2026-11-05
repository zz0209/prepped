import { parseArgs } from 'node:util';
import { runCli } from './cli.js';
import { serveMcp } from './mcp.js';

// The `prepped` command (agent/package.json bin): the MCP server with `prepped mcp`, otherwise the command line.
// `prepped mcp --connection <name>` names the tool's connection as PREPPED_CONNECTION does, for tools that do not pass
// their MCP settings' environment variables to the server.
const argv = process.argv.slice(2);
if (argv[0] === 'mcp') {
  const { values } = parseArgs({ args: argv.slice(1), options: { connection: { type: 'string' } }, strict: true });
  if (values.connection) process.env.PREPPED_CONNECTION = values.connection;
  await serveMcp();
} else {
  process.exitCode = await runCli(argv, { out: text => process.stdout.write(`${text}\n`), err: text => process.stderr.write(`${text}\n`) });
}
