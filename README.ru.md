# formgate

[English](README.md) | Русский

Шлюз форм для статических сайтов: принимает заявку из формы, отсекает спам и доставляет заявку на email, в Telegram или в Bitrix24.

- **Lite.** PHP-обработчик (`submit.php`), который кладётся рядом со статическим сайтом. Работает на виртуальном хостинге и на VPS с PHP 8.1+.
- **Pro.** Один проект Docker Compose, который обслуживает формы многих сайтов по ключу проекта: очередь, повторы доставки, оповещения оператора и CLI.

## Установка

Lite, клиент и интеграция с Astro ставятся из npm:

```
npm install formgate
```

Pro ставится на сервер с Docker и Compose v2 установочным скриптом из этого репозитория:

```
curl -fsSL https://raw.githubusercontent.com/bolandeu/formgate/main/install.sh | sh -s -- --port 8095
```

## Документация

- [Контракт формы и подключение](docs/integration.md)
- [Установка Lite](docs/lite-setup.md)
- [Установка Pro](docs/pro-setup.md)
- [HTTPS для Pro](docs/pro-tls.md)

## Лицензия

[MIT](LICENSE)

## Что даёт пакет

| Импорт | Что это |
| --- | --- |
| `formgate/client` | `bindForm(form, {fetch?})` и `bindForms(root?)` для сайтов со сборщиком |
| `formgate/astro` | интеграция Astro `formgate({endpoint?})` |
| `formgate/lite/*` | файлы папки Lite, с `lite/vendor` и лицензией PHPMailer |

`astro` — необязательная peer-зависимость: она нужна только интеграции с Astro.

## Три способа привязать форму

Все три ведут себя одинаково: форма уходит JSON-ом на свой `action`, кнопка отправки заблокирована на время отправки, ответ следует контракту `docs/integration.md`, раздел 8. Форма привязывается один раз, сколько бы раз её ни привязывали.

1. **npm-клиент.** `bindForm(form)` привязывает одну форму; `bindForms()` — каждую `form[data-formgate]`. На время отправки блокируется каждая кнопка отправки формы, и `<button>` без `type` тоже.
2. **`formgate.js`.** Отдельный файл из того же кода, сборщик не нужен. Он привязывает каждую `form[data-formgate]` по `DOMContentLoaded`. Сборка пишет его в `lite/formgate.js`, рядом с `submit.php`. Интеграция Astro его не копирует: у сайта на Astro клиент в его собственном бандле.
3. **Интеграция Astro.** Добавьте её в `astro.config.mjs`:

   ```js
   import formgate from 'formgate/astro';

   export default defineConfig({ integrations: [formgate()] });
   ```

   Без `endpoint` сборка копирует папку Lite в `dist/formgate/`, и адрес обработчика — `<base>formgate/submit.php` (`base` Astro, например `/sub/formgate/submit.php`). С `endpoint` (адрес Pro) она ничего не копирует, и адрес обработчика — этот `endpoint`. Компоненты берут адрес обработчика из виртуального модуля:

   ```astro
   ---
   import { handlerUrl } from 'virtual:formgate';
   ---
   <form action={handlerUrl} method="post" data-formgate>…</form>
   ```

   Интеграция объявляет типы `virtual:formgate` в `.astro/` (`astro check` знает `handlerUrl`). Она привязывает формы при загрузке и на `astro:page-load` (`ClientRouter`). Она не добавляет страниц, маршрутов и глобального CSS, и второе подключение не вредит: работает первый экземпляр, а второй с другим `endpoint` пишет предупреждение в лог.

## События и состояния

Форма шлёт событие `formgate:success` (`detail` — тело ответа) и `formgate:error` (`detail` — `{code, error, errors}`; после сбоя сети `code` равен `network_error`). `[data-form-status]` получает `data-state="success"` или `"error"`. При успехе его текст — благодарность. При ошибке его текст — тексты полей через пробел, или `error`, или запасной текст после сбоя сети. Поля из `errors` получают `aria-invalid="true"`.

## Разработка

```
pnpm install
pnpm run build   # dist/ (tsc) и lite/formgate.js (esbuild)
pnpm test
```
