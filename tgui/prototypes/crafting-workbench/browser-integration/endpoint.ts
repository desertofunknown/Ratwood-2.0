import { createDemoData } from '../fixtures';

export type RecordedCall = { method: string; arguments: unknown[] };
const samplePaths = new Set(
  Object.values(createDemoData().crafting_recipes).flatMap((recipes) =>
    Object.values(recipes).map((recipe) => recipe.path),
  ),
);

/** No transport implementation exists here. Every supported call stays in memory. */
export function createEndpoint() {
  const calls: RecordedCall[] = [];
  let dropped = 0;
  let subscriptions = 0;
  const record = (method: string, args: unknown[]) => {
    calls.push({ method, arguments: structuredClone(args) });
    if (calls.length > 200) {
      calls.shift();
      dropped++;
    }
  };
  return {
    calls,
    get dropped() {
      return dropped;
    },
    get totalRecordedCalls() {
      return dropped + calls.length;
    },
    get subscriptions() {
      return subscriptions;
    },
    api: {
      windowId: 'disconnected-workbench-browser',
      winset(target: string, properties: object) {
        record('winset', [target, properties]);
        return Promise.resolve();
      },
      winget(target: string, property: string) {
        record('winget', [target, property]);
        return Promise.resolve({ x: 0, y: 0 });
      },
      sendMessage(type: string, payload?: Record<string, unknown>) {
        if (type === 'act/craft') {
          if (
            !payload ||
            typeof payload.item !== 'string' ||
            !samplePaths.has(payload.item) ||
            Object.keys(payload).some(
              (key) => !['item', 'amount', 'auto'].includes(key),
            ) ||
            (payload.amount !== undefined &&
              ![2, 3, 5].includes(payload.amount as number)) ||
            (payload.auto !== undefined && payload.auto !== true)
          ) {
            throw new Error(
              'Only exact sample recipe craft actions are permitted.',
            );
          }
        } else if (type === 'act/checkboxonlycraftable') {
          if (
            !payload ||
            typeof payload.state !== 'boolean' ||
            Object.keys(payload).length !== 1
          ) {
            throw new Error('Only the sample filter boolean is permitted.');
          }
        } else if (
          !['visible', 'suspend', 'ping/reply'].includes(type) ||
          payload !== undefined
        ) {
          throw new Error(`Unsupported fake endpoint message: ${type}`);
        }
        record('sendMessage', payload === undefined ? [type] : [type, payload]);
      },
      subscribe() {
        subscriptions++;
        throw new Error(
          'Native subscriptions are forbidden in this disconnected fixture.',
        );
      },
    },
  };
}

export function installEndpoint(
  target: object,
  endpoint: ReturnType<typeof createEndpoint>,
) {
  // Presence, including inherited or undefined properties, is enough to refuse.
  // Never inspect, overwrite, or fall through to an existing native endpoint.
  if ('Byond' in target || 'hubStorage' in target) {
    throw new Error(
      'This fixture refuses existing Byond or hubStorage globals.',
    );
  }
  Object.defineProperty(target, 'Byond', {
    value: endpoint.api,
    configurable: true,
    writable: false,
  });
}
