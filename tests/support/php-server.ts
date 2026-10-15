// Starts php -S for the Lite and Pro harnesses and stops it with its PHP_CLI_SERVER_WORKERS children: the server
// runs as the leader of its own process group, and stop() signals the whole group. A plain kill of the leader
// leaves the workers alive. A watchdog process outside the group kills the group when the process that started it
// is gone, also after SIGKILL, and a failed start stops the group before the error is thrown.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

export const php = process.env.FORMGATE_PHP || 'php';

interface PhpServer {
  // http://127.0.0.1:<port>
  origin: string;
  stop(): void;
}

interface PhpServerOptions {
  ini: Record<string, string>;
  // The arguments after `-S <address>`: a document root (-t) and a router script.
  serve: string[];
  env: Record<string, string>;
  // The path that answers once the server is up.
  readyPath: string;
}

// Polls the parent and the group every 0.2 s; it ends when either is gone, and kills the group if the parent went.
// The `kill -s <signal> --` form works in both dash (/bin/sh on Debian and Ubuntu) and bash.
const watchdogScript = `
while kill -s 0 "$1" 2>/dev/null && kill -s 0 -- "-$2" 2>/dev/null; do sleep 0.2; done
kill -s TERM -- "-$2" 2>/dev/null
`;

function killGroup(leaderPid: number) {
  try {
    process.kill(-leaderPid, 'SIGTERM');
  } catch {
    // The group is gone already.
  }
}

function freePort() {
  return new Promise<number>((resolve) => {
    const probe = createServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });
}

async function waitForServer(url: string) {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`php -S did not start: ${url}`);
}

export async function startPhpServer(options: PhpServerOptions): Promise<PhpServer> {
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(
    php,
    [
      ...Object.entries(options.ini).flatMap(([key, value]) => ['-d', `${key}=${value}`]),
      '-S',
      `127.0.0.1:${port}`,
      ...options.serve,
    ],
    { env: { ...process.env, ...options.env }, stdio: 'ignore', detached: true },
  );
  const groupId = child.pid as number;
  spawn('sh', ['-c', watchdogScript, 'watchdog', String(process.pid), String(groupId)], {
    stdio: 'ignore',
    detached: true,
  }).unref();
  try {
    await waitForServer(origin + options.readyPath);
  } catch (error) {
    killGroup(groupId);
    throw error;
  }
  return { origin, stop: () => killGroup(groupId) };
}
