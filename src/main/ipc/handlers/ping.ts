import { IpcMainInvokeEvent } from 'electron'

export async function handlePing(_event: IpcMainInvokeEvent): Promise<string> {
  return 'pong'
}
