import { execFile, spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

export interface CheckedOutRef {
  /** the `.diagrams` directory as it was at the ref (it may not exist: the
   * repo had no diagrams then) */
  diagramsDir: string;
  cleanup: () => Promise<void>;
}

/** `ref` resolved to a commit, or a readable error for a typo'd tag. */
export async function verifyRef(ref: string, cwd: string): Promise<string> {
  try {
    const { stdout } = await run('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { cwd });
    return stdout.trim();
  } catch {
    throw new Error(`'${ref}' is not a commit, tag or branch in this repository`);
  }
}

/**
 * The tracked `.diagrams/` tree at `ref`, extracted into a temp directory —
 * sources, layout sidecars, assets and the include snapshots, which is all a
 * compile reads. `git archive` rather than a worktree: no checkout of the rest
 * of the repo, and nothing left registered in `.git` if the run dies.
 *
 * `diagramsDir` is relative to `cwd`, which may sit below the repository root.
 */
export async function checkoutDiagrams(ref: string, cwd: string, diagramsDir = '.diagrams'): Promise<CheckedOutRef> {
  const commit = await verifyRef(ref, cwd);
  // Every git call below runs at the top level with a top-level path: from a
  // subdirectory, ls-tree and archive would read their paths relative to it.
  const { stdout: top } = await run('git', ['rev-parse', '--show-toplevel'], { cwd });
  const { stdout: prefix } = await run('git', ['rev-parse', '--show-prefix'], { cwd });
  const repoPath = path.posix.normalize(path.posix.join(prefix.trim(), diagramsDir.split(path.sep).join('/')));
  if (repoPath.startsWith('..')) throw new Error(`${diagramsDir} is outside the repository`);
  const root = await mkdtemp(path.join(tmpdir(), 'diagc-diff-'));
  const cleanup = () => rm(root, { recursive: true, force: true });
  const { stdout: listed } = await run('git', ['ls-tree', '--name-only', commit, '--', repoPath], { cwd: top.trim() });
  if (listed.trim() !== '') {
    try {
      await pipeArchive(commit, repoPath, top.trim(), root);
    } catch (e) {
      await cleanup();
      throw e;
    }
  }
  return { diagramsDir: path.join(root, ...repoPath.split('/')), cleanup };
}

/** `git archive <commit> -- <path> | tar -x -C <into>`, without a shell. */
function pipeArchive(commit: string, repoPath: string, cwd: string, into: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const git = spawn('git', ['archive', '--format=tar', commit, '--', repoPath], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const tar = spawn('tar', ['-x', '-C', into], { stdio: ['pipe', 'ignore', 'pipe'] });
    let err = '';
    git.stderr.on('data', (d: Buffer) => (err += d.toString()));
    tar.stderr.on('data', (d: Buffer) => (err += d.toString()));
    git.stdout.pipe(tar.stdin);
    let pending = 2;
    let failed = false;
    const done = (who: string) => (code: number | null) => {
      if (code !== 0 && !failed) {
        failed = true;
        reject(new Error(`${who} failed extracting ${repoPath} at ${commit.slice(0, 12)}: ${err.trim()}`));
      }
      if (--pending === 0 && !failed) resolve();
    };
    git.on('error', reject);
    tar.on('error', reject);
    git.on('close', done('git archive'));
    tar.on('close', done('tar'));
  });
}
