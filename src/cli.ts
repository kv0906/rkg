#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { infraUp, infraDown, infraStatus } from './core/infra-service.js';
import { runIndex } from './core/index-service.js';
import { loadConfig } from './config.js';

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

export function run(args: string[]): number | Promise<number> {
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

    case 'infra': {
      // Check for --help on subcommand args
      if (args.includes('--help')) {
        printSubcommandHelp(command);
        return 0;
      }
      return runInfra(positionals.slice(1), args);
    }

    case 'index': {
      if (args.includes('--help')) {
        printSubcommandHelp(command);
        return 0;
      }
      return runIndexCommand(positionals.slice(1), args);
    }

    case 'mcp':
      // Check for --help on subcommand args
      if (args.includes('--help')) {
        printSubcommandHelp(command);
        return 0;
      }
      // Stub: will be implemented in later user stories
      console.error(`Command 'mcp' is not yet implemented.`);
      return 1;
  }
}

async function runInfra(positionals: string[], rawArgs: string[]): Promise<number> {
  const action = positionals[0];

  if (!action || !['up', 'down', 'status'].includes(action)) {
    console.error(action ? `Unknown infra action: ${action}\n` : 'Missing infra action.\n');
    console.error(SUBCOMMAND_HELP.infra);
    return 1;
  }

  // Parse infra-specific flags
  let infraParsed: ReturnType<typeof parseArgs>;
  try {
    infraParsed = parseArgs({
      args: rawArgs.slice(rawArgs.indexOf(action) + 1),
      options: {
        wait: { type: 'boolean', default: false },
        timeout: { type: 'string' },
        volumes: { type: 'boolean', default: false },
      },
      allowPositionals: true,
      strict: false,
    });
  } catch {
    console.error(SUBCOMMAND_HELP.infra);
    return 1;
  }

  try {
    switch (action) {
      case 'up': {
        const wait = infraParsed.values.wait as boolean;
        const timeoutStr = infraParsed.values.timeout as string | undefined;
        const timeout = timeoutStr ? parseInt(timeoutStr, 10) : undefined;

        if (timeoutStr !== undefined && (isNaN(timeout!) || timeout! <= 0)) {
          console.error(`Invalid timeout value: ${timeoutStr}`);
          return 1;
        }

        console.log('Starting Neo4j via docker compose...');
        await infraUp({ wait, timeout });
        console.log(wait ? 'Neo4j is ready.' : 'Neo4j container started.');
        return 0;
      }

      case 'down': {
        const volumes = infraParsed.values.volumes as boolean;
        console.log(volumes ? 'Stopping Neo4j and removing volumes...' : 'Stopping Neo4j...');
        infraDown({ volumes });
        console.log('Neo4j stopped.');
        return 0;
      }

      case 'status': {
        const result = await infraStatus();
        console.log(`Neo4j: ${result.running ? 'running' : 'stopped'}`);
        console.log('');
        for (const check of result.diagnostics.checks) {
          const icon = check.status === 'pass' ? '[PASS]' : '[FAIL]';
          console.log(`  ${icon} ${check.check}: ${check.message}`);
        }
        return 0;
      }

      default:
        return 1;
    }
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    return 1;
  }
}

async function runIndexCommand(positionals: string[], rawArgs: string[]): Promise<number> {
  // Parse index-specific flags
  let indexParsed: ReturnType<typeof parseArgs>;
  try {
    // Find where index-specific args start (after 'index' in rawArgs)
    const indexPos = rawArgs.indexOf('index');
    const indexArgs = indexPos >= 0 ? rawArgs.slice(indexPos + 1) : rawArgs;
    indexParsed = parseArgs({
      args: indexArgs,
      options: {
        config: { type: 'string' },
        stats: { type: 'boolean', default: false },
        json: { type: 'boolean', default: false },
      },
      allowPositionals: true,
      strict: false,
    });
  } catch {
    console.error(SUBCOMMAND_HELP.index);
    return 1;
  }

  const workspacePath = positionals[0] || undefined;
  const configPath = indexParsed.values.config as string | undefined;
  const showStats = indexParsed.values.stats as boolean;
  const jsonOutput = indexParsed.values.json as boolean;

  try {
    const config = loadConfig(configPath);

    const result = await runIndex({
      workspacePath,
      configPath,
      config,
      outputFormat: jsonOutput ? 'json' : 'human',
    });

    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
    } else if (showStats) {
      console.log(`Nodes: ${result.nodeCount}`);
      console.log(`Edges: ${result.edgeCount}`);
      console.log('Classifications:');
      for (const [layer, count] of Object.entries(result.classificationSummary)) {
        console.log(`  ${layer}: ${count}`);
      }
    } else {
      console.log(`Indexed ${result.nodeCount} components with ${result.edgeCount} dependencies.`);
      for (const [layer, count] of Object.entries(result.classificationSummary)) {
        console.log(`  ${layer}: ${count}`);
      }
    }

    return 0;
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
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
  const result = run(mainArgs);
  if (result instanceof Promise) {
    result.then(code => process.exit(code)).catch(() => process.exit(1));
  } else {
    process.exit(result);
  }
}
