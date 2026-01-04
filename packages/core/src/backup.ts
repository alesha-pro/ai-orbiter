import fs from 'fs';
import path from 'path';
import os from 'os';

export function getBackupDir(): string {
  const dir = path.join(os.homedir(), '.ai-orbiter', 'backups');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function createBackup(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const backupDir = getBackupDir();
  const filename = path.basename(filePath);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `${filename}.${timestamp}.bak`);

  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

export function restoreBackup(backupPath: string, originalPath: string): void {
  if (!fs.existsSync(backupPath)) {
    throw new Error(`Backup file not found: ${backupPath}`);
  }

  const tempPath = `${originalPath}.tmp.${Date.now()}`;
  
  try {
    fs.copyFileSync(backupPath, tempPath);
    fs.renameSync(tempPath, originalPath);
  } catch (e) {
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
    throw e;
  }
}
