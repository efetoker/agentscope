#!/usr/bin/env node

import { cac } from 'cac';
import { runDoctorCommand } from './commands/doctor.js';
import { runExportCommand } from './commands/export.js';
import { runSearchCommand } from './commands/search.js';
import { runShowCommand } from './commands/show.js';

const cli = cac('agentscope');

const writeCommandResult = (result: { exitCode: number; stdout: string; stderr: string }) => {
  if (result.stdout) {
    process.stdout.write(`${result.stdout}\n`);
  }

  if (result.stderr) {
    process.stderr.write(`${result.stderr}\n`);
  }

  process.exitCode = result.exitCode;
};

cli
  .command('search [query]', 'Search local agent history')
  .option('--json', 'Print structured JSON')
  .option('--regex', 'Treat query as a regular expression')
  .option('--agent <runtime>', 'Restrict search to a specific runtime')
  .option('--repo <path>', 'Filter by repo path')
  .option('--path <path>', 'Filter by execution path')
  .option('--here [path]', 'Filter to the current path or an explicit path')
  .option('--since <date>', 'Filter to results on or after this timestamp')
  .option('--until <date>', 'Filter to results on or before this timestamp')
  .option('--limit <count>', 'Limit the number of root results returned')
  .option('--all', 'Disable truncation')
  .action(async (query, options) => {
    writeCommandResult(
      await runSearchCommand({
        query,
        rawArgs: [...cli.args],
        json: Boolean(options.json),
        regex: Boolean(options.regex),
        agent: options.agent,
        repo: options.repo,
        path: options.path,
        here: options.here,
        since: options.since,
        until: options.until,
        limit: options.limit ? Number(options.limit) : undefined,
        all: Boolean(options.all),
        cwd: process.cwd(),
      }),
    );
  });

cli
  .command('show [id]', 'Show a session tree bundle')
  .option('--json', 'Print structured JSON')
  .option('--agent <runtime>', 'Restrict resolution to a specific runtime')
  .action(async (id, options) => {
  writeCommandResult(
    await runShowCommand({
      id,
      json: Boolean(options.json),
      agent: options.agent,
      rawArgs: [...cli.args],
    }),
  );
  });

cli
  .command('export [id]', 'Export a session tree bundle')
  .option('--out <directory>', 'Write the bundle into a new directory under the given path')
  .option('--agent <runtime>', 'Restrict resolution to a specific runtime')
  .action(async (id, options) => {
    writeCommandResult(
      await runExportCommand({
        id,
        out: options.out,
        agent: options.agent,
        rawArgs: [...cli.args],
      }),
    );
  });
cli
  .command('doctor', 'Inspect detected runtimes')
  .option('--json', 'Print structured JSON')
  .action(async (options) => {
    const result = await runDoctorCommand({
      json: Boolean(options.json),
    });
    writeCommandResult(result);
  });

cli.help();
cli.parse();
