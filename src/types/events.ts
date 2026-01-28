import type { Message, Artifact, Model, RunLog } from './domain';

/**
 * IPC Events: Renderer调用Main的事件
 */
export type IPCEvent =
  | { type: 'space:create'; payload: { name: string; workDir: string } }
  | { type: 'space:list'; payload: Record<string, never> }
  | { type: 'session:create'; payload: { spaceId: string; title?: string } }
  | { type: 'message:send'; payload: { sessionId: string; content: string } }
  | { type: 'task:create'; payload: { sessionId: string; input: string; type: string } }
  | { type: 'task:cancel'; payload: { taskId: string } }
  | { type: 'model:configure'; payload: Model }
  | { type: 'browser:navigate'; payload: { url: string } }
  | { type: 'browser:click'; payload: { selector: string } };

/**
 * State Events: Main推送给Renderer的状态更新事件
 */
export type StateEvent =
  | { type: 'message:created'; payload: Message }
  | { type: 'task:status-changed'; payload: { taskId: string; status: string } }
  | { type: 'artifact:created'; payload: Artifact }
  | { type: 'run:log'; payload: { runId: string; log: RunLog } };
