import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const result = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['jest', '--watchman=false', '--testPathPattern=profilePagePreviewWrite', '--forceExit'],
  { cwd: root, encoding: 'utf8', shell: true },
);
process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
process.exit(result.status ?? 1);
