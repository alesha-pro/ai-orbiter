import { describe, it, expect } from 'vitest';
import { deduplicateCandidates } from './dedup';
import { McpCandidate, ClientType } from '../adapters/types';
import { SourceSnapshot } from '../db/types';

describe('deduplicateCandidates', () => {
  const dummySnapshot: SourceSnapshot = {
    id: 'snap-1',
    client: ClientType.CLAUDE_CODE,
    path: '/path/to/config',
    hash: 'h1',
    mtime: 123,
    scannedAt: 123
  };

  it('should merge candidates with same fingerprint', () => {
    const candidates: McpCandidate[] = [
      {
        server: {
          name: 'Server A',
          type: 'stdio',
          command: 'node',
          args: ['a.js'],
          cwd: null,
          url: null,
          headers: null,
          env: null
        },
        binding: {
          client: ClientType.CLAUDE_CODE,
          enabled: 'on'
        },
        sourceSnapshot: dummySnapshot
      },
      {
        server: {
          name: 'Server A Duplicate',
          type: 'stdio',
          command: 'node',
          args: ['a.js'],
          cwd: null,
          url: null,
          headers: null,
          env: null
        },
        binding: {
          client: ClientType.GEMINI_CLI,
          enabled: 'on'
        },
        sourceSnapshot: dummySnapshot
      }
    ];

    const results = deduplicateCandidates(candidates);
    expect(results).toHaveLength(1);
    expect(results[0]!.bindings).toHaveLength(2);
    expect(results[0]!.name).toBe('Server A');
  });

  it('should keep different fingerprints separate', () => {
    const candidates: McpCandidate[] = [
      {
        server: {
          type: 'stdio',
          command: 'node',
          args: ['a.js']
        },
        binding: {},
        sourceSnapshot: dummySnapshot
      },
      {
        server: {
          type: 'stdio',
          command: 'node',
          args: ['b.js']
        },
        binding: {},
        sourceSnapshot: dummySnapshot
      }
    ];

    const results = deduplicateCandidates(candidates);
    expect(results).toHaveLength(2);
  });
});
