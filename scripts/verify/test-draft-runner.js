const { spawnSync } = require('child_process');
const path = require('path');

function runDraftRunner() {
  console.log('=== WAITER DRAFT CLOUD & DEVICE RESILIENCE RUNNER ===');
  const targetScript = path.join(__dirname, 'test-waiter-draft-e2e.js');
  const res = spawnSync(process.execPath, ['--import', 'tsx', targetScript], {
    stdio: 'inherit',
    env: process.env,
  });
  process.exit(res.status ?? 1);
}

runDraftRunner();
