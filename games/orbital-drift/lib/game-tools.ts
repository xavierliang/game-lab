import type { OrbitGame } from './orbit-game';
type Tool = {
  name: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => unknown;
};
type Registry = {
  registerTool: (tool: Tool, options: { signal: AbortSignal }) => void | Promise<void>;
};
export function registerGameTools(game: OrbitGame) {
  const registry = (document as Document & { modelContext?: Registry }).modelContext;
  const lifecycle = new AbortController();
  if (!registry?.registerTool) return () => lifecycle.abort();
  const tools: Tool[] = [
    {
      name: 'read_flight_state',
      description: 'Read the current orbital flight status and survival time.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: () => game.snapshot(),
    },
    {
      name: 'control_flight_session',
      description:
        'Start a fresh flight, pause a running flight, or resume a paused flight. Restart discards the current run.',
      inputSchema: {
        type: 'object',
        properties: { action: { type: 'string', enum: ['restart', 'pause', 'resume'] } },
        required: ['action'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: (input) => {
        if (
          !input ||
          typeof input !== 'object' ||
          Array.isArray(input) ||
          Object.keys(input).length !== 1 ||
          !('action' in input) ||
          !['restart', 'pause', 'resume'].includes(String(input.action))
        )
          throw new Error('Expected one action: restart, pause, or resume.');
        const mode = game.snapshot().mode;
        if (input.action === 'restart') game.start();
        else if (input.action === 'pause' && mode === 'playing') game.togglePause();
        else if (input.action === 'resume' && mode === 'paused') game.togglePause();
        else throw new Error(`Cannot ${String(input.action)} a flight in ${mode} state.`);
        return game.snapshot();
      },
    },
  ];
  for (const tool of tools) {
    try {
      void Promise.resolve(registry.registerTool(tool, { signal: lifecycle.signal })).catch(
        () => {},
      );
    } catch {
      /* Optional proposed browser API. */
    }
  }
  return () => lifecycle.abort();
}
