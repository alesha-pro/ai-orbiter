let Database: any;
try {
  Database = eval('require')('better-sqlite3');
} catch (e) {
  console.error('Failed to load better-sqlite3:', e);
}

import path from 'path';
import fs from 'fs';
import os from 'os';
import { SCHEMA_SQL } from './schema';

export let db: any;

export function getDbPath(): string {
  return process.env.AI_ORBITER_DB_PATH || path.join(os.homedir(), '.ai-orbiter', 'registry.sqlite');
}

export function initDatabase(): any {
  if (db) return db;

  const dbPath = getDbPath();
  const dbDir = path.dirname(dbPath);

  console.log(`Initializing database at ${dbPath}`);

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  try {
    db = new Database(dbPath);
  } catch (err) {
    console.error('Failed to create Database instance:', err);
    throw err;
  }
  db.pragma('journal_mode = WAL');

  try {
    db.exec(SCHEMA_SQL);
    console.log('Database schema initialized successfully');
  } catch (err) {
    console.error('Failed to initialize database schema:', err);
    throw err;
  }

  return db;
}
