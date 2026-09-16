import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const expectedWorkspaces = ['apps/api', 'apps/web', 'packages/contracts'];
const workspaceCommands = ['lint', 'typecheck', 'test', 'build'];
const ignoredDirectories = new Set(['node_modules', 'dist', 'coverage']);
const expectedToolchainVersions = {
  '@eslint/js': '10.0.1',
  eslint: '10.9.1',
  'eslint-plugin-vue': '10.10.0',
  globals: '17.12.0',
  'typescript-eslint': '8.69.0',
};
const expectedWebTestVersions = {
  '@vue/test-utils': '2.5.0',
  jsdom: '29.0.0',
};

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

async function listProjectFiles(directory = '.') {
  const files = [];

  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;

    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listProjectFiles(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

function assertExactVersions(dependencies, source) {
  for (const [name, version] of Object.entries(dependencies ?? {})) {
    assert.match(
      version,
      /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/,
      `${source}: ${name} deve usar versão exata`,
    );
  }
}

test('declara os três workspaces e todos os gates sem fallback', async () => {
  const manifest = await readJson('package.json');

  assert.deepEqual(manifest.workspaces, expectedWorkspaces);
  assert.doesNotMatch(
    Object.values(manifest.scripts).join('\n'),
    /--if-present/,
  );

  for (const command of ['format:check', ...workspaceCommands]) {
    assert.equal(typeof manifest.scripts[command], 'string');
  }

  for (const workspace of expectedWorkspaces) {
    const workspaceManifest = await readJson(
      path.join(workspace, 'package.json'),
    );
    for (const command of workspaceCommands) {
      assert.equal(
        typeof workspaceManifest.scripts[command],
        'string',
        `${workspace} deve declarar ${command}`,
      );
    }
  }
});

test('expõe somente os quatro comandos estáveis do launcher local', async () => {
  const manifest = await readJson('package.json');
  const workshopScripts = Object.fromEntries(
    Object.entries(manifest.scripts).filter(([name]) =>
      name.startsWith('workshop:'),
    ),
  );
  assert.deepEqual(workshopScripts, {
    'workshop:start': 'node scripts/workshop.mjs start',
    'workshop:status': 'node scripts/workshop.mjs status',
    'workshop:reset': 'node scripts/workshop.mjs reset',
    'workshop:stop': 'node scripts/workshop.mjs stop',
  });
  assert.match(manifest.scripts.lint, /eslint\.config\.mjs scripts test/);

  const launcher = await readFile('scripts/workshop.mjs', 'utf8');
  assert.match(
    launcher,
    /composePrefix = \['compose', '-p', project, '-f', composeFile\]/,
  );
  assert.doesNotMatch(
    launcher,
    /docker\s+(?:system|volume)\s+prune|system prune|volume prune|rm\s+-rf|\bglob\b/i,
  );
  assert.doesNotMatch(
    launcher,
    /FINBANK_TEST_PORT_STATE|NODE_ENV\s*===\s*['"]test/,
  );
  assert.doesNotMatch(launcher, /0\.0\.0\.0|https?:\/\/(?!localhost)/);
});

test('mantém versões diretas exatas e ferramentas alinhadas', async () => {
  const rootManifest = await readJson('package.json');
  const nvmVersion = (await readFile('.nvmrc', 'utf8')).trim();

  assert.equal(rootManifest.engines.node, nvmVersion);
  assert.equal(rootManifest.engines.node, '24.15.0');
  assert.equal(rootManifest.engines.npm, '11.9.0');
  assert.equal(rootManifest.packageManager, `npm@${rootManifest.engines.npm}`);

  for (const manifestPath of [
    'package.json',
    ...expectedWorkspaces.map((workspace) =>
      path.join(workspace, 'package.json'),
    ),
  ]) {
    const manifest = await readJson(manifestPath);
    assertExactVersions(manifest.dependencies, manifestPath);
    assertExactVersions(manifest.devDependencies, manifestPath);
  }
});

test('mantém ESLint 10 coordenado sem mecanismos de bypass', async () => {
  const rootManifest = await readJson('package.json');
  const webManifest = await readJson('apps/web/package.json');
  const manifestPaths = [
    'package.json',
    ...expectedWorkspaces.map((workspace) =>
      path.join(workspace, 'package.json'),
    ),
  ];
  const npmConfig = await readFile('.npmrc', 'utf8');

  for (const [dependency, version] of Object.entries(
    expectedToolchainVersions,
  )) {
    assert.equal(rootManifest.devDependencies[dependency], version);
  }

  for (const [dependency, version] of Object.entries(expectedWebTestVersions)) {
    assert.equal(webManifest.devDependencies[dependency], version);
  }

  for (const manifestPath of manifestPaths) {
    const manifest = await readJson(manifestPath);
    assert.equal(manifest.overrides, undefined);
    assert.doesNotMatch(
      JSON.stringify(manifest.scripts ?? {}),
      /--(?:force|legacy-peer-deps)\b/,
      `${manifestPath} não deve usar flags de bypass`,
    );
  }

  assert.doesNotMatch(
    npmConfig,
    /^(?:force|legacy-peer-deps)\s*=\s*(?:true|1|yes|on)\s*$/im,
  );
});

test('mantém o lockfile coerente com manifests e workspaces', async () => {
  const rootManifest = await readJson('package.json');
  const lockfile = await readJson('package-lock.json');

  assert.equal(lockfile.lockfileVersion, 3);
  assert.deepEqual(lockfile.packages[''].workspaces, rootManifest.workspaces);
  assert.deepEqual(lockfile.packages[''].engines, rootManifest.engines);
  assert.deepEqual(
    lockfile.packages[''].devDependencies,
    rootManifest.devDependencies,
  );

  for (const workspace of expectedWorkspaces) {
    const manifest = await readJson(path.join(workspace, 'package.json'));
    const lockedWorkspace = lockfile.packages[workspace];
    const link = lockfile.packages[`node_modules/${manifest.name}`];

    assert.equal(lockedWorkspace.name, manifest.name);
    assert.deepEqual(
      lockedWorkspace.dependencies ?? {},
      manifest.dependencies ?? {},
    );
    assert.deepEqual(
      lockedWorkspace.devDependencies ?? {},
      manifest.devDependencies ?? {},
    );
    assert.deepEqual(link, { resolved: workspace, link: true });
  }

  for (const [packagePath, lockedPackage] of Object.entries(
    lockfile.packages,
  )) {
    if (/(^|\/)node_modules\/eslint$/.test(packagePath)) {
      assert.match(
        lockedPackage.version,
        /^10\./,
        `${packagePath} deve usar ESLint 10`,
      );
    }

    if (/(^|\/)node_modules\/glob$/.test(packagePath)) {
      assert.notEqual(
        lockedPackage.version,
        '10.5.0',
        `${packagePath} não deve usar glob descontinuado`,
      );
    }

    assert.doesNotMatch(
      packagePath,
      /(^|\/)node_modules\/whatwg-encoding$/,
      'whatwg-encoding não deve existir no lockfile',
    );
  }
});

test('versiona somente o exemplo de ambiente com valores locais fictícios', async () => {
  const files = await listProjectFiles();
  const environmentFiles = files.filter((file) =>
    path.basename(file).startsWith('.env'),
  );
  const example = await readFile('.env.example', 'utf8');

  assert.deepEqual(environmentFiles, ['.env.example']);
  assert.match(example, /^API_PORT=3000$/m);
  assert.match(example, /^API_HOST=0\.0\.0\.0$/m);
  assert.match(example, /^MONGO_INIT_MAX_ATTEMPTS=60$/m);
  assert.doesNotMatch(example, /^WEB_URL=/m);
  assert.doesNotMatch(example, /(password|secret|token|api[_-]?key)/i);
});

test('G2 limita Prisma à persistência e mantém contratos livres de tipos gerados', async () => {
  const manifest = await readJson('apps/api/package.json');
  assert.equal(manifest.dependencies.prisma, '6.19.0');
  assert.equal(manifest.dependencies['@prisma/client'], '6.19.0');
  const files = (await listProjectFiles()).filter((file) =>
    file.endsWith('.ts'),
  );
  for (const file of files) {
    if (
      file.startsWith('apps/api/src/database/') ||
      file.startsWith('apps/api/src/repositories/') ||
      file.startsWith('apps/api/test/')
    )
      continue;
    assert.doesNotMatch(await readFile(file, 'utf8'), /@prisma\/client/);
  }
  const schema = await readFile('apps/api/prisma/schema.prisma', 'utf8');
  assert.doesNotMatch(schema, /requestId[^\n]*@unique/);
  assert.match(schema, /provider = "mongodb"/);
});
