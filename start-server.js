const { spawn } = require('child_process');

console.log("Starting Next.js...");
const child = spawn(/^win/.test(process.platform) ? 'npm.cmd' : 'npm', ['run', 'dev'], {
  detached: true,
  stdio: 'ignore',
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', PORT: '3000' }
});

child.unref();
console.log("Started in background with PID:", child.pid);
