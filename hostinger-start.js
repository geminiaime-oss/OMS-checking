import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log("------------------------------------------");
console.log("[Bridge] Node version:", process.version);
console.log("[Bridge] Current directory:", __dirname);
console.log("[Bridge] Starting server using tsx...");
console.log("------------------------------------------");

// Find tsx in node_modules
const tsxPath = path.join(__dirname, 'node_modules', '.bin', 'tsx');

if (!fs.existsSync(tsxPath)) {
  console.error("[Error] tsx not found in node_modules. Please make sure you ran 'npm install'.");
  process.exit(1);
}

const child = spawn(tsxPath, ['server.ts'], {
  stdio: 'inherit',
  shell: true,
  cwd: __dirname,
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: process.env.PORT || 3000
  }
});

child.on('error', (err) => {
  console.error("[Bridge] Failed to start child process:", err);
});

child.on('exit', (code) => {
  console.log(`[Bridge] Server process exited with code ${code}`);
  process.exit(code || 0);
});

