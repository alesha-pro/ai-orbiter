#!/usr/bin/env node

const { program } = require('commander');
const detectPort = require('detect-port');
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');

const PKG_VERSION = require('../../../package.json').version;

program
  .name('ai-orbiter')
  .description('AI Orbiter - Unified MCP Server Registry & Management Tool')
  .version(PKG_VERSION);

program
  .command('start')
  .description('Start the AI Orbiter server')
  .option('-p, --port <number>', 'port to listen on', '3457')
  .option('--no-browser', 'do not open browser automatically')
  .option('--dev', 'run in development mode')
  .action(async (options) => {
    const defaultPort = parseInt(options.port, 10);
    const detect = typeof detectPort === 'function' ? detectPort : detectPort.default;
    const port = await detect(defaultPort);

    if (port !== defaultPort) {
      console.log(`Port ${defaultPort} is busy, using ${port} instead.`);
    }

    const appDir = path.resolve(__dirname, '..');
    const nextBin = path.resolve(appDir, 'node_modules', '.bin', 'next');
    const buildDir = path.resolve(appDir, '.next');

    let child;

    if (options.dev) {
      console.log('Starting AI Orbiter in development mode...');
      child = spawn(nextBin, ['dev', '-p', port.toString()], {
        cwd: appDir,
        stdio: 'inherit',
        env: {
          ...process.env,
          NODE_ENV: 'development',
          HOSTNAME: '127.0.0.1'
        }
      });
    } else {
      if (!fs.existsSync(buildDir)) {
        console.log('Building AI Orbiter...');
        try {
          execSync('pnpm build', { 
            cwd: path.resolve(appDir, '../..'), 
            stdio: 'inherit' 
          });
        } catch (e) {
          console.error('Build failed. Please run "pnpm build" manually.');
          process.exit(1);
        }
      }

      console.log('Starting AI Orbiter...');
      child = spawn(nextBin, ['start', '-p', port.toString()], {
        cwd: appDir,
        stdio: 'inherit',
        env: {
          ...process.env,
          NODE_ENV: 'production',
          HOSTNAME: '127.0.0.1'
        }
      });
    }

    child.on('spawn', () => {
      const url = `http://127.0.0.1:${port}`;
      console.log(`\n🛰️  AI Orbiter running at ${url}`);
      
      if (options.browser) {
        setTimeout(async () => {
          const open = (await import('open')).default;
          open(url);
        }, 2000);
      }
    });

    child.on('error', (err) => {
      console.error('Failed to start server:', err.message);
      process.exit(1);
    });

    process.on('SIGINT', () => {
      child.kill();
      process.exit();
    });

    process.on('SIGTERM', () => {
      child.kill();
      process.exit();
    });
  });

program.parse();
