#!/bin/sh
# Installs the diagc CLI (and the studio it serves) for the current user:
#
#   curl -fsSL https://raw.githubusercontent.com/Ferroman/diagc/main/install.sh | sh
#
# No root, no global npm prefix. Everything lands in one directory, and a
# `diagc` launcher goes on the PATH:
#
#   $DIAGC_HOME            ~/.local/share/diagc   the package (+ Node, if fetched)
#   $DIAGC_BIN_DIR         ~/.local/bin           the launcher
#
# Node >= 22 already on the PATH is used as is; otherwise the current Node 24
# release is downloaded into $DIAGC_HOME/node, checked against nodejs.org's
# SHASUMS256.txt. Re-running updates to the latest release. Uninstall by
# deleting both of the paths above.
#
# Overrides (environment):
#   DIAGC_VERSION=0.8.0    install that release instead of the latest
#   DIAGC_NODE=download    fetch a private Node even when the PATH has one
#   DIAGC_HOME, DIAGC_BIN_DIR, DIAGC_NODE_MIRROR (default https://nodejs.org/dist)
#
# POSIX sh, not bash: `| sh` is dash on Debian and Ubuntu.

set -eu

NODE_MIN=22
NODE_MAJOR=24

say() { printf 'diagc: %s\n' "$*"; }
die() { printf 'diagc: error: %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "$1 is required"; }

fetch() { # url file
  curl -fsSL --retry 2 "$1" -o "$2" || die "could not download $1"
}

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1
  elif command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | cut -d' ' -f1
  else die "sha256sum or shasum is required to verify the Node download"
  fi
}

# nodejs.org's names for this machine, e.g. linux-x64, darwin-arm64.
node_platform() {
  case "$(uname -s)" in
    Linux) os=linux ;;
    Darwin) os=darwin ;;
    *) die "unsupported system $(uname -s); install with npm instead: npm i -g @diagc/cli" ;;
  esac
  case "$(uname -m)" in
    x86_64 | amd64) arch=x64 ;;
    aarch64 | arm64) arch=arm64 ;;
    *) die "unsupported CPU $(uname -m); install with npm instead: npm i -g @diagc/cli" ;;
  esac
  printf '%s-%s\n' "$os" "$arch"
}

# Prints the node to use when the PATH has one new enough, else nothing. The
# real binary (process.execPath), not what the PATH found: under mise, asdf or
# nvm that is a shim, and a shim picks its Node per directory — a repo pinned
# to Node 20 would hand diagc Node 20.
system_node() {
  [ "${DIAGC_NODE:-}" = download ] && return 0
  command -v node >/dev/null 2>&1 || return 0
  found=$(node -p 'process.versions.node.split(".")[0] + " " + process.execPath' 2>/dev/null) || return 0
  if [ "${found%% *}" -ge "$NODE_MIN" ] 2>/dev/null; then printf '%s\n' "${found#* }"; fi
}

# Fetches the latest Node $NODE_MAJOR into $DIAGC_HOME/node; prints its node.
download_node() {
  mirror=${DIAGC_NODE_MIRROR:-https://nodejs.org/dist}
  base="$mirror/latest-v$NODE_MAJOR.x"
  platform=$(node_platform)
  tmp=$(mktemp -d)
  # A .tar.gz, not the smaller .tar.xz: xz is missing from minimal images.
  fetch "$base/SHASUMS256.txt" "$tmp/SHASUMS256.txt"
  line=$(grep " node-v[0-9.]*-$platform\.tar\.gz\$" "$tmp/SHASUMS256.txt" | head -n 1)
  [ -n "$line" ] || die "no Node $NODE_MAJOR build for $platform at $base"
  want=${line%% *}
  file=${line##* }
  say "downloading ${file%.tar.gz}" >&2
  fetch "$base/$file" "$tmp/$file"
  [ "$(sha256 "$tmp/$file")" = "$want" ] || die "checksum mismatch for $file; nothing was installed"
  tar -xzf "$tmp/$file" -C "$tmp"
  rm -rf "$DIAGC_HOME/node"
  mv "$tmp/${file%.tar.gz}" "$DIAGC_HOME/node"
  rm -rf "$tmp"
  printf '%s\n' "$DIAGC_HOME/node/bin/node"
}

main() {
  need curl
  need tar
  [ -n "${HOME:-}" ] || die "HOME is not set"
  DIAGC_HOME=${DIAGC_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/diagc}
  bin_dir=${DIAGC_BIN_DIR:-$HOME/.local/bin}
  version=${DIAGC_VERSION:-latest}
  mkdir -p "$DIAGC_HOME" "$bin_dir"

  node=$(system_node)
  if [ -n "$node" ]; then
    say "using Node $("$node" -v) at $node"
  else
    node=$(download_node)
  fi
  node_dir=$(dirname "$node")

  # npm from beside that node, with that node first on the PATH: npm's own
  # shebang is `env node`, which would otherwise find an older system one.
  say "installing @diagc/cli@$version into $DIAGC_HOME"
  PATH="$node_dir:$PATH" npm install --global --prefix "$DIAGC_HOME" \
    --no-fund --no-audit --no-update-notifier --loglevel=error "@diagc/cli@$version"

  pkg="$DIAGC_HOME/lib/node_modules/@diagc/cli"
  [ -f "$pkg/bin/diagc.mjs" ] || die "npm finished but $pkg/bin/diagc.mjs is missing"

  # A launcher rather than npm's bin link: that link's shebang is `env node`
  # too, and would run whatever node the PATH holds that day. If the recorded
  # node goes away (a Homebrew upgrade removes the old version's directory),
  # the PATH's node is the next best thing.
  cat >"$bin_dir/diagc" <<EOF
#!/bin/sh
node="$node"
[ -x "\$node" ] || node=node
exec "\$node" "$pkg/bin/diagc.mjs" "\$@"
EOF
  chmod +x "$bin_dir/diagc"

  installed=$("$node" -p "require(process.argv[1]).version" "$pkg/package.json")
  say "installed diagc $installed -> $bin_dir/diagc"

  case ":$PATH:" in
    *":$bin_dir:"*) ;;
    *) say "$bin_dir is not on your PATH; add it, e.g. echo 'export PATH=\"$bin_dir:\$PATH\"' >> ~/.profile" ;;
  esac
  say "next: cd into a repo and run 'diagc studio'"
  say "PNG export uses Chrome or Chromium; without one, 'diagc publish' writes HTML only (or set CHROME_PATH)"
}

# Last line on purpose: a download cut short defines functions but runs nothing.
main "$@"
