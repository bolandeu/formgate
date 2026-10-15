// Global test setup: installs the Composer dependencies of Lite and Pro into lite/vendor and pro/vendor (vendor is
// not in git; CI gets them here too) and builds the package (dist/ and lite/formgate.js) once, so no test writes
// into the Lite folder while others read it.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const composerProjects = ['../../lite/', '../../pro/'].map((path) => fileURLToPath(new URL(path, import.meta.url)));

export default function setup() {
  for (const cwd of composerProjects) {
    execFileSync('composer', ['install', '--no-dev', '--no-interaction', '--no-progress', '--quiet'], {
      cwd,
      stdio: 'inherit',
    });
  }
  execFileSync('pnpm', ['run', 'build'], { stdio: 'inherit' });
}
