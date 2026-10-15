// Builds the standalone formgate.js (one minified file, no bundler needed on the site) from the same client code, and
// formgate-pow-widget.js next to it: the ALTCHA widget, which formgate.js loads only for a form with data-formgate-pow.
// Usage: node scripts/build-client.mjs [outfile]. The default outfile is lite/formgate.js, next to submit.php.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = new URL('../', import.meta.url);
const outfile = process.argv[2] ?? fileURLToPath(new URL('lite/formgate.js', root));
const powWidgetFile = 'formgate-pow-widget.js';
const common = { bundle: true, minify: true, target: 'es2020' };

await build({
  ...common,
  entryPoints: [fileURLToPath(new URL('src/client/standalone.ts', root))],
  outfile,
  format: 'iife',
  define: { POW_WIDGET_FILE: JSON.stringify(powWidgetFile) },
});

await build({
  ...common,
  entryPoints: [fileURLToPath(new URL('src/client/pow-widget.ts', root))],
  outfile: join(dirname(outfile), powWidgetFile),
  format: 'esm',
});
