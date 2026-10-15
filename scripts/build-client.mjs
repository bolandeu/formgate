// Builds the standalone formgate.js (one minified file, no bundler needed on the site) from the same client code.
// Usage: node scripts/build-client.mjs [outfile]. The default outfile is lite/formgate.js, next to submit.php.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const outfile = process.argv[2] ?? fileURLToPath(new URL('lite/formgate.js', root));

await build({
  entryPoints: [fileURLToPath(new URL('src/client/standalone.ts', root))],
  outfile,
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
});
