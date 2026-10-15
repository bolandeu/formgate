# Changelog

## v0.20.8 — 2026-10-15

### Outside epics

- CI: main is green again — composer cache dir without a root composer.json, internal CI tests out of the public tree

## v0.20.7 — 2026-10-15

### Outside epics

- Pro update: install.sh --update adds the new .env keys, with a random value for a new secret

## v0.20.6 — 2026-10-15

### Free self-hosted captcha: ALTCHA proof-of-work in the time token, invisible by default, widget on request

With require_pow on, each request costs the sender a small proof-of-work solved by the formgate client in the background (about half a second on a phone); a request without a valid solution goes to the spam log, not lost; a site can show the ALTCHA widget instead with one form attribute; no external service, no new account.

- CHANGELOG: the v0.20.5 entry text fits the public tree

## v0.20.5 — 2026-10-15

### Free self-hosted captcha: ALTCHA proof-of-work in the time token, invisible by default, widget on request

With require_pow on, each request costs the sender a small proof-of-work solved by the formgate client in the background (about half a second on a phone); a request without a valid solution goes to the spam log, not lost; a site can show the ALTCHA widget instead with one form attribute; no external service, no new account.

- Changelog: the integrator guide line names no private product

## v0.20.4 — 2026-10-15

### Free self-hosted captcha: ALTCHA proof-of-work in the time token, invisible by default, widget on request

With require_pow on, each request costs the sender a small proof-of-work solved by the formgate client in the background (about half a second on a phone); a request without a valid solution goes to the spam log, not lost; a site can show the ALTCHA widget instead with one form attribute; no external service, no new account.

- Integrator guide for the captcha: how a site builder turns on and shows the ALTCHA proof-of-work

## v0.20.3 — 2026-10-15

### Outside epics

- Astro integration: option bind (default true); bind: false injects no client script

## v0.20.2 — 2026-10-15

### Free self-hosted captcha: ALTCHA proof-of-work in the time token, invisible by default, widget on request

With require_pow on, each request costs the sender a small proof-of-work solved by the formgate client in the background (about half a second on a phone); a request without a valid solution goes to the spam log, not lost; a site can show the ALTCHA widget instead with one form attribute; no external service, no new account.

- Pro: ALTCHA proof-of-work per project (project:set), challenge on /f/<key>?token, spam:release of pow requests

## v0.20.1 — 2026-10-15

### Free self-hosted captcha: ALTCHA proof-of-work in the time token, invisible by default, widget on request

With require_pow on, each request costs the sender a small proof-of-work solved by the formgate client in the background (about half a second on a phone); a request without a valid solution goes to the spam log, not lost; a site can show the ALTCHA widget instead with one form attribute; no external service, no new account.

- ALTCHA proof-of-work on the server (core and Lite): challenge in GET ?token, __pow check, spam reasons, settings

## v0.20.0 — 2026-10-15

### Free self-hosted captcha: ALTCHA proof-of-work in the time token, invisible by default, widget on request

With require_pow on, each request costs the sender a small proof-of-work solved by the formgate client in the background (about half a second on a phone); a request without a valid solution goes to the spam log, not lost; a site can show the ALTCHA widget instead with one form attribute; no external service, no new account.

- Client: solve the ALTCHA challenge invisibly and send __pow; the ALTCHA widget on data-formgate-pow="widget"

## v0.19.0 — 2026-10-15

### Webhook channel: a signed JSON request to any receiver, Lite and Pro

The operator adds a channel of type webhook with a receiver URL and a secret; each request arrives there as one versioned JSON body signed by the Standard Webhooks scheme; the receiver checks the signature with a ready library; Pro repeats a failed delivery with the same webhook-id.

- Webhook channel in Pro: private-address guard, masked secrets, same webhook-id on repeats

## v0.18.0 — 2026-10-15

### Webhook channel: a signed JSON request to any receiver, Lite and Pro

The operator adds a channel of type webhook with a receiver URL and a secret; each request arrives there as one versioned JSON body signed by the Standard Webhooks scheme; the receiver checks the signature with a ready library; Pro repeats a failed delivery with the same webhook-id.

- Webhook channel in the core and Lite: versioned JSON body, Standard Webhooks signature, headers, https only

## v0.17.4 — 2026-10-15

### Outside epics

- packageManager: pnpm 12.11.2, the version baked into the CI runner image

## v0.17.3 — 2026-10-15

### Outside epics

- CI: pnpm store cache in publish and fetch retries, so a slow network does not break a release

## v0.17.2 — 2026-10-15

### Cleanup: current docs only, no server paths in the JSON self-check

Every doc of the repo says what the code does now, once, in the right place; a done plan or backlog item is gone; the public docs name nothing private; the JSON self-check gives where the settings are, not the server path.

- Pro: project:set refuses project.retention_days; retention stays global

## v0.17.1 — 2026-10-15

### Cleanup: current docs only, no server paths in the JSON self-check

Every doc of the repo says what the code does now, once, in the right place; a done plan or backlog item is gone; the public docs name nothing private; the JSON self-check gives where the settings are, not the server path.

- Docs sweep: every doc says what the code does now, once, with nothing done-as-future

## v0.17.0 — 2026-10-15

### Cleanup: current docs only, no server paths in the JSON self-check

Every doc of the repo says what the code does now, once, in the right place; a done plan or backlog item is gone; the public docs name nothing private; the JSON self-check gives where the settings are, not the server path.

- Lite JSON self-check: drop the settings file path, keep found and where

## v0.16.0 — 2026-10-15

### Analytics fields: meta_ fields to storage and CRM, a short source block for managers, server request data

A site sends any number (up to 50) of meta_ fields. They are stored in full with the request and the spam log. Bitrix24 leads get UTM in the standard UTM fields and the other analytics in SOURCE_DESCRIPTION, with COMMENTS for the visitor's fields only. Telegram and email show the visitor's fields first and then a short source block (source, page, referrer). Each request also keeps server data: request id, IP, User-Agent, origin host, under the same retention.

- Server request data: id, IP, User-Agent and origin host stored with each request

## v0.15.0 — 2026-10-15

### Pro admin API: manage projects from outside by an admin key

A tool with an admin key creates, shows, changes and deletes Pro projects over a JSON API that listens on its own port, not on the public form port. Create is idempotent by the tool's external id. Two admin keys can be valid at once for rotation. Secrets never come back in answers. The same rules as the CLI apply.

- Pro admin API: domains, channels, delete and self-check

## v0.14.0 — 2026-10-15

### Analytics fields: meta_ fields to storage and CRM, a short source block for managers, server request data

A site sends any number (up to 50) of meta_ fields. They are stored in full with the request and the spam log. Bitrix24 leads get UTM in the standard UTM fields and the other analytics in SOURCE_DESCRIPTION, with COMMENTS for the visitor's fields only. Telegram and email show the visitor's fields first and then a short source block (source, page, referrer). Each request also keeps server data: request id, IP, User-Agent, origin host, under the same retention.

- Analytics fields: meta_ limits, the source block in Telegram and email, UTM and SOURCE_DESCRIPTION in Bitrix24

## v0.13.0 — 2026-10-15

### Site integration kit: test delivery, machine self-check, form texts, shared field rules, outbox switch

A site's automatic tests run Lite under php -S and read the delivered requests from a file. A post-publish check gets the Lite setup as JSON by the self-check key. A form sets its own success, error and offline texts and can turn the offline outbox off. The client package exports the field rules the server checks, from one source. CI runs the tests once per push of a branch and reuses the package caches. Contract changes get a minor version.

- Lite: test delivery to a file and the JSON self-check

## v0.12.0 — 2026-10-15

### Pro admin API: manage projects from outside by an admin key

A tool with an admin key creates, shows, changes and deletes Pro projects over a JSON API that listens on its own port, not on the public form port. Create is idempotent by the tool's external id. Two admin keys can be valid at once for rotation. Secrets never come back in answers. The same rules as the CLI apply.

- Pro admin API frame: own port, admin keys, idempotent create and show

## v0.11.0 — 2026-10-15

### Site integration kit: test delivery, machine self-check, form texts, shared field rules, outbox switch

A site's automatic tests run Lite under php -S and read the delivered requests from a file. A post-publish check gets the Lite setup as JSON by the self-check key. A form sets its own success, error and offline texts and can turn the offline outbox off. The client package exports the field rules the server checks, from one source. CI runs the tests once per push of a branch and reuses the package caches. Contract changes get a minor version.

- Client: form texts, outbox switch and the shared field rules

## v0.10.8 — 2026-10-15

### Site integration kit: test delivery, machine self-check, form texts, shared field rules, outbox switch

A site's automatic tests run Lite under php -S and read the delivered requests from a file. A post-publish check gets the Lite setup as JSON by the self-check key. A form sets its own success, error and offline texts and can turn the offline outbox off. The client package exports the field rules the server checks, from one source. CI runs the tests once per push of a branch and reuses the package caches. Contract changes get a minor version.

- Public CI: set up pnpm before setup-node

## v0.10.7 — 2026-10-15

### Site integration kit: test delivery, machine self-check, form texts, shared field rules, outbox switch

A site's automatic tests run Lite under php -S and read the delivered requests from a file. A post-publish check gets the Lite setup as JSON by the self-check key. A form sets its own success, error and offline texts and can turn the offline outbox off. The client package exports the field rules the server checks, from one source. CI runs the tests once per push of a branch and reuses the package caches. Contract changes get a minor version.

- CI: tests once per branch push with caches; minor version for contract changes

## v0.10.6 — 2026-10-15

### Outside epics

- Release: the npm package must carry the Lite vendor folder

## v0.10.5 — 2026-10-15

### Public GitHub mirror and npm package formgate

github.com/bolandeu/formgate is public under MIT with an English README and a Russian README. Each release tag vX.Y.Z of the source repo adds by itself one clean commit and the same tag to the public repo and publishes the npm package formgate. The public tree and its history contain no secret, no private host or address, no personal email and no name of the owner's other products.

- Release publish job: public GitHub commit and npm on a version tag

## v0.10.4 — 2026-10-15

### Public GitHub mirror and npm package formgate

github.com/bolandeu/formgate is public under MIT with an English README and a Russian README. Each release tag vX.Y.Z of the source repo adds by itself one clean commit and the same tag to the public repo and publishes the npm package formgate. The public tree and its history contain no secret, no private host or address, no personal email and no name of the owner's other products.

- Public face: MIT licence, READMEs, package name formgate, clean texts

## v0.10.3 — 2026-10-15

### Public GitHub mirror and npm package formgate

github.com/bolandeu/formgate is public under MIT with an English README and a Russian README. Each release tag vX.Y.Z of the source repo adds by itself one clean commit and the same tag to the public repo and publishes the npm package formgate. The public tree and its history contain no secret, no private host or address, no personal email and no name of the owner's other products.

- Public export tool: allow list, deny-list scan, release commit

## v0.10.2 — 2026-10-15

### Public GitHub mirror and npm package formgate

github.com/bolandeu/formgate is public under MIT with an English README and a Russian README. Each release tag vX.Y.Z of the source repo adds by itself one clean commit and the same tag to the public repo and publishes the npm package formgate. The public tree and its history contain no secret, no private host or address, no personal email and no name of the owner's other products.

- Lite: drop the old settings adapter

## v0.10.1 — 2026-10-15

### Routing: special cases by form and field value, required fields in settings

The operator sets special cases in a project: a request of a given form, or with a field equal to a value, goes only to the channels of the first matching case; others take the default route. Required fields from the project and the case are always checked, the form can only add to them. The operator sees which route a request took.

- Pro CLI for special cases; channel removal guard; the route in failed and spam:list

## v0.10.0 — 2026-10-15

### Routing: special cases by form and field value, required fields in settings

The operator sets special cases in a project: a request of a given form, or with a field equal to a value, goes only to the channels of the first matching case; others take the default route. Required fields from the project and the case are always checked, the form can only add to them. The operator sees which route a request took.

- Routing in the core and Lite: special cases, required fields from settings, the route of each request

## v0.9.2 — 2026-10-15

### Outside epics

- Pro project:set: turn the time token check on and set its limits

## v0.9.1 — 2026-10-15

### Outside epics

- CI install job: full checkout; install.sh stops on a failed fetch and installs a ref from a shallow repo

## v0.9.0 — 2026-10-15

### Time token: a signed one-time __token against bots, without losing a visitor's request

With the check on in a project, a request reaches the channels only with a fresh valid token from the client; bots without it land in the spam log with a reason; a real visitor with the client is never dropped: the client waits out the lower limit, takes a new token after every send, and keeps the request when the gateway is down; a request kept in the spam log for a token problem can be released by the operator.

- Time token in Pro: token endpoint per project, FORMGATE_TOKEN_SECRET, spam:release

## v0.8.0 — 2026-10-15

### Time token: a signed one-time __token against bots, without losing a visitor's request

With the check on in a project, a request reaches the channels only with a fresh valid token from the client; bots without it land in the spam log with a reason; a real visitor with the client is never dropped: the client waits out the lower limit, takes a new token after every send, and keeps the request when the gateway is down; a request kept in the spam log for a token problem can be released by the operator.

- Time token in the core and Lite: issue, check, spam reasons, signing key, self-check, contract

## v0.7.0 — 2026-10-15

### Time token: a signed one-time __token against bots, without losing a visitor's request

With the check on in a project, a request reaches the channels only with a fresh valid token from the client; bots without it land in the spam log with a reason; a real visitor with the client is never dropped: the client waits out the lower limit, takes a new token after every send, and keeps the request when the gateway is down; a request kept in the spam log for a token problem can be released by the operator.

- Client: time token without losing a request — token fetch, wait for the lower limit, new token per send, offline outbox

## v0.6.1 — 2026-10-15

### Pro installer: install and update Pro on any server with one command

On a clean server with Docker, one curl | sh command installs the chosen Pro version and prints how to create the first project; the same script with --update moves to a newer tag and rolls back by itself when /health does not answer. CI proves every tag installs.

- CI: install every pushed commit with install.sh and wait for /health

## v0.6.0 — 2026-10-15

### Pro installer: install and update Pro on any server with one command

On a clean server with Docker, one curl | sh command installs the chosen Pro version and prints how to create the first project; the same script with --update moves to a newer tag and rolls back by itself when /health does not answer. CI proves every tag installs.

- install.sh: install, --version, --repo, --update with rollback, lock; tested with fake docker, git and curl

## v0.5.0 — 2026-10-15

### Pro installer: install and update Pro on any server with one command

On a clean server with Docker, one curl | sh command installs the chosen Pro version and prints how to create the first project; the same script with --update moves to a newer tag and rolls back by itself when /health does not answer. CI proves every tag installs.

- Compose profile tls: Caddy in front of web with a Let's Encrypt certificate for the domain

## v0.4.6 — 2026-10-15

### Pro installer: install and update Pro on any server with one command

On a clean server with Docker, one curl | sh command installs the chosen Pro version and prints how to create the first project; the same script with --update moves to a newer tag and rolls back by itself when /health does not answer. CI proves every tag installs.

- Email channel: header X-Tags: formgate on every letter, Lite and Pro

## v0.4.5 — 2026-10-14

### Outside epics

- Compose: remove Mailpit from the production Compose project

## v0.4.4 — 2026-10-14

### Pro: one gateway for many sites of the operator, in Docker Compose

One Docker Compose project on a VPS takes the forms of many sites by project key, answers sent once the request is stored, delivers through the worker with per-channel retries, alerts the operator when a channel goes down and up, and is managed from the CLI.

- Compose: publish ports on 127.0.0.1 by default; pin the Mailpit image version

## v0.4.3 — 2026-10-14

### Pro: one gateway for many sites of the operator, in Docker Compose

One Docker Compose project on a VPS takes the forms of many sites by project key, answers sent once the request is stored, delivers through the worker with per-channel retries, alerts the operator when a channel goes down and up, and is managed from the CLI.

- Pro setup doc: first project and the manual check through the CLI

## v0.4.2 — 2026-10-14

### Pro: one gateway for many sites of the operator, in Docker Compose

One Docker Compose project on a VPS takes the forms of many sites by project key, answers sent once the request is stored, delivers through the worker with per-channel retries, alerts the operator when a channel goes down and up, and is managed from the CLI.

- Pro: spam log, rate and duplicate records per project; create takes the first channel; Lite limit names accessor

## v0.4.1 — 2026-10-14

### Pro: one gateway for many sites of the operator, in Docker Compose

One Docker Compose project on a VPS takes the forms of many sites by project key, answers sent once the request is stored, delivers through the worker with per-channel retries, alerts the operator when a channel goes down and up, and is managed from the CLI.

- Pro in Docker Compose: web and worker images, volumes, dev profile with Mailpit

## v0.4.0 — 2026-10-14

### Pro: one gateway for many sites of the operator, in Docker Compose

One Docker Compose project on a VPS takes the forms of many sites by project key, answers sent once the request is stored, delivers through the worker with per-channel retries, alerts the operator when a channel goes down and up, and is managed from the CLI.

- Pro delivery: per-channel retries on a schedule, operator alerts down/up, retention, failed list and retry from the CLI

## v0.3.0 — 2026-10-14

### Pro: one gateway for many sites of the operator, in Docker Compose

One Docker Compose project on a VPS takes the forms of many sites by project key, answers sent once the request is stored, delivers through the worker with per-channel retries, alerts the operator when a channel goes down and up, and is managed from the CLI.

- Pro CLI for projects: create, show, change, delete projects, domains and channels through the registry; project self-check

## v0.2.0 — 2026-10-14

### Pro: one gateway for many sites of the operator, in Docker Compose

One Docker Compose project on a VPS takes the forms of many sites by project key, answers sent once the request is stored, delivers through the worker with per-channel retries, alerts the operator when a channel goes down and up, and is managed from the CLI.

- Pro frame: delivery behind an interface, intake by project key, SQLite queue, worker --once, /health, CLI app, harness

## v0.1.5 — 2026-10-14

### Outside epics

- Tests: force the guarded backend when the tests run as root (CI)

## v0.1.4 — 2026-10-14

### Lite: a form handler next to any landing page

The operator copies the Lite folder next to a static site (shared hosting public_html or a VPS), puts one settings file above the web root, opens the self-check, and a form built by docs/integration.md delivers requests to email, Telegram and Bitrix24. Bots are dropped silently into the spam log, nothing is lost when channels fail, and an Astro site gets all of it from formgate/astro.

- Lite operator setup: settings lookup, compatibility with the older settings file, self-check, PHP 8.1 run

## v0.1.3 — 2026-10-14

### Lite: a form handler next to any landing page

The operator copies the Lite folder next to a static site (shared hosting public_html or a VPS), puts one settings file above the web root, opens the self-check, and a form built by docs/integration.md delivers requests to email, Telegram and Bitrix24. Bots are dropped silently into the spam log, nothing is lost when channels fail, and an Astro site gets all of it from formgate/astro.

- CI install: allow the esbuild build script for pnpm

## v0.1.2 — 2026-10-14

### Lite: a form handler next to any landing page

The operator copies the Lite folder next to a static site (shared hosting public_html or a VPS), puts one settings file above the web root, opens the self-check, and a form built by docs/integration.md delivers requests to email, Telegram and Bitrix24. Bots are dropped silently into the spam log, nothing is lost when channels fail, and an Astro site gets all of it from formgate/astro.

- Lite storage and spam filter: SQLite, JSONL, guarded JSONL, spam log, rate limit, duplicates

## v0.1.1 — 2026-10-14

### Lite: a form handler next to any landing page

The operator copies the Lite folder next to a static site (shared hosting public_html or a VPS), puts one settings file above the web root, opens the self-check, and a form built by docs/integration.md delivers requests to email, Telegram and Bitrix24. Bots are dropped silently into the spam log, nothing is lost when channels fail, and an Astro site gets all of it from formgate/astro.

- Lite channels: email with a method chain, Bitrix24, operator alerts
- Client, formgate.js and the Astro integration in the published package
- CI: the test suite on PHP 8.1 and the latest PHP on every push

## v0.1.0 — 2026-10-14

### Lite: a form handler next to any landing page

The operator copies the Lite folder next to a static site (shared hosting public_html or a VPS), puts one settings file above the web root, opens the self-check, and a form built by docs/integration.md delivers requests to email, Telegram and Bitrix24. Bots are dropped silently into the spam log, nothing is lost when channels fail, and an Astro site gets all of it from formgate/astro.

- Lite frame: package, test harness, intake, checks, response contract, Telegram channel
