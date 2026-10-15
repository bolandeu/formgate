# formgate

English | [Русский](README.ru.md)

A form gateway for static sites: it takes a form request, drops spam, and delivers the request to email, Telegram or Bitrix24.

- **Lite.** A PHP handler (`submit.php`) that you copy next to a static site. It works on shared hosting and on a VPS with PHP 8.1+.
- **Pro.** One Docker Compose project that serves the forms of many sites by project key, with a queue, repeats, operator alerts and a CLI.

## Install

Lite, the client and the Astro integration come from npm:

```
npm install formgate
```

Pro installs on a server with Docker and Compose v2 with the install script from this repository:

```
curl -fsSL https://raw.githubusercontent.com/bolandeu/formgate/main/install.sh | sh -s -- --port 8095
```

## Docs

The docs are in Russian.

- [Form contract and integration](docs/integration.md)
- [Lite setup](docs/lite-setup.md)
- [Pro setup](docs/pro-setup.md)
- [HTTPS for Pro](docs/pro-tls.md)

## Licence

[MIT](LICENSE)

## What the package exposes

| Import | What it is |
| --- | --- |
| `formgate/client` | `bindForm(form, {fetch?})` and `bindForms(root?)` for sites with a bundler; the field rules `rules` (`phoneDigitsMin`, `phoneDigitsMax`, `maxValueLength`, `maxFields`, `maxBodyBytes`) and the checks `checkPhone(value)` and `checkEmail(value)`, which give the same result as the server |
| `formgate/astro` | the Astro integration `formgate({endpoint?})` |
| `formgate/lite/*` | the files of the Lite folder, with `lite/vendor` and the PHPMailer licence |

`astro` is an optional peer dependency: only the Astro integration needs it.

## Three ways to bind a form

All three give the same behaviour: the form goes as JSON to its `action`, the submit button is locked while sending, the answer follows the contract of `docs/integration.md` section 8. A form is bound once, however often it is bound.

1. **npm client.** `bindForm(form)` binds one form; `bindForms()` binds every `form[data-formgate]`. Every submit button of the form is locked while sending, a `<button>` without `type` too.
2. **`formgate.js`.** A standalone file built from the same code, no bundler needed. It binds every `form[data-formgate]` on `DOMContentLoaded`. The build writes it to `lite/formgate.js`, next to `submit.php`. The Astro integration does not copy it: an Astro site has the client in its own bundle.
3. **Astro integration.** Add it to `astro.config.mjs`:

   ```js
   import formgate from 'formgate/astro';

   export default defineConfig({ integrations: [formgate()] });
   ```

   Without `endpoint` the build copies the Lite folder to `dist/formgate/`, and the handler URL is `<base>formgate/submit.php` (Astro `base`, for example `/sub/formgate/submit.php`). With `endpoint` (a Pro URL) it copies nothing, and the handler URL is the endpoint. Components read the handler URL from the virtual module:

   ```astro
   ---
   import { handlerUrl } from 'virtual:formgate';
   ---
   <form action={handlerUrl} method="post" data-formgate>…</form>
   ```

   The integration declares the types of `virtual:formgate` in `.astro/` (`astro check` knows `handlerUrl`). It binds forms on load and on `astro:page-load` (`ClientRouter`). It adds no pages, routes or global CSS, and adding it twice does no harm: the first instance works, and a second one with another `endpoint` logs a warning.

## Events and states

The form fires `formgate:success` (`detail` is the response body) and `formgate:error` (`detail` is `{code, error, errors}`; after a network failure `code` is `network_error`). `[data-form-status]` gets `data-state="success"` or `"error"`. On success its text is a thank-you text. On error its text is the field texts joined, or `error`, or a fallback text after a network failure. Fields named in `errors` get `aria-invalid="true"`.

A form sets its own texts with attributes; without one the current text stays:

- `data-formgate-success-text`: the text after success.
- `data-formgate-error-text`: the general error text, for an answer with no field errors and no `error`, and after a network failure. Field texts from the server are shown as before.
- `data-formgate-queued-text`: the text when the request waits in the offline outbox.
- `data-formgate-outbox="off"`: turns the outbox off for this form. A network failure writes nothing to `localStorage` and gives `code: 'network_error'`. Other forms keep the outbox. The default is on.

## Development

```
pnpm install
pnpm run build   # dist/ (tsc) and lite/formgate.js (esbuild)
pnpm test
```
