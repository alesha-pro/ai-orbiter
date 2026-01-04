import { describe, it, expect } from 'vitest';
import { calculateFingerprint } from './fingerprint';

describe('calculateFingerprint', () => {
  it('should calculate stable fingerprint for stdio type', () => {
    const server1 = {
      type: 'stdio' as const,
      command: 'node',
      args: ['script.js'],
      cwd: '/root',
      url: null,
      headers: null,
      env: null
    };
    const server2 = {
      type: 'stdio' as const,
      command: 'node',
      args: ['script.js'],
      cwd: '/root',
      url: null,
      headers: null,
      env: null
    };
    const server3 = {
      type: 'stdio' as const,
      command: 'node',
      args: ['other.js'],
      cwd: '/root',
      url: null,
      headers: null,
      env: null
    };

    expect(calculateFingerprint(server1)).toBe(calculateFingerprint(server2));
    expect(calculateFingerprint(server1)).not.toBe(calculateFingerprint(server3));
  });

  it('should calculate stable fingerprint for http type', () => {
    const server1 = {
      type: 'http' as const,
      command: null,
      args: null,
      cwd: null,
      url: 'http://localhost:3000/sse',
      headers: { 'X-Secret': '123' },
      env: null
    };
    const server2 = {
      type: 'http' as const,
      command: null,
      args: null,
      cwd: null,
      url: 'http://localhost:3000/sse',
      headers: { 'X-Secret': '123' },
      env: null
    };

    expect(calculateFingerprint(server1)).toBe(calculateFingerprint(server2));
  });

  it('should differentiate by headers', () => {
    const server1 = {
      type: 'http' as const,
      url: 'http://localhost:3000/api',
      headers: { 'Authorization': 'token1' }
    };
    const server2 = {
      type: 'http' as const,
      url: 'http://localhost:3000/api',
      headers: { 'Authorization': 'token2' }
    };

    expect(calculateFingerprint(server1)).not.toBe(calculateFingerprint(server2));
  });

  it('should differentiate by env', () => {
    const server1 = {
      type: 'stdio' as const,
      command: 'npx',
      args: ['server'],
      env: { 'API_KEY': 'key1' }
    };
    const server2 = {
      type: 'stdio' as const,
      command: 'npx',
      args: ['server'],
      env: { 'API_KEY': 'key2' }
    };

    expect(calculateFingerprint(server1)).not.toBe(calculateFingerprint(server2));
  });
});
