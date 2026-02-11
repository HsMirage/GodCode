/**
 * Session Continuity IPC Handlers
 *
 * Provides IPC handlers for session state persistence, crash recovery,
 * and task resumption capabilities.
 */

import { ipcMain } from 'electron'
import { INVOKE_CHANNELS } from '../../../shared/ipc-channels'
import {
  sessionContinuityService,
  type SessionState,
  type RecoveryPlan
} from '../../services/session-continuity.service'

export function registerSessionContinuityHandlers(): void {
  // Get session state
  ipcMain.handle(
    INVOKE_CHANNELS.SESSION_STATE_GET,
    async (_event, sessionId: string): Promise<SessionState | null> => {
      return sessionContinuityService.getSessionState(sessionId)
    }
  )

  // Create checkpoint for session
  ipcMain.handle(
    INVOKE_CHANNELS.SESSION_STATE_CHECKPOINT,
    async (_event, sessionId: string): Promise<{ success: boolean; error?: string }> => {
      try {
        await sessionContinuityService.createCheckpoint(sessionId)
        return { success: true }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        }
      }
    }
  )

  // Get recovery plan for session
  ipcMain.handle(
    INVOKE_CHANNELS.SESSION_RECOVERY_PLAN,
    async (_event, sessionId: string): Promise<RecoveryPlan> => {
      return sessionContinuityService.createRecoveryPlan(sessionId)
    }
  )

  // Execute recovery for session
  ipcMain.handle(
    INVOKE_CHANNELS.SESSION_RECOVERY_EXECUTE,
    async (_event, sessionId: string): Promise<{ success: boolean; error?: string }> => {
      try {
        const success = await sessionContinuityService.executeRecovery(sessionId)
        return { success }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        }
      }
    }
  )

  // List recoverable sessions
  ipcMain.handle(
    INVOKE_CHANNELS.SESSION_RECOVERABLE_LIST,
    async (): Promise<SessionState[]> => {
      return sessionContinuityService.getRecoverableSessions()
    }
  )

  // Generate resume prompt for LLM
  ipcMain.handle(
    INVOKE_CHANNELS.SESSION_RESUME_PROMPT,
    async (_event, sessionId: string): Promise<string> => {
      return sessionContinuityService.generateResumePrompt(sessionId)
    }
  )
}
