// Starts php -S for the Lite and Pro harnesses and stops it with its PHP_CLI_SERVER_WORKERS children: the server
// runs as the leader of its own process group, and stop() signals the whole group. A plain kill of the leader
// leaves the workers alive.
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
  await waitForServer(origin + options.readyPath);
  return {
    origin,
    stop: () => {
      try {
        process.kill(-(child.pid as number), 'SIGTERM');
      } catch {
        // The group is gone already.
      }
    },
  };
}
