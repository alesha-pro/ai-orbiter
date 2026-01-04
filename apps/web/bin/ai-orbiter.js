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

program
  .command('update')
  .description('Update AI Orbiter to the latest release')
  .action(async () => {
    const rootDir = path.resolve(__dirname, '../../..');
    const https = require('https');
    
    const getLatestRelease = () => new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.github.com',
        path: '/repos/alesha-pro/ai-orbiter/releases/latest',
        headers: { 'User-Agent': 'ai-orbiter' }
      };
      https.get(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve(json.tag_name || null);
          } catch { resolve(null); }
        });
      }).on('error', () => resolve(null));
    });
    
    console.log('🔄 Checking for updates...\n');
    
    try {
      const currentVersion = 'v' + PKG_VERSION;
      const latestVersion = await getLatestRelease();
      
      if (!latestVersion) {
        console.log('⚠️  Could not fetch latest release. Updating from main...');
        execSync('git fetch origin && git pull origin main', { cwd: rootDir, stdio: 'inherit' });
      } else {
        console.log(`Current version: ${currentVersion}`);
        console.log(`Latest release:  ${latestVersion}`);
        
        if (currentVersion === latestVersion) {
          console.log('\n✅ Already up to date!');
          return;
        }
        
        console.log(`\nUpdating to ${latestVersion}...`);
        execSync('git fetch origin --tags', { cwd: rootDir, stdio: 'inherit' });
        execSync(`git checkout ${latestVersion}`, { cwd: rootDir, stdio: 'inherit' });
      }
      
      console.log('\nInstalling dependencies...');
      execSync('pnpm install', { cwd: rootDir, stdio: 'inherit' });
      
      console.log('\nRebuilding...');
      execSync('pnpm build', { cwd: rootDir, stdio: 'inherit' });
      
      delete require.cache[require.resolve('../../../package.json')];
      const newVersion = require('../../../package.json').version;
      console.log(`\n✅ Updated to v${newVersion}!`);
      
    } catch (e) {
      console.error('\n❌ Update failed:', e.message);
      process.exit(1);
    }
  });

program.parse();
