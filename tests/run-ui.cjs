const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const tempRoot = path.resolve(os.tmpdir());
const temp = fs.mkdtempSync(path.join(tempRoot, 'whale-ui-test-'));
try {
  const result = spawnSync(require('electron'), [path.join(__dirname, 'electron-smoke.cjs')], {
    stdio: 'inherit', windowsHide: true, timeout: 90000,
    env: { ...process.env, WHALE_TEST_USER_DATA: temp }
  });
  if (result.error) console.error(result.error.message);
  process.exitCode = result.status === 0 ? 0 : 1;
} finally {
  // Only remove the exact temporary fixture created by this runner, after Electron exits.
  if (path.dirname(path.resolve(temp)) === tempRoot && path.basename(temp).startsWith('whale-ui-test-')) {
    fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}
