import { readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import path from 'node:path';
import { ACP_PRESETS } from '@agent-panel/core/acp';
import { createAgentServer, type AgentTarget } from '@agent-panel/server';
import type { Plugin } from 'vite';
import type { AgentPreset } from '../src/lib/types.js';
import { agentFileFor, handleApi, isPreset } from './api.js';
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
      const agentMiddleware = agent.middleware();
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
            agentMiddleware(req, res, next);
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
  if (preset === 'mock') return { command: process.execPath, args: [path.join(root, 'dist', 'mock-agent.mjs')] };
  const { command, args = [] } = ACP_PRESETS[preset];
  return { command, args: [...args] };
}

function isHttp1(server: unknown): server is Server {
  return Boolean(server && typeof server === 'object' && 'maxHeadersCount' in server);
}
