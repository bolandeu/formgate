// Test harness for install.sh: runs the script as a process in a temp folder with fake docker, git and curl first
// on PATH. The fakes log their calls and answer per scenario: the remote tags, the Compose version, the tags whose
// /health answers. git checkout copies a fake source (the repository's .env.example) into the install folder and
// records the fetched ref as checked out; a scenario can make every git fetch fail. A scenario with real git links
// the system git instead of the fake one, for source repositories that the test creates.
// PATH has no system folder: the system tools the script needs are linked into one folder, so docker can be missing.
import { spawn, execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const installScript = join(root, 'install.sh');

const systemTools = ['awk', 'cat', 'chmod', 'cp', 'cut', 'date', 'grep', 'head', 'mkdir', 'mv', 'od', 'rmdir', 'sed', 'sleep', 'sort', 'tr'];

// An internal secret key that the fixture .env.example adds to the real one: install.sh fills each empty *_SECRET.
export const fixtureSecretKey = 'FORMGATE_FIXTURE_SECRET';

// Each fake logs its name and arguments, tab separated, one call per line.
const logCall = 'printf "%s" "${0##*/}" >>"$FAKE_LOG"; for arg; do printf "\\t%s" "$arg" >>"$FAKE_LOG"; done; echo >>"$FAKE_LOG"';

const fakeDocker = `#!/bin/sh
${logCall}
if [ "$1 $2" = "compose version" ]; then echo "$FAKE_COMPOSE_VERSION"; fi
`;

const fakeGit = `#!/bin/sh
${logCall}
if [ "$1" = -C ]; then dir=$2; shift 2; fi
case $1 in
  ls-remote) for tag in $FAKE_TAGS; do printf '0000000\\trefs/tags/%s\\n' "$tag"; done ;;
  init) mkdir -p "$3/.git" ;;
  remote) echo "$4" >"$FAKE_STATE/remote" ;;
  config) cat "$FAKE_STATE/remote" 2>/dev/null ;;
  fetch) [ -z "$FAKE_FETCH_FAILS" ] || { echo "fatal: fetch failed" >&2; exit 128; }
    eval "fetched=\\\${$#}"; echo "$fetched" >"$FAKE_STATE/fetched" ;;
  checkout) cp "$FAKE_SOURCE/.env.example" "$dir/.env.example"; cp "$FAKE_STATE/fetched" "$FAKE_STATE/checked-out"; cat "$FAKE_STATE/fetched" >>"$FAKE_STATE/checkouts" ;;
esac
`;

const fakeCurl = `#!/bin/sh
${logCall}
tag=$(cat "$FAKE_STATE/checked-out" 2>/dev/null || git rev-parse HEAD)
case " $FAKE_HEALTHY_TAGS " in *" $tag "*) echo '{"ok":true}' ;; *) exit 7 ;; esac
`;

export interface Scenario {
  tags: string[];
  // The tags whose GET /health answers ok once they are checked out.
  healthyTags: string[];
  // The answer of `docker compose version --short`.
  composeVersion?: string;
  docker?: boolean;
  // The fake git fails every fetch.
  fetchFails?: boolean;
  // Real git instead of the fake one, for the repositories that the test creates.
  realGit?: boolean;
}

export interface InstallRun {
  status: number | null;
  stdout: string;
  stderr: string;
}

export interface InstallSandbox {
  // The install folder for --dir; it does not exist before the first run.
  dir: string;
  // A folder with the fixture .env.example, to build a source repository in.
  source: string;
  run(args: string[], scenario: Scenario): Promise<InstallRun>;
  // The fake calls of all runs: the program name, then its arguments.
  calls(): string[][];
  // The refs that git checked out in all runs, in order.
  checkouts(): string[];
  remove(): void;
}

function lines(path: string): string[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line !== '');
}

function linkSystemTools(tools: string) {
  mkdirSync(tools);
  for (const tool of systemTools) {
    const path = execFileSync('sh', ['-c', `command -v ${tool}`], { encoding: 'utf8' }).trim();
    symlinkSync(path, join(tools, tool));
  }
}

function writeFake(bin: string, name: string, body: string) {
  writeFileSync(join(bin, name), body);
  chmodSync(join(bin, name), 0o755);
}

function writeSource(source: string) {
  mkdirSync(source);
  const envExample = readFileSync(join(root, '.env.example'), 'utf8');
  writeFileSync(join(source, '.env.example'), `${envExample}\n# A fixture internal secret.\n${fixtureSecretKey}=\n`);
}

export function createInstallSandbox(): InstallSandbox {
  const base = mkdtempSync(join(tmpdir(), 'formgate-install-'));
  const [tools, source, state, log] = ['tools', 'source', 'state', 'calls.log'].map((name) => join(base, name));
  linkSystemTools(tools);
  writeSource(source);
  mkdirSync(state);
  writeFileSync(log, '');
  const dir = join(base, 'formgate');

  function run(args: string[], scenario: Scenario): Promise<InstallRun> {
    const bin = mkdtempSync(join(base, 'bin-'));
    if (scenario.realGit) symlinkSync(execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim(), join(bin, 'git'));
    else writeFake(bin, 'git', fakeGit);
    writeFake(bin, 'curl', fakeCurl);
    if (scenario.docker !== false) writeFake(bin, 'docker', fakeDocker);
    const env = {
      PATH: `${bin}:${tools}`,
      FAKE_LOG: log,
      FAKE_STATE: state,
      FAKE_SOURCE: source,
      FAKE_TAGS: scenario.tags.join(' '),
      FAKE_HEALTHY_TAGS: scenario.healthyTags.join(' '),
      FAKE_FETCH_FAILS: scenario.fetchFails ? '1' : '',
      FAKE_COMPOSE_VERSION: scenario.composeVersion ?? '2.29.1',
    };
    // detached: the script runs in its own session, without a terminal, as under `curl | sh` in CI.
    const child = spawn('/bin/sh', [installScript, '--dir', dir, ...args], { env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    return new Promise((resolve) => child.on('close', (status) => resolve({ status, stdout, stderr })));
  }

  return {
    dir,
    run,
    calls: () => lines(log).map((line) => line.split('\t')),
    source,
    checkouts: () => lines(join(state, 'checkouts')),
    remove: () => rmSync(base, { recursive: true, force: true }),
  };
}

// The KEY=value lines of an env file.
export function readEnvFile(path: string): Record<string, string> {
  const pairs = readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => /^[A-Z0-9_]+=/.test(line))
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]);
  return Object.fromEntries(pairs);
}

// The docker compose subcommands called, for example ['build'] or ['up', '-d'].
export function composeCommands(calls: string[][]): string[][] {
  return calls.filter((call) => call[0] === 'docker' && call[1] === 'compose').map((call) => call.slice(2));
}

// A docker call that removes a volume: `compose down -v`, `--volumes` or `volume rm`.
export function removesVolume(call: string[]): boolean {
  if (call[0] !== 'docker') return false;
  return call.includes('-v') || call.includes('--volumes') || (call[1] === 'volume' && call[2] === 'rm');
}
