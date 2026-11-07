import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

export const agentSources = ['cli', 'client', 'config', 'connect', 'detect-client', 'main', 'mcp', 'operations']
  .map(name => `agent/src/${name}.ts`);
const sharedSources = new Set([
  'agent-access', 'agent-client-identity', 'answer-frames', 'interview-fields', 'job-target', 'languages',
  'meeting-limit', 'meeting-options', 'overlay-inputs', 'question-categories', 'session-inputs', 'text-limits',
].map(name => `shared/${name}.ts`));

/** Both the standalone bundle and the public Git export use the same reviewed source boundary. */
export function publicSharedFiles(metafile) {
  const shared = [];
  for (const input of Object.keys(metafile.inputs)) {
    const file = input.replaceAll('\\', '/');
    if (file.split('/').includes('node_modules') || file === 'agent/package.json' || agentSources.includes(file)) continue;
    if (!sharedSources.has(file)) throw new Error(`The MCP build imports an unreviewed source: ${file}`);
    shared.push(file);
  }
  return shared.sort();
}

// The `prepped` command for coding tools (docs/AGENT_INTERFACE.md): one ES module with every dependency in it, so it
// needs nothing else and runs with Node 20 or newer on Windows and macOS. It goes to agent/dist for the npm package
// `prepped` (scripts/build-agent.mjs) and to dist/agent inside the desktop app, which starts it with its own runtime
// for the tools it connects (scripts/build-server.mjs, desktop/agent-tools.cjs). Its version is the app's, since its
// operations follow the app's interface (checkVersions). The licences of the packages bundled into it go beside it in
// THIRD_PARTY_LICENSES.txt, as their licences ask of copies. The package's public repository builds it with this file
// too (scripts/export-agent-repo.mjs).

/** The package's version is the app's: the commit that changes one changes both. */
export function checkVersions() {
  const app = JSON.parse(readFileSync('package.json', 'utf8'));
  const agent = JSON.parse(readFileSync('agent/package.json', 'utf8'));
  if (agent.version !== app.version) throw new Error(`agent/package.json has version ${agent.version}; the app has ${app.version}. Give them the same version.`);
}

/** Writes prepped.mjs and THIRD_PARTY_LICENSES.txt into `outdir`. */
export async function bundleAgent(outdir) {
  mkdirSync(outdir, { recursive: true });
  const result = await build({
    entryPoints: ['agent/src/main.ts'],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    outfile: path.join(outdir, 'prepped.mjs'),
    // The packages written as CommonJS call require(), which an ES module has only through createRequire.
    banner: { js: '#!/usr/bin/env node\nimport { createRequire as __preppedRequire } from \'node:module\';\nconst require = __preppedRequire(import.meta.url);' },
    legalComments: 'none',
    metafile: true,
    write: false,
  });
  publicSharedFiles(result.metafile);

  // Each package the bundle took code from, by its folder in node_modules (a scoped one by both parts of its name).
  const packages = new Map();
  for (const input of Object.keys(result.metafile.inputs)) {
    const parts = input.replaceAll('\\', '/').split('/');
    const at = parts.lastIndexOf('node_modules');
    if (at < 0) continue;
    const name = parts[at + 1].startsWith('@') ? `${parts[at + 1]}/${parts[at + 2]}` : parts[at + 1];
    packages.set(name, path.join(...parts.slice(0, at + 1), name));
  }
  // A package published without its licence file has the text from its repository in agent/licenses/<name>.LICENSE.
  const notices = [...packages].sort(([a], [b]) => a.localeCompare(b)).map(([name, folder]) => {
    const manifest = JSON.parse(readFileSync(path.join(folder, 'package.json'), 'utf8'));
    const own = readdirSync(folder).find(entry => /^(licen[cs]e|copying)(\.(md|txt))?$/i.test(entry));
    const kept = path.join('agent', 'licenses', `${name.replace('/', '__')}.LICENSE`);
    const file = own ? path.join(folder, own) : existsSync(kept) ? kept : null;
    if (!file) throw new Error(`${name} has no licence file in ${folder}; put its licence text in ${kept} before publishing.`);
    return `${name} ${manifest.version} (${manifest.license})\n\n${readFileSync(file, 'utf8').trim()}\n`;
  });
  const licences = path.join(outdir, 'THIRD_PARTY_LICENSES.txt');
  writeFileSync(licences, `The prepped command bundles these packages.\n\n${notices.join('\n' + '-'.repeat(72) + '\n\n')}`);
  if (!existsSync(licences)) throw new Error('The licence file was not written.');
  for (const output of result.outputFiles) writeFileSync(output.path, output.contents);
}
