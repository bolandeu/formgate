// Static checks of the Pro Docker files: the compose file, the Dockerfile, the nginx templates, .env.example and the
// setup document.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { createProFolders, runCli, startPro } from '../../support/pro.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const read = (path: string) => readFileSync(root + path, 'utf8');

interface Volume {
  type: string;
  source: string;
  target: string;
}
interface Service {
  build?: { args?: Record<string, string> };
  image?: string;
  restart?: string;
  profiles?: string[];
  command?: string[];
  environment?: Record<string, string>;
  volumes?: Volume[];
  ports?: string[];
  healthcheck?: { test?: string[]; disable?: boolean };
}
const compose = parse(read('compose.yaml'), { merge: true }) as { services: Record<string, Service>; volumes: Record<string, unknown> };
const dev = parse(read('compose.dev.yaml'), { merge: true }) as { services: Record<string, { volumes: string[] }> };
const dockerfile = read('pro/Dockerfile');
const envExampleText = read('.env.example');

// The variables the Pro configuration reads: the keys of pro/src/Config/defaults.php.
const configVariables = [...read('pro/src/Config/defaults.php').matchAll(/^\s*'(FORMGATE_[A-Z_]+)' =>/gm)].map(
  (match) => match[1],
);

function envFile(text: string): Record<string, string> {
  const pairs = text
    .split('\n')
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]);
  return Object.fromEntries(pairs);
}

describe('compose.yaml and the Dockerfile', () => {
  it('builds web and worker from one serversideup/php fpm-nginx image', () => {
    expect(dockerfile).toMatch(/^FROM serversideup\/php:[\w.]+-fpm-nginx$/m);
    expect(compose.services.web.build).toEqual(compose.services.worker.build);
    expect(compose.services.web.image).toBe(compose.services.worker.image);
  });

  it('tags the image with FORMGATE_IMAGE_TAG, latest by default, and documents it in .env.example', () => {
    expect(compose.services.web.image).toBe('formgate-pro:${FORMGATE_IMAGE_TAG:-latest}');
    expect(envExampleText).toMatch(/^# FORMGATE_IMAGE_TAG=latest$/m);
  });

  it('restarts web and worker unless stopped, and the worker runs the worker loop', () => {
    expect(compose.services.web.restart).toBe('unless-stopped');
    expect(compose.services.worker.restart).toBe('unless-stopped');
    expect(compose.services.worker.command?.join(' ')).toMatch(/formgate worker$/);
  });

  it('keeps the data and the projects on named volumes at the folders Pro reads', () => {
    expect(Object.keys(compose.volumes).sort()).toEqual(['caddy_data', 'data', 'projects']);
    for (const name of ['web', 'worker']) {
      const service = compose.services[name];
      expect(service.volumes).toEqual([
        { type: 'volume', source: 'data', target: '/var/lib/formgate/data' },
        { type: 'volume', source: 'projects', target: '/var/lib/formgate/projects' },
      ]);
      expect(service.environment).toMatchObject({
        FORMGATE_DATA_DIR: '/var/lib/formgate/data',
        FORMGATE_PROJECTS_DIR: '/var/lib/formgate/projects',
      });
      expect(service.build?.args).toMatchObject({
        FORMGATE_DATA_DIR: '/var/lib/formgate/data',
        FORMGATE_PROJECTS_DIR: '/var/lib/formgate/projects',
      });
    }
  });

  it('sets the volume folders in compose.yaml only', () => {
    expect(dockerfile).not.toContain('/var/lib/formgate');
    expect(envFile(envExampleText)).not.toHaveProperty('FORMGATE_DATA_DIR');
    expect(envFile(envExampleText)).not.toHaveProperty('FORMGATE_PROJECTS_DIR');
  });

  it('takes the host port from .env and stops when one is missing', () => {
    expect(compose.services.web.ports?.[0]).toBe('${FORMGATE_WEB_PORT:?set FORMGATE_WEB_PORT in .env}:8080');
  });

  it('publishes web on 127.0.0.1 with the default values of .env.example', () => {
    const example = envFile(envExampleText);
    const published = (service: Service) =>
      (service.ports ?? []).map((port) =>
        port.replace(/\$\{(\w+):[?-][^}]*\}/g, (_, name: string) => example[name]),
      );
    expect(published(compose.services.web)).toEqual(['127.0.0.1:8095:8080', '127.0.0.1:8096:8081']);
  });

  it('maps FORMGATE_ADMIN_PORT to the admin port of the image, with the default of .env.example', () => {
    const adminPort = /^ARG ADMIN_HTTP_PORT=(\d+)$/m.exec(dockerfile)?.[1];
    expect(adminPort).toBe('8081');
    expect(compose.services.web.ports).toContain(`\${FORMGATE_ADMIN_PORT:-127.0.0.1:8096}:${adminPort}`);
    expect(envFile(envExampleText).FORMGATE_ADMIN_PORT).toBe('127.0.0.1:8096');
  });

  it('documents the admin keys in .env.example, empty', () => {
    expect(envFile(envExampleText).FORMGATE_ADMIN_KEYS).toBe('');
    expect(configVariables).toContain('FORMGATE_ADMIN_KEYS');
  });

  it('checks the health of web by GET /health; the worker has no health check', () => {
    expect(compose.services.web.healthcheck?.test?.join(' ')).toMatch(/\/health$/);
    expect(compose.services.worker.healthcheck).toEqual({ disable: true });
  });

  it('has web, worker and caddy only: no Mailpit service, no Mailpit variable, no profile on web and worker', () => {
    expect(Object.keys(compose.services).sort()).toEqual(['caddy', 'web', 'worker']);
    for (const name of ['web', 'worker']) expect(compose.services[name].profiles).toBeUndefined();
    expect(read('compose.yaml')).not.toMatch(/mailpit/i);
    expect(envExampleText).not.toMatch(/mailpit/i);
  });

  it('mounts the source in the dev override for web and worker', () => {
    for (const name of ['web', 'worker']) {
      expect(dev.services[name].volumes).toContain('./pro/src:/var/www/html/src');
    }
  });

  it('holds no secret value: secrets come from .env', () => {
    const files = [read('compose.yaml'), read('compose.dev.yaml'), dockerfile];
    for (const text of files) expect(text).not.toMatch(/(token|password|secret|key)\s*[:=]\s*[^\s$]{8,}/i);
    expect(compose.services.web).toHaveProperty('env_file');
  });
});

describe('the tls profile', () => {
  const caddy = compose.services.caddy;
  const caddyfile = read('pro/docker/Caddyfile');

  it('puts caddy in the profile tls only, with an exact image tag', () => {
    expect(caddy.profiles).toEqual(['tls']);
    expect(caddy.image).toMatch(/^caddy:\d+\.\d+\.\d+$/);
  });

  it('publishes 80 and 443 and keeps its data on a named volume', () => {
    expect(caddy.ports).toEqual(['80:80', '443:443']);
    expect(caddy.volumes).toContainEqual({ type: 'volume', source: 'caddy_data', target: '/data' });
    expect(compose.volumes).toHaveProperty('caddy_data');
  });

  it('reads the Caddy config with the site address FORMGATE_DOMAIN and the upstream web', () => {
    expect(caddy.volumes).toContainEqual(
      expect.objectContaining({ source: './pro/docker/Caddyfile', target: '/etc/caddy/Caddyfile' }),
    );
    expect(caddy.environment).toHaveProperty('FORMGATE_DOMAIN');
    expect(caddyfile).toMatch(/^\{\$FORMGATE_DOMAIN\} \{$/m);
    const upstream = /^\s*reverse_proxy (\S+)$/m.exec(caddyfile)?.[1];
    expect(upstream).toBe('web:8080');
    expect(Object.keys(compose.services)).toContain(upstream?.split(':')[0]);
  });

  it('requires no variable of the profile: FORMGATE_DOMAIN has a default and is not set in .env.example', () => {
    const uses = [...read('compose.yaml').matchAll(/\$\{FORMGATE_DOMAIN[^}]*\}/g)].map((match) => match[0]);
    expect(uses).toEqual(['${FORMGATE_DOMAIN:-}']);
    expect(envFile(envExampleText)).not.toHaveProperty('FORMGATE_DOMAIN');
    expect(envFile(envExampleText)).not.toHaveProperty('COMPOSE_PROFILES');
    expect(envExampleText).toMatch(/^# FORMGATE_DOMAIN=/m);
    expect(envExampleText).toMatch(/^# COMPOSE_PROFILES=tls$/m);
  });
});

// The paths that the PHP locations of an nginx file send to a script: location regex => SCRIPT_FILENAME.
function phpLocations(text: string): { pattern: RegExp; script: string }[] {
  const blocks = [...text.matchAll(/location ~ (\S+) \{([^}]*)\}/g)];
  return blocks.map(([, pattern, body]) => ({
    pattern: new RegExp(pattern),
    script: /fastcgi_param SCRIPT_FILENAME \$document_root\/(\S+);/.exec(body)?.[1] ?? '',
  }));
}
const scriptOf = (text: string, path: string) => phpLocations(text).find(({ pattern }) => pattern.test(path))?.script;

describe('the nginx template', () => {
  const template = read('pro/docker/nginx-http.conf.template');

  it('is the body of the server block of the image, not a server block of its own', () => {
    expect(template).not.toMatch(/^\s*server\s*\{/m);
    expect(template).toMatch(/^listen \$\{NGINX_HTTP_PORT\} default_server;$/m);
  });

  it('sends /f/<key> and /health to the form entry and no /admin path', () => {
    expect(scriptOf(template, '/f/abc')).toBe('index.php');
    expect(scriptOf(template, '/health')).toBe('index.php');
    for (const path of ['/admin', '/admin/projects', '/admin.php']) expect(scriptOf(template, path)).toBeUndefined();
  });
});

describe('the admin nginx template', () => {
  const template = read('pro/docker/nginx-admin.conf.template');

  it('is a server block of its own on the admin port, put in conf.d by the Dockerfile', () => {
    expect(template).toMatch(/^server \{$/m);
    expect(template).toMatch(/^\s*listen \$\{ADMIN_HTTP_PORT\};$/m);
    expect(dockerfile).toContain('/var/www/html/docker/nginx-admin.conf.template > /etc/nginx/conf.d/admin.conf');
  });

  it('sends /admin and /admin/... to the admin entry and nothing else', () => {
    for (const path of ['/admin', '/admin/projects', '/admin/projects/abc']) expect(scriptOf(template, path)).toBe('admin.php');
    for (const path of ['/f/abc', '/health', '/administrator', '/admin.php']) expect(scriptOf(template, path)).toBeUndefined();
  });
});

describe('.env.example', () => {
  const example = envFile(envExampleText);
  const composeEnvironment = compose.services.web.environment ?? {};

  it('uses every variable: each one is read by Pro or by compose.yaml', () => {
    const composeText = read('compose.yaml');
    for (const name of Object.keys(example)) {
      expect(configVariables.includes(name) || composeText.includes('${' + name) || name === 'COMPOSE_FILE').toBe(true);
    }
  });

  it('lists every variable the Pro configuration reads', () => {
    expect(configVariables.length).toBeGreaterThan(0);
    for (const name of configVariables) {
      expect(envExampleText).toContain(name);
      expect(name in example || name in composeEnvironment).toBe(true);
    }
  });

  it('holds no secret: a secret-like variable is empty or a <placeholder>', () => {
    const secrets = Object.entries(example).filter(([name]) => /TOKEN|PASSWORD|SECRET|KEY/.test(name));
    for (const [, value] of secrets) expect(value).toMatch(/^(|<[^>]+>)$/);
  });
});

describe('docs/pro-setup.md', () => {
  const doc = read('docs/pro-setup.md');

  it('has the commands of the manual check', () => {
    expect(doc).toContain('docker compose up -d');
    expect(doc).toContain('docker compose exec web php bin/formgate project:create');
    expect(doc).toMatch(/curl [^\n]*http:\/\/localhost:8095\/f\/\$KEY/);
    expect(doc).toContain('http://localhost:8095/health');
    expect(doc).not.toMatch(/mailpit_web_port|--profile/i);
  });

  it('has a project:create command that Pro accepts a form for', async () => {
    const [, command] = /docker compose exec web php bin\/formgate (project:create[^`]*?)\n```/.exec(doc) ?? [];
    const args = [...command.replace(/\\\n/g, ' ').matchAll(/'([^']*)'|(\S+)/g)].map((word) => word[1] ?? word[2]);
    const [, body] = /curl -i -X POST http:\/\/localhost:8095\/f\/\$KEY[\s\S]*?-d '([^']+)'/.exec(doc) ?? [];
    const folders = createProFolders();
    const pro = await startPro(folders);
    try {
      const run = await runCli(folders, args);
      expect(run.status).toBe(0);
      const key = /^Key: (\S+)$/m.exec(run.stdout)?.[1] ?? '';
      const response = await fetch(pro.formUrl(key), {
        method: 'POST',
        headers: { Origin: 'http://localhost', 'Content-Type': 'application/json', Accept: 'application/json' },
        body,
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
    } finally {
      pro.stop();
      folders.remove();
    }
  });

  it('names every project and failed command', () => {
    const commands = [...doc.matchAll(/^- `((?:project|failed)[\w:-]*)/gm)].map((match) => match[1]);
    expect(commands.sort()).toEqual(
      ['failed', 'failed:retry', 'project:case:add', 'project:case:list', 'project:case:move', 'project:case:remove', 'project:channel:add', 'project:channel:change', 'project:channel:remove', 'project:delete',
       'project:domain:add', 'project:domain:remove', 'project:self-check', 'project:set', 'project:show'].sort(),
    );
    expect(doc).toContain('project:create');
  });

  it('has only the public sections, and the manual check runs on any Docker host', () => {
    const headings = [...doc.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
    expect(headings).toEqual([
      '1. Установка и обновление скриптом',
      '2. Подготовка (вручную)',
      '3. Запуск (вручную)',
      '4. Первый проект',
      '5. Проверка (вручную)',
      '6. Логи и остановка',
      '7. Метка времени и спам-лог',
      '8. Admin API',
    ]);
    expect(doc).toContain('Проверку запускают на любом хосте с Docker и Compose v2');
  });
});
