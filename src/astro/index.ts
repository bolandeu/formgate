// The Astro integration formgate({endpoint?}): copies the Lite folder into dist/ (unless a Pro endpoint is set),
// gives components the handler URL through the virtual module virtual:formgate and binds forms with data-formgate
// on load and on astro:page-load. It adds no pages, routes or global CSS and is safe to add twice.
import type { AstroIntegration } from 'astro';
import { cpSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const name = 'formgate';
const liteFolder = 'formgate';
const virtualModule = 'virtual:formgate';
const resolvedVirtualModule = `\0${virtualModule}`;
// The standalone client of sites without a bundler, with its widget module; an Astro site gets the client in its own
// bundle.
const standaloneClient = ['formgate.js', 'formgate-pow-widget.js'];

export interface FormgateOptions {
  endpoint?: string;
}

// The client sits next to this module in src/ (.ts) and in dist/ (.js).
const clientEntry = fileURLToPath(new URL(`../client/index${extname(import.meta.url)}`, import.meta.url));
const liteSource = fileURLToPath(new URL('../../lite/', import.meta.url));

const bindScript = `
  import { bindForms } from ${JSON.stringify(clientEntry)};
  bindForms();
  document.addEventListener('astro:page-load', () => bindForms());
`;

const virtualModuleTypes = `declare module '${virtualModule}' {
  /** The URL that site forms post to: the Lite handler in dist/ or the Pro endpoint. */
  export const handlerUrl: string;
}
`;

interface HandlerPlugin {
  name: string;
  api: { handlerUrl: string };
  resolveId(id: string): string | undefined;
  load(id: string): string | undefined;
}

function handlerPlugin(handlerUrl: string): HandlerPlugin {
  return {
    name: virtualModule,
    api: { handlerUrl },
    resolveId: (id) => (id === virtualModule ? resolvedVirtualModule : undefined),
    load: (id) => (id === resolvedVirtualModule ? `export const handlerUrl = ${JSON.stringify(handlerUrl)};` : undefined),
  };
}

function findHandlerPlugin(plugins: unknown[] | undefined) {
  return (plugins ?? []).flat().find((plugin): plugin is HandlerPlugin => (plugin as { name?: string } | null)?.name === virtualModule);
}

// Lite is served under the site base: with base '/sub' the handler is /sub/formgate/submit.php.
function liteHandlerUrl(base: string) {
  return `${base.replace(/\/?$/, '/')}${liteFolder}/submit.php`;
}

export default function formgate(options: FormgateOptions = {}): AstroIntegration {
  let active = false;

  return {
    name,
    hooks: {
      'astro:config:setup': ({ config, injectScript, updateConfig, logger }) => {
        const handlerUrl = options.endpoint ?? liteHandlerUrl(config.base);
        // The first instance adds the virtual module plugin and does the work; a second one finds it and does nothing.
        const first = findHandlerPlugin(config.vite.plugins);
        active = !first;
        if (first) {
          if (first.api.handlerUrl !== handlerUrl) {
            logger.warn(`formgate() is added twice; the handler URL ${first.api.handlerUrl} wins over ${handlerUrl}.`);
          }
          return;
        }
        updateConfig({ vite: { plugins: [handlerPlugin(handlerUrl)] } });
        injectScript('page', bindScript);
      },
      'astro:config:done': ({ injectTypes }) => {
        if (active) injectTypes({ filename: 'virtual.d.ts', content: virtualModuleTypes });
      },
      'astro:build:done': ({ dir }) => {
        if (!active || options.endpoint) return;
        cpSync(liteSource, new URL(`${liteFolder}/`, dir), {
          recursive: true,
          filter: (source) => !standaloneClient.includes(basename(source)),
        });
      },
    },
  };
}
