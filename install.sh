#!/bin/sh
# Installs and updates Formgate Pro on a server with Docker: one Compose project in one folder (ADR 0006).
# curl -fsSL <url>/install.sh | sh -s -- [options]; docs/pro-setup.md describes the options.
# The folder is a git checkout of a vX.Y.Z tag with .env next to compose.yaml; .install/ holds the lock and the
# installed and previous tags. Only the last line runs anything, so a cut download runs nothing.

# The defaults of the flags.
formgate_defaults() {
  repo_default=https://github.com/bolandeu/formgate.git
  dir=/opt/formgate
  health_timeout=120
  mode=install
  version='' ref='' repo='' domain='' port='' alert_bot_token='' alert_chat_id='' assume_yes='' tls=''
}

say() { printf '%s\n' "$*"; }
die() {
  printf 'install.sh: %s\n' "$*" >&2
  exit 1
}

parse_args() {
  while [ $# -gt 0 ]; do
    case $1 in
      --update) mode=update ;;
      --yes) assume_yes=1 ;;
      --tls) tls=1 ;;
      --*)
        [ $# -ge 2 ] || die "$1 needs a value"
        set_option "$1" "$2"
        shift
        ;;
      *) die "unknown argument $1; the options are in docs/pro-setup.md" ;;
    esac
    shift
  done
}

set_option() {
  case $1 in
    --version) version=$2 ;;
    --ref) ref=$2 ;;
    --repo) repo=$2 ;;
    --dir) dir=$2 ;;
    --domain) domain=$2 ;;
    --port) port=$2 ;;
    --alert-bot-token) alert_bot_token=$2 ;;
    --alert-chat-id) alert_chat_id=$2 ;;
    --health-timeout) health_timeout=$2 ;;
    *) die "unknown option $1; the options are in docs/pro-setup.md" ;;
  esac
}

check_docker() {
  command -v docker >/dev/null 2>&1 ||
    die "Docker is not installed. Install Docker Engine: https://docs.docker.com/engine/install/"
  compose_version=$(docker compose version --short 2>/dev/null) || compose_version=''
  compose_major=${compose_version#v}
  compose_major=${compose_major%%.*}
  case $compose_major in '' | *[!0-9]*) compose_major=0 ;; esac
  [ "$compose_major" -ge 2 ] ||
    die "Docker Compose v2 is missing (found: ${compose_version:-none}). Install the Docker Compose v2 plugin: https://docs.docker.com/compose/install/linux/"
}

# The repository: --repo, else the one of an existing install, else the default.
resolve_repo() {
  [ -n "$repo" ] && return
  if [ -d "$dir/.git" ]; then
    repo=$(git -C "$dir" config --get remote.origin.url) || repo=''
  fi
  [ -n "$repo" ] || repo=$repo_default
}

# The tag to install: --version or the highest vX.Y.Z tag of the repository. Reads only, changes nothing.
resolve_tag() {
  listing=$(git ls-remote --tags --refs "$repo") || die "cannot read the tags of $repo"
  tags=$(say "$listing" | sed -n 's|.*refs/tags/v\([0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\)$|\1|p' |
    sort -t. -k1,1nr -k2,2nr -k3,3nr | sed 's/^/v/')
  [ -n "$tags" ] || die "$repo has no vX.Y.Z tag"
  if [ -z "$version" ]; then
    tag=$(say "$tags" | head -n 1)
  elif say "$tags" | grep -Fqx -- "$version"; then
    tag=$version
  else
    die "$repo has no tag $version. The latest tags: $(say "$tags" | head -n 5 | tr '\n' ' ')"
  fi
}

ask() {
  printf '%s: ' "$1" >/dev/tty
  read -r answer </dev/tty || answer=''
  printf '%s' "$answer"
}

# The values of a new .env: from the flags, else from the terminal; --yes or no terminal asks nothing.
collect_answers() {
  if [ -z "$assume_yes" ] && (: </dev/tty) 2>/dev/null; then
    [ -n "$domain" ] || domain=$(ask "Domain of Pro (empty: none; --tls needs it)")
    [ -n "$port" ] || port=$(ask "Web port on 127.0.0.1, for example 8095")
    [ -n "$alert_bot_token" ] || alert_bot_token=$(ask "Alert bot token (empty: alerts go only to the log)")
    [ -n "$alert_chat_id" ] || alert_chat_id=$(ask "Alert chat id (empty: none)")
  fi
  [ -n "$port" ] || die "the web port is missing: give --port"
  case $port in *[!0-9]*) die "--port must be a number, not $port" ;; esac
  [ -z "$tls" ] || [ -n "$domain" ] || die "the domain is missing: --tls needs --domain"
}

# Also makes the folder path absolute: the later steps run inside the folder.
take_lock() {
  mkdir -p "$dir/.install"
  dir=$(cd "$dir" && pwd)
  lock=$dir/.install/lock
  mkdir "$lock" 2>/dev/null ||
    die "another install.sh run holds the lock $lock; when no run is active, remove that folder"
  trap 'rmdir "$lock"' EXIT
  trap 'exit 1' HUP INT TERM
}

prepare_source() {
  if [ -d "$dir/.git" ]; then
    git -C "$dir" remote set-url origin "$repo"
  else
    git init -q "$dir" && git -C "$dir" remote add origin "$repo"
  fi
}

# Replaces the KEY= line of an env file, or adds it. The file keeps its mode.
set_env() {
  updated=$(KEY=$2 VALUE=$3 awk '
    index($0, ENVIRON["KEY"] "=") == 1 { print ENVIRON["KEY"] "=" ENVIRON["VALUE"]; done = 1; next }
    { print }
    END { if (!done) print ENVIRON["KEY"] "=" ENVIRON["VALUE"] }' "$1")
  say "$updated" >"$1"
}

random_secret() {
  od -An -N32 -tx1 /dev/urandom | tr -d ' \n'
}

# .env from .env.example with the answers, mode 600; the admin port is the port after the web port. Each empty
# *_SECRET key and an empty FORMGATE_ADMIN_KEYS (one admin key) get a random value.
write_env() {
  draft=$dir/.env.draft
  cp "$dir/.env.example" "$draft"
  chmod 600 "$draft"
  set_env "$draft" FORMGATE_WEB_PORT "127.0.0.1:$port"
  set_env "$draft" FORMGATE_ADMIN_PORT "127.0.0.1:$((port + 1))"
  set_env "$draft" FORMGATE_ALERT_BOT_TOKEN "$alert_bot_token"
  set_env "$draft" FORMGATE_ALERT_CHAT_ID "$alert_chat_id"
  [ -z "$domain" ] || set_env "$draft" FORMGATE_DOMAIN "$domain"
  [ -z "$tls" ] || set_env "$draft" COMPOSE_PROFILES tls
  for key in $(sed -n -e 's/^\([A-Z0-9_]*_SECRET\)=$/\1/p' -e 's/^\(FORMGATE_ADMIN_KEYS\)=$/\1/p' "$draft"); do
    set_env "$draft" "$key" "$(random_secret)"
  done
  mv "$draft" "$dir/.env"
}

# Appends each key of the new .env.example that .env lacks, with the example value; an empty *_SECRET gets a random
# value. A key that .env has stays as it is, also empty or commented out. Prints the key names only, never a value.
append_new_env_keys() {
  for key in $(sed -n 's/^\([A-Z][A-Z0-9_]*\)=.*/\1/p' "$dir/.env.example"); do
    grep -Eq "^[#[:space:]]*$key=" "$dir/.env" && continue
    value=$(sed -n "s/^$key=//p" "$dir/.env.example" | head -n 1)
    case $key in *_SECRET) [ -n "$value" ] || value=$(random_secret) ;; esac
    set_env "$dir/.env" "$key" "$value"
    say "added to .env: $key"
  done
}

# GET /health on the web port of .env (address:port or port).
health_url() {
  web_port=$(awk 'index($0, "FORMGATE_WEB_PORT=") == 1 { value = substr($0, 19) } END { print value }' "$dir/.env")
  say "http://127.0.0.1:${web_port##*:}/health"
}

wait_for_health() {
  deadline=$(($(date +%s) + health_timeout))
  until curl -fsS --max-time 5 -o /dev/null "$health" 2>/dev/null; do
    [ "$(date +%s)" -lt "$deadline" ] || return 1
    sleep 2
  done
}

# The ref to install: --ref as given, without the tag check (CI), else the tag of resolve_tag.
choose_target() {
  if [ -z "$ref" ]; then
    resolve_tag
    target=$tag
    return
  fi
  [ -z "$version" ] || die "give --ref or --version, not both"
  target=$ref
}

# Checks out a tag, a commit or a branch, or stops with the repository and the ref, before any docker command.
# Fetches at depth 1: git rejects a plain fetch from a shallow repository ("shallow roots are not allowed to be
# updated") and can still exit 0, so the checkout of FETCH_HEAD is checked too.
checkout_ref() {
  git -C "$dir" fetch --quiet --force --depth 1 origin "$1" || die "cannot fetch $1 from the repository $repo"
  git -C "$dir" checkout --quiet --force --detach FETCH_HEAD || die "cannot check out $1 from the repository $repo"
}

# Builds and starts the checked-out source and waits for /health.
start_pro() {
  docker compose build && docker compose up -d && wait_for_health
}

deploy() {
  say "Starting Pro $1"
  checkout_ref "$1" && append_new_env_keys && start_pro
}

record_tag() {
  say "$1" >"$dir/.install/tag"
}

print_next_steps() {
  cat <<EOF

Formgate Pro $target runs in $dir: $health answers ok.

Create the first project (name, site domain, channel and its options):
  cd $dir
  docker compose exec web php bin/formgate project:create <name> <site domain> <channel> -o <option>=<value> ...
The channel options and the other commands: $dir/docs/pro-setup.md, section 4.
HTTPS on a public server: $dir/docs/pro-tls.md (install.sh --tls --domain <domain>).
Update: sh $dir/install.sh --update --dir $dir
EOF
}

install_pro() {
  resolve_repo
  choose_target
  [ -f "$dir/.env" ] || collect_answers
  take_lock
  prepare_source
  checkout_ref "$target"
  [ -f "$dir/.env" ] || write_env
  cd "$dir"
  health=$(health_url)
  start_pro || die "Pro $target did not answer on $health in ${health_timeout}s; see docker compose logs web worker"
  record_tag "$target"
  print_next_steps
}

update_pro() {
  [ -f "$dir/.env" ] && [ -f "$dir/.install/tag" ] || die "no Pro install in $dir; run install.sh without --update first"
  resolve_repo
  resolve_tag
  current=$(cat "$dir/.install/tag")
  if [ "$tag" = "$current" ]; then
    say "Pro $tag is installed already: nothing to update"
    return
  fi
  take_lock
  prepare_source
  cd "$dir"
  health=$(health_url)
  say "$current" >"$dir/.install/previous-tag"
  if deploy "$tag"; then
    record_tag "$tag"
    say "Pro updated from $current to $tag: $health answers ok"
    return
  fi
  say "Pro $tag did not answer on $health in ${health_timeout}s; rolling back to $current" >&2
  deploy "$current" || die "the update to $tag failed, and $current does not answer on $health either"
  die "the update to $tag failed: /health did not answer in ${health_timeout}s; Pro runs $current again"
}

formgate_main() {
  set -eu
  formgate_defaults
  parse_args "$@"
  check_docker
  if [ "$mode" = update ]; then update_pro; else install_pro; fi
}

formgate_main "$@"
