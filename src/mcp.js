// Minimal MCP server over stdio (newline-delimited JSON-RPC 2.0). No SDK dependency.
import { createInterface } from 'node:readline';
import { findAlternatives, vetRepo, isRepoSlug } from './core.js';

const TOOLS = [
  {
    name: 'find_alternatives',
    description:
      'Find open-source alternatives to a proprietary tool or SaaS (e.g. "notion", "intercom") and vet each one live from GitHub: VIABLE / RISKY / AVOID with reasons (abandoned, archived, bus factor, source-available license, recent relicensing, young & unproven).',
    inputSchema: {
      type: 'object',
      properties: {
        tool: { type: 'string', description: 'Name of the proprietary tool, e.g. "notion"' },
        limit: { type: 'number', description: 'Max candidates to vet (default 10)' },
      },
      required: ['tool'],
    },
  },
  {
    name: 'vet_repo',
    description: 'Vet a single GitHub repo (owner/name) before adopting it: VIABLE / RISKY / AVOID with reasons.',
    inputSchema: {
      type: 'object',
      properties: { repo: { type: 'string', description: 'owner/name, e.g. "makeplane/plane"' } },
      required: ['repo'],
    },
  },
];

export function createHandler(client, version) {
  return async function handle(msg) {
    const { id, method, params } = msg;
    const reply = (result) => ({ jsonrpc: '2.0', id, result });
    const fail = (code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
    if (id === undefined) return null; // notification
    switch (method) {
      case 'initialize':
        return reply({
          protocolVersion: params?.protocolVersion || '2025-06-18',
          capabilities: { tools: {} },
          serverInfo: { name: 'altcheck', version },
        });
      case 'ping':
        return reply({});
      case 'tools/list':
        return reply({ tools: TOOLS });
      case 'tools/call': {
        const args = params?.arguments || {};
        try {
          let data;
          if (params?.name === 'find_alternatives') {
            if (!args.tool) throw new Error('`tool` is required');
            data = await findAlternatives(client, String(args.tool), { limit: Number(args.limit) || 10 });
          } else if (params?.name === 'vet_repo') {
            if (!isRepoSlug(args.repo)) throw new Error('`repo` must look like owner/name');
            data = await vetRepo(client, args.repo);
          } else {
            return fail(-32602, `unknown tool: ${params?.name}`);
          }
          return reply({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });
        } catch (err) {
          return reply({ content: [{ type: 'text', text: `error: ${err.message}` }], isError: true });
        }
      }
      default:
        return fail(-32601, `method not found: ${method}`);
    }
  };
}

export function serve(client, version, { input = process.stdin, output = process.stdout } = {}) {
  const handle = createHandler(client, version);
  const rl = createInterface({ input });
  rl.on('line', async (line) => {
    if (!line.trim()) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      output.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }) + '\n');
      return;
    }
    const res = await handle(msg);
    if (res) output.write(JSON.stringify(res) + '\n');
  });
  return rl;
}
