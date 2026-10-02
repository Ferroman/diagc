import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

// The repo-root install.sh (the `curl … | sh` one), run under `sh` against
// stand-ins: curl serves files from a local directory, and node/npm are small
// scripts that log what they were asked to do. Nothing here touches the
// network or the real npm.
const script = path.resolve(import.meta.dirname, '../../../install.sh');
const MIRROR = 'https://mirror.test/dist';

const platform = `${process.platform}-${process.arch === 'arm64' ? 'arm64' : 'x64'}`;
const dirName = `node-v24.9.0-${platform}`;

// Answers the installer's three questions, and otherwise "runs" a script.
const NODE_STUB = `#!/bin/sh
case "$*" in
  *execPath*) echo "\${FAKE_NODE_MAJOR:-24} $0" ;;
  *require*) sed -n 's/.*"version": *"\\([^"]*\\)".*/\\1/p' "$3" ;;
  *) echo "ran $0 $*" ;;
esac
`;

// Installs a skeleton @diagc/cli at --prefix, and logs which npm ran.
const NPM_STUB = `#!/bin/sh
echo "$0 $*" >> "$FAKE_LOG"
prefix=; version=
while [ $# -gt 0 ]; do
  case "$1" in --prefix) prefix=$2; shift ;; @diagc/cli@*) version=\${1#@diagc/cli@} ;; esac
  shift
done
[ "$version" = latest ] && version=0.9.0
pkg="$prefix/lib/node_modules/@diagc/cli"
mkdir -p "$pkg/bin"
: > "$pkg/bin/diagc.mjs"
printf '{ "version": "%s" }\\n' "$version" > "$pkg/package.json"
`;

// curl -fsSL --retry 2 URL -o FILE, served from $FAKE_DIST.
const CURL_STUB = `#!/bin/sh
url=; out=
while [ $# -gt 0 ]; do
  case "$1" in -o) out=$2; shift ;; http*) url=$1 ;; esac
  shift
done
echo "curl $url" >> "$FAKE_LOG"
src="$FAKE_DIST/\${url#${MIRROR}/}"
[ -f "$src" ] || exit 22
cp "$src" "$out"
`;

function exe(file: string, body: string) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, body);
  chmodSync(file, 0o755);
}

let root: string;
let home: string;
let fakeBin: string;
let dist: string;
let log: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'diagc-install-'));
  home = path.join(root, 'home');
  fakeBin = path.join(root, 'fake-bin');
  dist = path.join(root, 'dist');
  log = path.join(root, 'log');
  mkdirSync(home);
  writeFileSync(log, '');
  exe(path.join(fakeBin, 'node'), NODE_STUB);
  exe(path.join(fakeBin, 'npm'), NPM_STUB);
  exe(path.join(fakeBin, 'curl'), CURL_STUB);

  // What nodejs.org's latest-v24.x/ would hold for this machine.
  const build = path.join(root, 'build');
  exe(path.join(build, dirName, 'bin', 'node'), NODE_STUB);
  exe(path.join(build, dirName, 'bin', 'npm'), NPM_STUB);
  mkdirSync(path.join(dist, 'latest-v24.x'), { recursive: true });
  const tarball = path.join(dist, 'latest-v24.x', `${dirName}.tar.gz`);
  expect(spawnSync('tar', ['-czf', tarball, '-C', build, dirName]).status).toBe(0);
  const sum = createHash('sha256').update(readFileSync(tarball)).digest('hex');
  writeFileSync(
    path.join(dist, 'latest-v24.x', 'SHASUMS256.txt'),
    `${'0'.repeat(64)}  node-v24.9.0-aix-ppc64.tar.gz\n${sum}  ${dirName}.tar.gz\n${'1'.repeat(64)}  ${dirName}.tar.xz\n`,
  );
});

function install(env: Record<string, string> = {}, input?: string) {
  const res = spawnSync('sh', input === undefined ? [script] : [], {
    input,
    encoding: 'utf8',
    env: {
      HOME: home,
      PATH: `${fakeBin}:/usr/bin:/bin`,
      FAKE_LOG: log,
      FAKE_DIST: dist,
      DIAGC_NODE_MIRROR: MIRROR,
      ...env,
    },
  });
  return { ...res, log: readFileSync(log, 'utf8') };
}

const diagcHome = () => path.join(home, '.local/share/diagc');
const launcher = () => path.join(home, '.local/bin/diagc');

describe.skipIf(process.platform === 'win32')('install.sh', () => {
  it('installs the latest release with a new-enough node from the PATH', () => {
    const res = install();
    expect(res.status, res.stderr).toBe(0);
    expect(res.log).not.toContain('curl');
    expect(res.log).toContain(`${fakeBin}/npm install --global --prefix ${diagcHome()}`);
    expect(res.log).toContain('@diagc/cli@latest');
    expect(res.stdout).toContain(`installed diagc 0.9.0 -> ${launcher()}`);
    expect(existsSync(path.join(diagcHome(), 'node'))).toBe(false);

    // The launcher pins that node and runs the package's entry point.
    const run = spawnSync(launcher(), ['--help'], { encoding: 'utf8' });
    expect(run.stdout.trim()).toBe(`ran ${fakeBin}/node ${diagcHome()}/lib/node_modules/@diagc/cli/bin/diagc.mjs --help`);
  });

  it('downloads Node when the one on the PATH is too old, and installs with its npm', () => {
    const res = install({ FAKE_NODE_MAJOR: '20' });
    expect(res.status, res.stderr).toBe(0);
    expect(res.log).toContain(`curl ${MIRROR}/latest-v24.x/SHASUMS256.txt`);
    expect(res.log).toContain(`curl ${MIRROR}/latest-v24.x/${dirName}.tar.gz`);
    const node = path.join(diagcHome(), 'node/bin/node');
    expect(res.log).toContain(`${path.join(diagcHome(), 'node/bin/npm')} install`);
    expect(readFileSync(launcher(), 'utf8')).toContain(`node="${node}"`);
  });

  it('downloads Node on request even when the PATH has a good one', () => {
    const res = install({ DIAGC_NODE: 'download' });
    expect(res.status, res.stderr).toBe(0);
    expect(existsSync(path.join(diagcHome(), 'node/bin/node'))).toBe(true);
  });

  it('refuses a Node download whose checksum does not match, installing nothing', () => {
    const sums = path.join(dist, 'latest-v24.x', 'SHASUMS256.txt');
    writeFileSync(sums, readFileSync(sums, 'utf8').replace(/^[0-9a-f]{64}(?= {2}node-v24\.9\.0-(?!aix))/m, 'f'.repeat(64)));
    const res = install({ FAKE_NODE_MAJOR: '18' });
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain('checksum mismatch');
    expect(existsSync(path.join(diagcHome(), 'node'))).toBe(false);
    expect(existsSync(launcher())).toBe(false);
  });

  it('says so when the Node download fails', () => {
    const res = install({ FAKE_NODE_MAJOR: '18', DIAGC_NODE_MIRROR: 'https://mirror.test/missing' });
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain('could not download https://mirror.test/missing/latest-v24.x/SHASUMS256.txt');
  });

  it('installs a pinned release', () => {
    const res = install({ DIAGC_VERSION: '0.7.0' });
    expect(res.log).toContain('@diagc/cli@0.7.0');
    expect(res.stdout).toContain('installed diagc 0.7.0');
  });

  it('honours DIAGC_HOME and DIAGC_BIN_DIR', () => {
    const res = install({ DIAGC_HOME: path.join(root, 'opt'), DIAGC_BIN_DIR: path.join(root, 'bin') });
    expect(res.status, res.stderr).toBe(0);
    expect(existsSync(path.join(root, 'opt/lib/node_modules/@diagc/cli/package.json'))).toBe(true);
    expect(existsSync(path.join(root, 'bin/diagc'))).toBe(true);
  });

  it('tells you to put the launcher directory on the PATH only when it is not', () => {
    expect(install().stdout).toContain('is not on your PATH');
    const bin = path.join(home, '.local/bin');
    expect(install({ PATH: `${bin}:${fakeBin}:/usr/bin:/bin` }).stdout).not.toContain('is not on your PATH');
  });

  it('falls back to the PATH node when the recorded one is gone', () => {
    install({ DIAGC_NODE: 'download' });
    const run = spawnSync('sh', ['-c', `rm -rf "${diagcHome()}/node" && "${launcher()}" x`], {
      encoding: 'utf8',
      env: { PATH: `${fakeBin}:/usr/bin:/bin` },
    });
    expect(run.stdout).toContain(`ran ${fakeBin}/node`);
  });

  it('does nothing when the download of the script itself is cut short', () => {
    const full = readFileSync(script, 'utf8');
    const res = install({}, full.slice(0, full.lastIndexOf('main "$@"')));
    expect(res.status).toBe(0);
    expect(res.log).toBe('');
    expect(existsSync(path.join(home, '.local'))).toBe(false);
  });
});
