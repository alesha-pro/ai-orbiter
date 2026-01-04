import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import toml from '@iarna/toml';
import { parse } from 'jsonc-parser';

import { ClaudeCodeAdapter } from './claude-code';
import { OpenCodeAdapter } from './opencode';
import { CodexAdapter } from './codex';
import { GeminiCliAdapter } from './gemini-cli';
import { McpServer, ClientBinding } from '../db/types';
import { ClientType } from './types';

// ============================================================================
// Test Helpers
// ============================================================================

function createStdioServer(overrides?: Partial<McpServer>): McpServer {
  return {
    id: 'server-stdio-1',
    name: 'test-stdio',
    type: 'stdio',
    command: 'node',
    args: ['server.js', '--port', '3000'],
    cwd: '/app',
    url: null,
    headers: null,
    env: { API_KEY: 'secret123', DEBUG: 'true' },
    tags: null,
    fingerprint: 'fp-stdio-1',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides
  };
}

function createHttpServer(overrides?: Partial<McpServer>): McpServer {
  return {
    id: 'server-http-1',
    name: 'test-http',
    type: 'http',
    command: null,
    args: null,
    cwd: null,
    url: 'http://localhost:8080/sse',
    headers: { Authorization: 'Bearer token123' },
    env: null,
    tags: null,
    fingerprint: 'fp-http-1',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides
  };
}

function createMinimalStdioServer(name: string): McpServer {
  return {
    id: `server-${name}`,
    name,
    type: 'stdio',
    command: 'npx',
    args: null,
    cwd: null,
    url: null,
    headers: null,
    env: null,
    tags: null,
    fingerprint: `fp-${name}`,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

function createMinimalHttpServer(name: string, url: string): McpServer {
  return {
    id: `server-${name}`,
    name,
    type: 'http',
    command: null,
    args: null,
    cwd: null,
    url,
    headers: null,
    env: null,
    tags: null,
    fingerprint: `fp-${name}`,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

function createBinding(
  serverId: string,
  client: string,
  enabled: 'on' | 'off' = 'on'
): ClientBinding {
  return {
    id: `binding-${serverId}-${client}`,
    serverId,
    client,
    enabled,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

// ============================================================================
// PART 1: Compile Tests - Format Validation
// ============================================================================

describe('Adapters: compile() format validation', () => {
  // --------------------------------------------------------------------------
  // ClaudeCodeAdapter
  // --------------------------------------------------------------------------
  describe('ClaudeCodeAdapter', () => {
    const adapter = new ClaudeCodeAdapter();

    describe('Stdio transport', () => {
      it('should compile basic stdio server with all fields', async () => {
        const server = createStdioServer();
        const binding = createBinding(server.id, ClientType.CLAUDE_CODE);

        const config = await adapter.compile([server], [binding]);
        const parsed = JSON.parse(config.content);

        expect(config.format).toBe('json');
        expect(config.filePath).toContain('.claude.json');
        expect(parsed.mcpServers['test-stdio']).toEqual({
          command: 'node',
          args: ['server.js', '--port', '3000'],
          cwd: '/app',
          env: { API_KEY: 'secret123', DEBUG: 'true' }
        });
      });

      it('should compile minimal stdio server (command only)', async () => {
        const server = createMinimalStdioServer('minimal');
        const binding = createBinding(server.id, ClientType.CLAUDE_CODE);

        const config = await adapter.compile([server], [binding]);
        const parsed = JSON.parse(config.content);

        expect(parsed.mcpServers['minimal']).toEqual({
          command: 'npx'
        });
      });

      it('should track disabled stdio server in serversToDisable', async () => {
        const server = createStdioServer();
        const binding = createBinding(server.id, ClientType.CLAUDE_CODE, 'off');

        const config = await adapter.compile([server], [binding]);
        const parsed = JSON.parse(config.content);

        expect(parsed.serversToDisable).toContain('test-stdio');
        expect(parsed.serversToEnable).not.toContain('test-stdio');
      });

      it('should track enabled server in serversToEnable', async () => {
        const server = createStdioServer();
        const binding = createBinding(server.id, ClientType.CLAUDE_CODE, 'on');

        const config = await adapter.compile([server], [binding]);
        const parsed = JSON.parse(config.content);

        expect(parsed.serversToEnable).toContain('test-stdio');
        expect(parsed.serversToDisable).not.toContain('test-stdio');
      });
    });

    describe('HTTP transport', () => {
      it('should compile http server with headers', async () => {
        const server = createHttpServer();
        const binding = createBinding(server.id, ClientType.CLAUDE_CODE);

        const config = await adapter.compile([server], [binding]);
        const parsed = JSON.parse(config.content);

        expect(parsed.mcpServers['test-http']).toEqual({
          url: 'http://localhost:8080/sse',
          type: 'http',
          headers: { Authorization: 'Bearer token123' }
        });
      });

      it('should compile http server with env', async () => {
        const server = createHttpServer({
          env: { SSE_TOKEN: 'abc' }
        });
        const binding = createBinding(server.id, ClientType.CLAUDE_CODE);

        const config = await adapter.compile([server], [binding]);
        const parsed = JSON.parse(config.content);

        expect(parsed.mcpServers['test-http'].env).toEqual({ SSE_TOKEN: 'abc' });
      });

      it('should compile minimal http server (url only)', async () => {
        const server = createMinimalHttpServer('http-minimal', 'https://api.example.com/mcp');
        const binding = createBinding(server.id, ClientType.CLAUDE_CODE);

        const config = await adapter.compile([server], [binding]);
        const parsed = JSON.parse(config.content);

        expect(parsed.mcpServers['http-minimal']).toEqual({
          url: 'https://api.example.com/mcp',
          type: 'http'
        });
      });
    });

    describe('Multiple servers', () => {
      it('should compile multiple servers of different types', async () => {
        const stdioServer = createStdioServer({ id: 's1', name: 'stdio-server' });
        const httpServer = createHttpServer({ id: 's2', name: 'http-server' });

        const bindings = [
          createBinding(stdioServer.id, ClientType.CLAUDE_CODE),
          createBinding(httpServer.id, ClientType.CLAUDE_CODE)
        ];

        const config = await adapter.compile([stdioServer, httpServer], bindings);
        const parsed = JSON.parse(config.content);

        expect(parsed.mcpServers['stdio-server']).toBeDefined();
        expect(parsed.mcpServers['stdio-server'].command).toBe('node');
        expect(parsed.mcpServers['http-server']).toBeDefined();
        expect(parsed.mcpServers['http-server'].url).toBe('http://localhost:8080/sse');
      });
    });
  });

  // --------------------------------------------------------------------------
  // OpenCodeAdapter
  // --------------------------------------------------------------------------
  describe('OpenCodeAdapter', () => {
    const adapter = new OpenCodeAdapter();

    describe('Stdio transport', () => {
      it('should compile with command as array (local type)', async () => {
        const server = createStdioServer();
        const binding = createBinding(server.id, ClientType.OPENCODE);

        const config = await adapter.compile([server], [binding]);
        const parsed = JSON.parse(config.content);

        expect(config.format).toBe('json');
        expect(config.filePath).toContain('opencode.json');
        expect(parsed.mcp['test-stdio']).toEqual({
          type: 'local',
          command: ['node', 'server.js', '--port', '3000'],
          environment: { API_KEY: 'secret123', DEBUG: 'true' },
          enabled: true
        });
      });

      it('should compile minimal stdio server', async () => {
        const server = createMinimalStdioServer('minimal');
        const binding = createBinding(server.id, ClientType.OPENCODE);

        const config = await adapter.compile([server], [binding]);
        const parsed = JSON.parse(config.content);

        expect(parsed.mcp['minimal']).toEqual({
          type: 'local',
          command: ['npx'],
          enabled: true
        });
      });

      it('should set enabled: false for disabled servers', async () => {
        const server = createStdioServer();
        const binding = createBinding(server.id, ClientType.OPENCODE, 'off');

        const config = await adapter.compile([server], [binding]);
        const parsed = JSON.parse(config.content);

        expect(parsed.mcp['test-stdio'].enabled).toBe(false);
      });
    });

    describe('HTTP transport', () => {
      it('should compile as remote type with headers', async () => {
        const server = createHttpServer();
        const binding = createBinding(server.id, ClientType.OPENCODE);

        const config = await adapter.compile([server], [binding]);
        const parsed = JSON.parse(config.content);

        expect(parsed.mcp['test-http']).toEqual({
          type: 'remote',
          url: 'http://localhost:8080/sse',
          headers: { Authorization: 'Bearer token123' },
          enabled: true
        });
      });

      it('should compile minimal http server', async () => {
        const server = createMinimalHttpServer('http-min', 'wss://example.com/ws');
        const binding = createBinding(server.id, ClientType.OPENCODE);

        const config = await adapter.compile([server], [binding]);
        const parsed = JSON.parse(config.content);

        expect(parsed.mcp['http-min']).toEqual({
          type: 'remote',
          url: 'wss://example.com/ws',
          enabled: true
        });
      });
    });
  });

  // --------------------------------------------------------------------------
  // CodexAdapter
  // --------------------------------------------------------------------------
  describe('CodexAdapter', () => {
    const adapter = new CodexAdapter();

    describe('Stdio transport', () => {
      it('should compile to TOML format with all fields', async () => {
        const server = createStdioServer();
        const binding = createBinding(server.id, ClientType.CODEX);

        const config = await adapter.compile([server], [binding]);

        expect(config.format).toBe('toml');
        expect(config.filePath).toContain('config.toml');

        const parsed = toml.parse(config.content) as any;
        expect(parsed.mcp_servers['test-stdio']).toMatchObject({
          command: 'node',
          args: ['server.js', '--port', '3000'],
          cwd: '/app',
          enabled: true
        });
        expect(parsed.mcp_servers['test-stdio'].env).toEqual({
          API_KEY: 'secret123',
          DEBUG: 'true'
        });
      });

      it('should compile minimal stdio server', async () => {
        const server = createMinimalStdioServer('minimal');
        const binding = createBinding(server.id, ClientType.CODEX);

        const config = await adapter.compile([server], [binding]);
        const parsed = toml.parse(config.content) as any;

        expect(parsed.mcp_servers['minimal']).toEqual({
          command: 'npx',
          enabled: true
        });
      });

      it('should set enabled: false for disabled servers', async () => {
        const server = createStdioServer();
        const binding = createBinding(server.id, ClientType.CODEX, 'off');

        const config = await adapter.compile([server], [binding]);
        const parsed = toml.parse(config.content) as any;

        expect(parsed.mcp_servers['test-stdio'].enabled).toBe(false);
      });
    });

    describe('HTTP transport', () => {
      it('should enable experimental_use_rmcp_client for http', async () => {
        const server = createHttpServer();
        const binding = createBinding(server.id, ClientType.CODEX);

        const config = await adapter.compile([server], [binding]);
        const parsed = toml.parse(config.content) as any;

        expect(parsed.experimental_use_rmcp_client).toBe(true);
      });

      it('should add Accept header and preserve custom headers', async () => {
        const server = createHttpServer();
        const binding = createBinding(server.id, ClientType.CODEX);

        const config = await adapter.compile([server], [binding]);
        const parsed = toml.parse(config.content) as any;

        expect(parsed.mcp_servers['test-http'].http_headers).toMatchObject({
          Authorization: 'Bearer token123',
          Accept: 'application/json, text/event-stream'
        });
      });

      it('should add default Accept header when no headers provided', async () => {
        const server = createMinimalHttpServer('http-min', 'http://localhost/api');
        const binding = createBinding(server.id, ClientType.CODEX);

        const config = await adapter.compile([server], [binding]);
        const parsed = toml.parse(config.content) as any;

        expect(parsed.mcp_servers['http-min'].http_headers).toEqual({
          Accept: 'application/json, text/event-stream'
        });
      });
    });

    describe('Mixed servers', () => {
      it('should not set experimental flag if only stdio servers', async () => {
        const server = createStdioServer();
        const binding = createBinding(server.id, ClientType.CODEX);

        const config = await adapter.compile([server], [binding]);
        const parsed = toml.parse(config.content) as any;

        expect(parsed.experimental_use_rmcp_client).toBeUndefined();
      });
    });
  });

  // --------------------------------------------------------------------------
  // GeminiCliAdapter
  // --------------------------------------------------------------------------
  describe('GeminiCliAdapter', () => {
    const adapter = new GeminiCliAdapter();

    describe('Stdio transport', () => {
      it('should compile to JSON format', async () => {
        const server = createStdioServer();
        const binding = createBinding(server.id, ClientType.GEMINI_CLI);

        const config = await adapter.compile([server], [binding]);
        const parsed = JSON.parse(config.content);

        expect(config.format).toBe('json');
        expect(config.filePath).toContain('settings.json');
        expect(parsed.mcpServers['test-stdio']).toEqual({
          command: 'node',
          args: ['server.js', '--port', '3000'],
          env: { API_KEY: 'secret123', DEBUG: 'true' }
        });
      });

      it('should add to mcp.excluded when disabled', async () => {
        const server = createStdioServer();
        const binding = createBinding(server.id, ClientType.GEMINI_CLI, 'off');

        const config = await adapter.compile([server], [binding]);
        const parsed = JSON.parse(config.content);

        expect(parsed.mcp?.excluded).toContain('test-stdio');
      });

      it('should not have mcp.excluded when all enabled', async () => {
        const server = createStdioServer();
        const binding = createBinding(server.id, ClientType.GEMINI_CLI, 'on');

        const config = await adapter.compile([server], [binding]);
        const parsed = JSON.parse(config.content);

        expect(parsed.mcp).toBeUndefined();
      });

      it('should compile minimal stdio server', async () => {
        const server = createMinimalStdioServer('minimal');
        const binding = createBinding(server.id, ClientType.GEMINI_CLI);

        const config = await adapter.compile([server], [binding]);
        const parsed = JSON.parse(config.content);

        expect(parsed.mcpServers['minimal']).toEqual({
          command: 'npx'
        });
      });
    });

    describe('HTTP transport', () => {
      it('should compile http server with headers', async () => {
        const server = createHttpServer();
        const binding = createBinding(server.id, ClientType.GEMINI_CLI);

        const config = await adapter.compile([server], [binding]);
        const parsed = JSON.parse(config.content);

        expect(parsed.mcpServers['test-http']).toEqual({
          url: 'http://localhost:8080/sse',
          headers: { Authorization: 'Bearer token123' }
        });
      });

      it('should compile minimal http server', async () => {
        const server = createMinimalHttpServer('http-min', 'https://api.ai/mcp');
        const binding = createBinding(server.id, ClientType.GEMINI_CLI);

        const config = await adapter.compile([server], [binding]);
        const parsed = JSON.parse(config.content);

        expect(parsed.mcpServers['http-min']).toEqual({
          url: 'https://api.ai/mcp'
        });
      });
    });
  });
});

// ============================================================================
// PART 2: HTTP Edge Cases
// ============================================================================

describe('HTTP Edge Cases', () => {
  const adapters = [
    { name: 'ClaudeCode', adapter: new ClaudeCodeAdapter(), client: ClientType.CLAUDE_CODE },
    { name: 'OpenCode', adapter: new OpenCodeAdapter(), client: ClientType.OPENCODE },
    { name: 'Codex', adapter: new CodexAdapter(), client: ClientType.CODEX },
    { name: 'GeminiCli', adapter: new GeminiCliAdapter(), client: ClientType.GEMINI_CLI }
  ] as const;

  describe('Different URL schemes', () => {
    const urlSchemes = [
      { scheme: 'http', url: 'http://localhost:3000/mcp' },
      { scheme: 'https', url: 'https://secure.example.com/api/mcp' },
      { scheme: 'ws', url: 'ws://localhost:8080/ws' },
      { scheme: 'wss', url: 'wss://secure.example.com/websocket' }
    ];

    for (const { name, adapter, client } of adapters) {
      describe(name, () => {
        for (const { scheme, url } of urlSchemes) {
          it(`should handle ${scheme}:// URL`, async () => {
            const server = createMinimalHttpServer(`${scheme}-server`, url);
            const binding = createBinding(server.id, client);

            const config = await adapter.compile([server], [binding]);

            if (name === 'Codex') {
              const parsed = toml.parse(config.content) as any;
              expect(parsed.mcp_servers[`${scheme}-server`].url).toBe(url);
            } else if (name === 'OpenCode') {
              const parsed = JSON.parse(config.content);
              expect(parsed.mcp[`${scheme}-server`].url).toBe(url);
            } else {
              const parsed = JSON.parse(config.content);
              expect(parsed.mcpServers[`${scheme}-server`].url).toBe(url);
            }
          });
        }
      });
    }
  });

  describe('URLs with query parameters', () => {
    const urlsWithParams = [
      'http://localhost:3000/mcp?token=abc123',
      'https://api.example.com/v1/mcp?key=xxx&region=us-east',
      'http://localhost/sse?debug=true&verbose=1&format=json'
    ];

    for (const { name, adapter, client } of adapters) {
      describe(name, () => {
        for (const url of urlsWithParams) {
          it(`should preserve query params: ${url.substring(0, 50)}...`, async () => {
            const server = createMinimalHttpServer('query-server', url);
            const binding = createBinding(server.id, client);

            const config = await adapter.compile([server], [binding]);

            if (name === 'Codex') {
              const parsed = toml.parse(config.content) as any;
              expect(parsed.mcp_servers['query-server'].url).toBe(url);
            } else if (name === 'OpenCode') {
              const parsed = JSON.parse(config.content);
              expect(parsed.mcp['query-server'].url).toBe(url);
            } else {
              const parsed = JSON.parse(config.content);
              expect(parsed.mcpServers['query-server'].url).toBe(url);
            }
          });
        }
      });
    }
  });

  describe('Headers variations', () => {
    it('should handle empty headers object', async () => {
      const server = createHttpServer({ headers: {} });

      for (const { adapter, client } of adapters) {
        const binding = createBinding(server.id, client);
        const config = await adapter.compile([server], [binding]);
        expect(config.content).toBeTruthy();
      }
    });

    it('should handle multiple headers', async () => {
      const server = createHttpServer({
        headers: {
          Authorization: 'Bearer token',
          'X-API-Key': 'api-key-123',
          'Content-Type': 'application/json',
          'X-Custom-Header': 'custom-value'
        }
      });

      for (const { name, adapter, client } of adapters) {
        const binding = createBinding(server.id, client);
        const config = await adapter.compile([server], [binding]);

        if (name === 'Codex') {
          const parsed = toml.parse(config.content) as any;
          const headers = parsed.mcp_servers['test-http'].http_headers;
          expect(headers.Authorization).toBe('Bearer token');
          expect(headers['X-API-Key']).toBe('api-key-123');
        } else if (name === 'OpenCode') {
          const parsed = JSON.parse(config.content);
          const headers = parsed.mcp['test-http'].headers;
          expect(headers.Authorization).toBe('Bearer token');
          expect(headers['X-API-Key']).toBe('api-key-123');
        } else {
          const parsed = JSON.parse(config.content);
          const headers = parsed.mcpServers['test-http'].headers;
          expect(headers.Authorization).toBe('Bearer token');
          expect(headers['X-API-Key']).toBe('api-key-123');
        }
      }
    });

    it('should handle headers with special characters in values', async () => {
      const server = createHttpServer({
        headers: {
          Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
          'X-Special': 'value with spaces and "quotes"'
        }
      });

      for (const { name, adapter, client } of adapters) {
        const binding = createBinding(server.id, client);
        const config = await adapter.compile([server], [binding]);
        expect(config.content).toBeTruthy();

        if (name === 'Codex') {
          const parsed = toml.parse(config.content) as any;
          expect(parsed.mcp_servers['test-http'].http_headers['X-Special']).toBe('value with spaces and "quotes"');
        } else if (name === 'OpenCode') {
          const parsed = JSON.parse(config.content);
          expect(parsed.mcp['test-http'].headers['X-Special']).toBe('value with spaces and "quotes"');
        } else {
          const parsed = JSON.parse(config.content);
          expect(parsed.mcpServers['test-http'].headers['X-Special']).toBe('value with spaces and "quotes"');
        }
      }
    });
  });
});

// ============================================================================
// PART 3: Negative Tests
// ============================================================================

describe('Negative Tests', () => {
  const adapters = [
    { name: 'ClaudeCode', adapter: new ClaudeCodeAdapter(), client: ClientType.CLAUDE_CODE },
    { name: 'OpenCode', adapter: new OpenCodeAdapter(), client: ClientType.OPENCODE },
    { name: 'Codex', adapter: new CodexAdapter(), client: ClientType.CODEX },
    { name: 'GeminiCli', adapter: new GeminiCliAdapter(), client: ClientType.GEMINI_CLI }
  ] as const;

  describe('Empty inputs', () => {
    for (const { name, adapter } of adapters) {
      it(`${name}: should handle empty servers array`, async () => {
        const config = await adapter.compile([], []);

        expect(config.content).toBeTruthy();
        expect(config.filePath).toBeTruthy();
      });

      it(`${name}: should handle servers without matching bindings`, async () => {
        const server = createStdioServer();
        const binding = createBinding(server.id, 'non-existent-client');

        const config = await adapter.compile([server], [binding]);
        expect(config.content).toBeTruthy();
      });
    }
  });

  describe('Binding references non-existent server', () => {
    for (const { name, adapter, client } of adapters) {
      it(`${name}: should skip binding with invalid serverId`, async () => {
        const binding = createBinding('non-existent-server-id', client);

        const config = await adapter.compile([], [binding]);
        expect(config.content).toBeTruthy();
      });
    }
  });

  describe('Servers with null/undefined optional fields', () => {
    for (const { name, adapter, client } of adapters) {
      it(`${name}: should handle server with all optional fields null`, async () => {
        const server: McpServer = {
          id: 'null-server',
          name: 'null-test',
          type: 'stdio',
          command: 'echo',
          args: null,
          cwd: null,
          url: null,
          headers: null,
          env: null,
          tags: null,
          fingerprint: 'fp-null',
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        const binding = createBinding(server.id, client);

        const config = await adapter.compile([server], [binding]);

        expect(config.content).toBeTruthy();
      });
    }
  });
});

// ============================================================================
// PART 4: Integration Tests - Real File Write
// ============================================================================

describe('Integration: apply() with real file writes', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'adapter-test-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('ClaudeCodeAdapter', () => {
    it('should write valid JSONC to file', async () => {
      const adapter = new ClaudeCodeAdapter();
      const configPath = path.join(tempDir, '.claude.json');

      const server = createStdioServer();
      const binding = createBinding(server.id, ClientType.CLAUDE_CODE);
      const config = await adapter.compile([server], [binding]);
      config.filePath = configPath;

      const result = await adapter.apply(config);

      expect(result.success).toBe(true);
      expect(result.filePath).toBe(configPath);

      const written = await fs.readFile(configPath, 'utf-8');
      const parsed = parse(written);

      expect(parsed.mcpServers['test-stdio']).toBeDefined();
      expect(parsed.mcpServers['test-stdio'].command).toBe('node');
    });

    it('should preserve non-mcpServers config but replace mcpServers completely', async () => {
      const adapter = new ClaudeCodeAdapter();
      const configPath = path.join(tempDir, '.claude.json');

      const existingConfig = {
        projects: { '/some/path': { name: 'existing-project' } },
        otherSetting: 'should-be-preserved',
        mcpServers: {
          'existing-server': { command: 'old-cmd' }
        }
      };
      await fs.writeFile(configPath, JSON.stringify(existingConfig, null, 2));

      const server = createStdioServer({ name: 'new-server' });
      const binding = createBinding(server.id, ClientType.CLAUDE_CODE);
      const config = await adapter.compile([server], [binding]);
      config.filePath = configPath;

      await adapter.apply(config);

      const written = await fs.readFile(configPath, 'utf-8');
      const parsed = parse(written);

      expect(parsed.otherSetting).toBe('should-be-preserved');
      expect(parsed.projects['/some/path'].name).toBe('existing-project');
      expect(parsed.mcpServers['existing-server']).toBeUndefined();
      expect(parsed.mcpServers['new-server']).toBeDefined();
    });

    it('should write http server correctly', async () => {
      const adapter = new ClaudeCodeAdapter();
      const configPath = path.join(tempDir, '.claude.json');

      const server = createHttpServer();
      const binding = createBinding(server.id, ClientType.CLAUDE_CODE);
      const config = await adapter.compile([server], [binding]);
      config.filePath = configPath;

      await adapter.apply(config);

      const written = await fs.readFile(configPath, 'utf-8');
      const parsed = parse(written);

      expect(parsed.mcpServers['test-http'].url).toBe('http://localhost:8080/sse');
      expect(parsed.mcpServers['test-http'].type).toBe('http');
    });
  });

  describe('OpenCodeAdapter', () => {
    it('should write valid JSON to file', async () => {
      const adapter = new OpenCodeAdapter();
      const configPath = path.join(tempDir, 'opencode.json');

      const server = createStdioServer();
      const binding = createBinding(server.id, ClientType.OPENCODE);
      const config = await adapter.compile([server], [binding]);
      config.filePath = configPath;

      const result = await adapter.apply(config);

      expect(result.success).toBe(true);

      const written = await fs.readFile(configPath, 'utf-8');
      const parsed = JSON.parse(written);

      expect(parsed.mcp['test-stdio']).toBeDefined();
      expect(parsed.mcp['test-stdio'].type).toBe('local');
      expect(parsed.mcp['test-stdio'].command).toEqual(['node', 'server.js', '--port', '3000']);
    });

    it('should preserve existing config when merging', async () => {
      const adapter = new OpenCodeAdapter();
      const configPath = path.join(tempDir, 'opencode.json');

      const existingConfig = {
        model: 'claude-3',
        theme: 'dark',
        mcp: {
          'old-server': { type: 'local', command: ['old'] }
        }
      };
      await fs.writeFile(configPath, JSON.stringify(existingConfig, null, 2));

      const server = createStdioServer({ name: 'new-server' });
      const binding = createBinding(server.id, ClientType.OPENCODE);
      const config = await adapter.compile([server], [binding]);
      config.filePath = configPath;

      await adapter.apply(config);

      const written = await fs.readFile(configPath, 'utf-8');
      const parsed = JSON.parse(written);

      expect(parsed.model).toBe('claude-3');
      expect(parsed.theme).toBe('dark');
      expect(parsed.mcp['new-server']).toBeDefined();
    });

    it('should write http server correctly', async () => {
      const adapter = new OpenCodeAdapter();
      const configPath = path.join(tempDir, 'opencode.json');

      const server = createHttpServer();
      const binding = createBinding(server.id, ClientType.OPENCODE);
      const config = await adapter.compile([server], [binding]);
      config.filePath = configPath;

      await adapter.apply(config);

      const written = await fs.readFile(configPath, 'utf-8');
      const parsed = JSON.parse(written);

      expect(parsed.mcp['test-http'].type).toBe('remote');
      expect(parsed.mcp['test-http'].url).toBe('http://localhost:8080/sse');
    });
  });

  describe('CodexAdapter', () => {
    it('should write valid TOML to file', async () => {
      const adapter = new CodexAdapter();
      const configPath = path.join(tempDir, 'config.toml');

      const server = createStdioServer();
      const binding = createBinding(server.id, ClientType.CODEX);
      const config = await adapter.compile([server], [binding]);
      config.filePath = configPath;

      const result = await adapter.apply(config);

      expect(result.success).toBe(true);

      const written = await fs.readFile(configPath, 'utf-8');
      const parsed = toml.parse(written) as any;

      expect(parsed.mcp_servers['test-stdio']).toBeDefined();
      expect(parsed.mcp_servers['test-stdio'].command).toBe('node');
    });

    it('should preserve existing TOML sections', async () => {
      const adapter = new CodexAdapter();
      const configPath = path.join(tempDir, 'config.toml');

      const existingToml = `
model = "gpt-4"
temperature = 0.7

[mcp_servers.existing]
command = "old-server"
`;
      await fs.writeFile(configPath, existingToml);

      const server = createStdioServer({ name: 'new-server' });
      const binding = createBinding(server.id, ClientType.CODEX);
      const config = await adapter.compile([server], [binding]);
      config.filePath = configPath;

      await adapter.apply(config);

      const written = await fs.readFile(configPath, 'utf-8');
      const parsed = toml.parse(written) as any;

      expect(parsed.model).toBe('gpt-4');
      expect(parsed.temperature).toBe(0.7);
      expect(parsed.mcp_servers['new-server']).toBeDefined();
    });

    it('should write http server with experimental flag', async () => {
      const adapter = new CodexAdapter();
      const configPath = path.join(tempDir, 'config.toml');

      const server = createHttpServer();
      const binding = createBinding(server.id, ClientType.CODEX);
      const config = await adapter.compile([server], [binding]);
      config.filePath = configPath;

      await adapter.apply(config);

      const written = await fs.readFile(configPath, 'utf-8');
      const parsed = toml.parse(written) as any;

      expect(parsed.experimental_use_rmcp_client).toBe(true);
      expect(parsed.mcp_servers['test-http'].url).toBe('http://localhost:8080/sse');
    });
  });

  describe('GeminiCliAdapter', () => {
    it('should write valid JSON to file', async () => {
      const adapter = new GeminiCliAdapter();
      const configPath = path.join(tempDir, 'settings.json');

      const server = createStdioServer();
      const binding = createBinding(server.id, ClientType.GEMINI_CLI);
      const config = await adapter.compile([server], [binding]);
      config.filePath = configPath;

      const result = await adapter.apply(config);

      expect(result.success).toBe(true);

      const written = await fs.readFile(configPath, 'utf-8');
      const parsed = JSON.parse(written);

      expect(parsed.mcpServers['test-stdio']).toBeDefined();
      expect(parsed.mcpServers['test-stdio'].command).toBe('node');
    });

    it('should write disabled server with mcp.excluded', async () => {
      const adapter = new GeminiCliAdapter();
      const configPath = path.join(tempDir, 'settings.json');

      const server = createStdioServer();
      const binding = createBinding(server.id, ClientType.GEMINI_CLI, 'off');
      const config = await adapter.compile([server], [binding]);
      config.filePath = configPath;

      await adapter.apply(config);

      const written = await fs.readFile(configPath, 'utf-8');
      const parsed = JSON.parse(written);

      expect(parsed.mcp.excluded).toContain('test-stdio');
    });

    it('should preserve existing config when merging', async () => {
      const adapter = new GeminiCliAdapter();
      const configPath = path.join(tempDir, 'settings.json');

      const existingConfig = {
        theme: 'dark',
        apiKey: 'xxx',
        mcpServers: {
          'old-server': { command: 'old' }
        }
      };
      await fs.writeFile(configPath, JSON.stringify(existingConfig, null, 2));

      const server = createStdioServer({ name: 'new-server' });
      const binding = createBinding(server.id, ClientType.GEMINI_CLI);
      const config = await adapter.compile([server], [binding]);
      config.filePath = configPath;

      await adapter.apply(config);

      const written = await fs.readFile(configPath, 'utf-8');
      const parsed = parse(written);

      expect(parsed.theme).toBe('dark');
      expect(parsed.apiKey).toBe('xxx');
    });
  });
});

// ============================================================================
// PART 5: Round-Trip Tests
// ============================================================================

describe('Round-trip: compile → apply → discover → normalize', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'roundtrip-test-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('ClaudeCodeAdapter', () => {
    it('should round-trip stdio server', async () => {
      const adapter = new ClaudeCodeAdapter();
      const configPath = path.join(tempDir, '.claude.json');

      const originalServer = createStdioServer({
        id: 'rt-stdio',
        name: 'roundtrip-stdio'
      });
      const binding = createBinding(originalServer.id, ClientType.CLAUDE_CODE);

      const config = await adapter.compile([originalServer], [binding]);
      config.filePath = configPath;
      await adapter.apply(config);

      const result = await adapter.discover({ globalConfigPath: configPath });

      expect(result.candidates.length).toBeGreaterThanOrEqual(1);
      const recovered = result.candidates.find(c => c.server.name === 'roundtrip-stdio');

      expect(recovered).toBeDefined();
      expect(recovered?.server.type).toBe('stdio');
      expect(recovered?.server.command).toBe(originalServer.command);
      expect(recovered?.server.args).toEqual(originalServer.args);
      expect(recovered?.server.cwd).toBe(originalServer.cwd);
      expect(recovered?.server.env).toEqual(originalServer.env);
      expect(recovered?.binding.enabled).toBe('on');
    });

    it('should round-trip http server', async () => {
      const adapter = new ClaudeCodeAdapter();
      const configPath = path.join(tempDir, '.claude.json');

      const originalServer = createHttpServer({
        id: 'rt-http',
        name: 'roundtrip-http'
      });
      const binding = createBinding(originalServer.id, ClientType.CLAUDE_CODE);

      const config = await adapter.compile([originalServer], [binding]);
      config.filePath = configPath;
      await adapter.apply(config);

      const result = await adapter.discover({ globalConfigPath: configPath });

      expect(result.candidates.length).toBeGreaterThanOrEqual(1);
      const recovered = result.candidates.find(c => c.server.name === 'roundtrip-http');

      expect(recovered).toBeDefined();
      expect(recovered?.server.type).toBe('http');
      expect(recovered?.server.url).toBe(originalServer.url);
      expect(recovered?.server.headers).toEqual(originalServer.headers);
    });

    it('should round-trip multiple servers', async () => {
      const adapter = new ClaudeCodeAdapter();
      const configPath = path.join(tempDir, '.claude.json');

      const stdioServer = createStdioServer({ id: 's1', name: 'multi-stdio' });
      const httpServer = createHttpServer({ id: 's2', name: 'multi-http' });

      const bindings = [
        createBinding(stdioServer.id, ClientType.CLAUDE_CODE),
        createBinding(httpServer.id, ClientType.CLAUDE_CODE)
      ];

      const config = await adapter.compile([stdioServer, httpServer], bindings);
      config.filePath = configPath;
      await adapter.apply(config);

      const result = await adapter.discover({ globalConfigPath: configPath });

      expect(result.candidates.length).toBeGreaterThanOrEqual(2);

      const names = result.candidates.map(c => c.server.name);
      expect(names).toContain('multi-stdio');
      expect(names).toContain('multi-http');
    });
  });

  describe('OpenCodeAdapter', () => {
    it('should round-trip stdio server', async () => {
      const adapter = new OpenCodeAdapter();
      const configPath = path.join(tempDir, 'opencode.json');

      const originalServer = createStdioServer({
        id: 'rt-stdio',
        name: 'roundtrip-stdio'
      });
      const binding = createBinding(originalServer.id, ClientType.OPENCODE);

      const config = await adapter.compile([originalServer], [binding]);
      config.filePath = configPath;
      await adapter.apply(config);

      const result = await adapter.discover({ globalConfigPath: configPath });

      expect(result.candidates).toHaveLength(1);
      const recovered = result.candidates[0];

      expect(recovered?.server.name).toBe('roundtrip-stdio');
      expect(recovered?.server.type).toBe('stdio');
      expect(recovered?.server.command).toBe(originalServer.command);
      expect(recovered?.server.args).toEqual(originalServer.args);
      expect(recovered?.server.env).toEqual(originalServer.env);
    });

    it('should round-trip http server', async () => {
      const adapter = new OpenCodeAdapter();
      const configPath = path.join(tempDir, 'opencode.json');

      const originalServer = createHttpServer({
        id: 'rt-http',
        name: 'roundtrip-http'
      });
      const binding = createBinding(originalServer.id, ClientType.OPENCODE);

      const config = await adapter.compile([originalServer], [binding]);
      config.filePath = configPath;
      await adapter.apply(config);

      const result = await adapter.discover({ globalConfigPath: configPath });

      expect(result.candidates).toHaveLength(1);
      const recovered = result.candidates[0];

      expect(recovered?.server.type).toBe('http');
      expect(recovered?.server.url).toBe(originalServer.url);
      expect(recovered?.server.headers).toEqual(originalServer.headers);
    });

    it('should round-trip disabled server', async () => {
      const adapter = new OpenCodeAdapter();
      const configPath = path.join(tempDir, 'opencode.json');

      const originalServer = createStdioServer({ name: 'disabled-server' });
      const binding = createBinding(originalServer.id, ClientType.OPENCODE, 'off');

      const config = await adapter.compile([originalServer], [binding]);
      config.filePath = configPath;
      await adapter.apply(config);

      const result = await adapter.discover({ globalConfigPath: configPath });

      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0]?.binding.enabled).toBe('off');
    });
  });

  describe('CodexAdapter', () => {
    it('should round-trip stdio server', async () => {
      const adapter = new CodexAdapter();
      const configPath = path.join(tempDir, 'config.toml');

      const originalServer = createStdioServer({
        id: 'rt-stdio',
        name: 'roundtrip-stdio'
      });
      const binding = createBinding(originalServer.id, ClientType.CODEX);

      const config = await adapter.compile([originalServer], [binding]);
      config.filePath = configPath;
      await adapter.apply(config);

      const result = await adapter.discover({ globalConfigPath: configPath });

      expect(result.candidates).toHaveLength(1);
      const recovered = result.candidates[0];

      expect(recovered?.server.name).toBe('roundtrip-stdio');
      expect(recovered?.server.type).toBe('stdio');
      expect(recovered?.server.command).toBe(originalServer.command);
      expect(recovered?.server.args).toEqual(originalServer.args);
      expect(recovered?.server.cwd).toBe(originalServer.cwd);
      expect(recovered?.server.env).toEqual(originalServer.env);
    });

    it('should round-trip http server', async () => {
      const adapter = new CodexAdapter();
      const configPath = path.join(tempDir, 'config.toml');

      const originalServer = createHttpServer({
        id: 'rt-http',
        name: 'roundtrip-http'
      });
      const binding = createBinding(originalServer.id, ClientType.CODEX);

      const config = await adapter.compile([originalServer], [binding]);
      config.filePath = configPath;
      await adapter.apply(config);

      const result = await adapter.discover({ globalConfigPath: configPath });

      expect(result.candidates).toHaveLength(1);
      const recovered = result.candidates[0];

      expect(recovered?.server.type).toBe('http');
      expect(recovered?.server.url).toBe(originalServer.url);
      expect(recovered?.server.headers?.Authorization).toBe(originalServer.headers?.Authorization);
    });
  });

  describe('GeminiCliAdapter', () => {
    it('should round-trip stdio server', async () => {
      const adapter = new GeminiCliAdapter();
      const configPath = path.join(tempDir, 'settings.json');

      const originalServer = createStdioServer({
        id: 'rt-stdio',
        name: 'roundtrip-stdio'
      });
      const binding = createBinding(originalServer.id, ClientType.GEMINI_CLI);

      const config = await adapter.compile([originalServer], [binding]);
      config.filePath = configPath;
      await adapter.apply(config);

      const result = await adapter.discover({ globalConfigPath: configPath });

      expect(result.candidates).toHaveLength(1);
      const recovered = result.candidates[0];

      expect(recovered?.server.name).toBe('roundtrip-stdio');
      expect(recovered?.server.type).toBe('stdio');
      expect(recovered?.server.command).toBe(originalServer.command);
      expect(recovered?.server.args).toEqual(originalServer.args);
      expect(recovered?.server.env).toEqual(originalServer.env);
    });

    it('should round-trip http server', async () => {
      const adapter = new GeminiCliAdapter();
      const configPath = path.join(tempDir, 'settings.json');

      const originalServer = createHttpServer({
        id: 'rt-http',
        name: 'roundtrip-http'
      });
      const binding = createBinding(originalServer.id, ClientType.GEMINI_CLI);

      const config = await adapter.compile([originalServer], [binding]);
      config.filePath = configPath;
      await adapter.apply(config);

      const result = await adapter.discover({ globalConfigPath: configPath });

      expect(result.candidates).toHaveLength(1);
      const recovered = result.candidates[0];

      expect(recovered?.server.type).toBe('http');
      expect(recovered?.server.url).toBe(originalServer.url);
      expect(recovered?.server.headers).toEqual(originalServer.headers);
    });

    it('should round-trip disabled server via mcp.excluded', async () => {
      const adapter = new GeminiCliAdapter();
      const configPath = path.join(tempDir, 'settings.json');

      const originalServer = createStdioServer({ name: 'disabled-server' });
      const binding = createBinding(originalServer.id, ClientType.GEMINI_CLI, 'off');

      const config = await adapter.compile([originalServer], [binding]);
      config.filePath = configPath;
      await adapter.apply(config);

      const result = await adapter.discover({ globalConfigPath: configPath });

      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0]?.binding.enabled).toBe('off');
    });
  });
});
