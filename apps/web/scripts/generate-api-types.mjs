#!/usr/bin/env node
/**
 * Customer API type codegen (e1c-faz3).
 *
 * Single source of truth: the .NET Nexus API's OpenAPI document.
 *   1. dotnet swagger tofile  -> contracts/nexus-openapi.json
 *   2. openapi-typescript     -> apps/web/src/lib/generated/nexus-api.d.ts
 *
 * The spec is generated OFFLINE: by clearing the DB connection strings the
 * API falls back to the EF InMemory provider, so no Postgres is required and
 * the startup seeding block is skipped. This keeps the pipeline CI-friendly.
 *
 * Usage:
 *   npm run codegen:api          # full pipeline (build + spec + types)
 *   npm run codegen:api-types    # types only (reuse committed spec)
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');
const apiDir = resolve(repoRoot, 'apps/api');
const apiProject = resolve(apiDir, 'src/Nexus.Api/Nexus.Api.csproj');
const apiDll = resolve(apiDir, 'src/Nexus.Api/bin/Debug/net8.0/Nexus.Api.dll');
const specPath = resolve(repoRoot, 'contracts/nexus-openapi.json');
const typesPath = resolve(repoRoot, 'apps/web/src/lib/generated/nexus-api.d.ts');

const typesOnly = process.argv.includes('--types-only');

function run(cmd, args, opts = {}) {
  console.log(`\n$ ${cmd} ${args.join(' ')}`);
  execFileSync(cmd, args, { stdio: 'inherit', ...opts });
}

// Force the EF InMemory provider so spec generation needs no database.
const offlineEnv = {
  ...process.env,
  ASPNETCORE_ENVIRONMENT: 'Development',
  ConnectionStrings__DefaultConnection: '',
  DATABASE_URL: '',
};

if (!typesOnly) {
  run('dotnet', ['build', apiProject, '-c', 'Debug', '--nologo', '-v', 'q'], { cwd: apiDir });
  run('dotnet', ['tool', 'restore'], { cwd: apiDir });
  run('dotnet', ['swagger', 'tofile', '--output', specPath, apiDll, 'v1'], {
    cwd: apiDir,
    env: offlineEnv,
  });
}

run('npx', ['openapi-typescript', specPath, '-o', typesPath], { cwd: resolve(repoRoot, 'apps/web') });

console.log('\n✓ API types generated:');
console.log(`  spec : ${specPath}`);
console.log(`  types: ${typesPath}`);
