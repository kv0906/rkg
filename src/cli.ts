#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getVersion(): string {
  const pkgPath = resolve(__dirname, '..', '..', 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  return pkg.version;
}

const SUBCOMMANDS = ['infra', 'index', 'mcp', 'help', 'version'] as const;
type Subcommand = (typeof SUBCOMMANDS)[number];

const USAGE = `Usage: rgk <command> [options]

Commands:
  infra     Manage Neo4j infrastructure (up, down, status)
  index     Index a React/Next.js codebase into the knowledge graph
  mcp       Start the MCP server or run diagnostics
  help      Show help for a command
  version   Print version

Options:
  --help     Show help
  --version  Print version

Run "rgk help <command>" for more information about a command.`;

const SUBCOMMAND_HELP: Record<Subcommand, string> = {
  infra: `Usage: rgk infra <action> [options]

Actions:
  up       Start Neo4j via docker compose
  down     Stop Neo4j services
  status   Show infrastructure status

Options:
  --wait              Wait for Neo4j to be ready (with 'up')
  --timeout <seconds> Override wait timeout (default: 60)
  --volumes           Also remove data volumes (with 'down')`,

  index: `Usage: rgk index [workspacePath] [options]

Index a React/Next.js codebase into the knowledge graph.

Options:
  --config <path>  Override config file location
  --stats          Print summary (nodes, edges, classifications)
  --json           Output machine-readable JSON`,

  mcp: `Usage: rgk mcp <action> [options]

Actions:
  start    Launch MCP server over stdio
  doctor   Run health checks and diagnostics

Options:
  --config <path>  Override config file location`,

  help: `Usage: rgk help [command]

Show help for a command.`,

  version: `Usage: rgk version

Print the rgk version.`,
};

function printUsage(): void {
  console.log(USAGE);
}

function printSubcommandHelp(cmd: Subcommand): void {
  console.log(SUBCOMMAND_HELP[cmd]);
}

function printUnknownCommand(cmd: string): void {
  console.error(`Unknown command: ${cmd}\n`);
  console.error(USAGE);
}

export function run(args: string[]): number {
  // Parse top-level flags (before any subcommand)
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args,
      options: {
        help: { type: 'boolean', default: false },
        version: { type: 'boolean', default: false },
      },
      allowPositionals: true,
      strict: false,
    });
  } catch {
    printUsage();
    return 2;
  }

  const { values, positionals } = parsed;

  // --version flag at root level
  if (values.version) {
    console.log(getVersion());
    return 0;
  }

  // --help flag at root level (no subcommand)
  if (values.help && positionals.length === 0) {
    printUsage();
    return 0;
  }

  const command = positionals[0];

  // No command provided
  if (!command) {
    printUsage();
    return 0;
  }

  // Check for --help on a subcommand: "rgk infra --help" or "rgk --help infra"
  if (values.help && isSubcommand(command)) {
    printSubcommandHelp(command);
    return 0;
  }

  // Route to subcommand
  if (!isSubcommand(command)) {
    printUnknownCommand(command);
    return 2;
  }

  switch (command) {
    case 'version':
      console.log(getVersion());
      return 0;

    case 'help': {
      const helpTarget = positionals[1];
      if (helpTarget && isSubcommand(helpTarget)) {
        printSubcommandHelp(helpTarget);
      } else if (helpTarget) {
        printUnknownCommand(helpTarget);
        return 2;
      } else {
        printUsage();
      }
      return 0;
    }

    case 'infra':
    case 'index':
    case 'mcp':
      // Check for --help on subcommand args
      if (args.includes('--help')) {
        printSubcommandHelp(command);
        return 0;
      }
      // Stub: these will be implemented in later user stories
      console.error(`Command '${command}' is not yet implemented.`);
      return 1;
  }
}

function isSubcommand(cmd: string): cmd is Subcommand {
  return (SUBCOMMANDS as readonly string[]).includes(cmd);
}

// Main entrypoint - only runs when executed directly (not when imported for testing)
const isDirectRun =
  process.argv[1] &&
  (process.argv[1] === fileURLToPath(import.meta.url) ||
    process.argv[1].endsWith('/cli.js'));

if (isDirectRun) {
  const mainArgs = process.argv.slice(2);
  const exitCode = run(mainArgs);
  process.exit(exitCode);
}
