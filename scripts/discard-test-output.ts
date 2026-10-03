import { rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Reporter } from '@playwright/test/reporter';

// onExit runs after reporters have written their final metadata, including .last-run.json.
export default class DiscardTestOutput implements Reporter {
  onExit() {
    const root = resolve(__dirname, '..');
    const output = resolve(root, 'test-results');
    if (dirname(output) !== root) throw new Error('Unexpected output path');
    rmSync(output, { recursive: true, force: true });
  }
}
