import { readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import path from 'node:path';
import { ACP_PRESETS } from '@agent-panel/core/acp';
import { createAgentServer, type AgentTarget } from '@agent-panel/server';
import type { Plugin } from 'vite';
import { agentFileFor, handleApi, isPreset, type AgentPreset } from './api.js';
import { createBreadCapability } from './capability.js';
import { RecipeLibrary } from './library.js';

export function breadBookPlugin(root: string): Plugin {
  const dataDir = process.env.BREAD_DATA
    ? path.resolve(root, process.env.BREAD_DATA)
    : path.join(root, 'data');
  const seedsDir = path.join(root, 'data', 'recipes');
  const choice = readPreset(dataDir);
  return {
    name: 'bread-book',
    configureServer(server) {
      const library = new RecipeLibrary(dataDir, seedsDir);
      const agent = createAgentServer({
        cwd: root,
        writableRoots: [library.recipesDir],
        agent: agentTarget(root, choice.preset),
        capabilities: [createBreadCapability(library.recipesDir, () => library.refresh(true))],
      });
      const opened = library.open();
      server.middlewares.use((req, res, next) => {
        void opened
          .then(() =>
            handleApi(req, res, library, {
              preset: choice.preset,
              locked: choice.locked,
              agentFile: agentFileFor(dataDir),
              onSwitch: () => {
                setTimeout(() => {
                  void server.restart();
                }, 40);
              },
            }),
          )
          .then((handled) => {
            if (handled) return;
            agent.middleware()(req, res, next);
          })
          .catch((error: unknown) => {
            if (!res.headersSent) {
              res.writeHead(500, { 'content-type': 'application/json' });
              res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
            }
          });
      });
      if (isHttp1(server.httpServer)) agent.attach(server.httpServer);
      server.httpServer?.on('close', () => {
        library.close();
        void agent.close();
      });
      void opened;
    },
  };
}

function readPreset(dataDir: string): { preset: AgentPreset; locked: boolean } {
  const env = process.env.BREAD_AGENT;
  if (isPreset(env)) return { preset: env, locked: true };
  try {
    const raw = JSON.parse(readFileSync(agentFileFor(dataDir), 'utf8')) as { preset?: unknown };
    if (isPreset(raw.preset)) return { preset: raw.preset, locked: false };
  } catch {
    // The picker writes this file after the first choice.
  }
  return { preset: 'mock', locked: false };
}

function agentTarget(root: string, preset: AgentPreset): AgentTarget {
  if (preset === 'claude-code') return mutableCommand(ACP_PRESETS['claude-code']);
  if (preset === 'codex') return mutableCommand(ACP_PRESETS.codex);
  if (preset === 'gemini') return mutableCommand(ACP_PRESETS.gemini);
  const mock = path.join(root, 'dist', 'mock-agent.mjs');
  return { command: process.execPath, args: [mock] };
}

function mutableCommand(preset: { command: string; args?: readonly string[] }): AgentTarget {
  return { command: preset.command, args: [...(preset.args ?? [])] };
}

function isHttp1(server: unknown): server is Server {
  return Boolean(server && typeof server === 'object' && 'maxHeadersCount' in server);
}
