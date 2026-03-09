import React, { useEffect, useMemo, useState } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { Fragment } from 'react'
import clsx from 'clsx'
import { useDataStore } from '../../store/data.store'
import {
  createRecoveryTrackingMetadata,
  getRecoverySourceLabel,
  getResumeReasonLabel,
  type RecoveryTrackingMetadata
} from '@shared/recovery-contract'

type SessionRecoveryRecord = {
  sessionId: string
  status: 'active' | 'idle' | 'interrupted' | 'crashed' | 'completed' | 'recovering'
  checkpoint: {
    inProgressTasks?: string[]
    pendingTasks?: string[]
    completedTasks?: string[]
    lastActivityAt?: string | Date
    checkpointAt?: string | Date
  }
  context?: {
    spaceId?: string
    workDir?: string
    recoverySource?: RecoveryTrackingMetadata['recoverySource']
    recoveryStage?: RecoveryTrackingMetadata['recoveryStage']
    resumeReason?: RecoveryTrackingMetadata['resumeReason']
    resumeAction?: RecoveryTrackingMetadata['resumeAction']
    recoveryUpdatedAt?: string
  }
}

function toIso(value?: string | Date): string {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string' && value.trim().length > 0) return value
  return new Date().toISOString()
}

function buildRecoveryContext(session: SessionRecoveryRecord): RecoveryTrackingMetadata {
  if (
    session.context?.recoverySource &&
    session.context.recoveryStage &&
    session.context.resumeReason &&
    session.context.resumeAction
  ) {
    return createRecoveryTrackingMetadata({
      recoverySource: session.context.recoverySource,
      recoveryStage: session.context.recoveryStage,
      resumeReason: session.context.resumeReason,
      resumeAction: session.context.resumeAction,
      recoveryUpdatedAt: session.context.recoveryUpdatedAt
    })
  }

  return createRecoveryTrackingMetadata({
    recoverySource: 'crash-recovery',
    recoveryStage: session.status === 'recovering' ? 'executing' : 'session-recovery',
    resumeReason: session.status === 'crashed' ? 'crash-detected' : 'interrupted-tasks',
    resumeAction: 'restore-session'
  })
}

export function SessionRecoveryPrompt() {
  const [isOpen, setIsOpen] = useState(false)
  const [sessions, setSessions] = useState<SessionRecoveryRecord[]>([])
  const [isRecovering, setIsRecovering] = useState(false)
  const selectSession = useDataStore(state => state.selectSession)
  const setCurrentSession = useDataStore(state => state.setCurrentSession)

  useEffect(() => {
    let mounted = true

    const loadRecoverable = async () => {
      if (!window.codeall) return
      try {
        const items = (await window.codeall.invoke('session-recovery:list')) as SessionRecoveryRecord[]
        const recoverable = items.filter(item =>
          ['crashed', 'interrupted', 'recovering'].includes(item.status)
        )

        if (!mounted) return
        setSessions(recoverable)
        setIsOpen(recoverable.length > 0)
      } catch (error) {
        console.error('Failed to load recoverable sessions:', error)
      }
    }

    void loadRecoverable()

    return () => {
      mounted = false
    }
  }, [])

  const session = sessions[0] || null
  const recoveryContext = useMemo(
    () => (session ? buildRecoveryContext(session) : null),
    [session]
  )

  const handleRecover = async () => {
    if (!session || !window.codeall || !recoveryContext) return

    setIsRecovering(true)

    try {
      const result = (await window.codeall.invoke('session-recovery:execute', session.sessionId)) as {
        success: boolean
        error?: string
      }

      if (!result?.success) {
        throw new Error(result?.error || 'Failed to execute session recovery')
      }

      if (session.context?.spaceId) {
        await selectSession(session.context.spaceId, session.sessionId)
      } else {
        setCurrentSession(session.sessionId)
      }

      const prompt = (await window.codeall.invoke(
        'session-recovery:resume-prompt',
        session.sessionId
      )) as string

      if (prompt) {
        await window.codeall.invoke('message:send', {
          sessionId: session.sessionId,
          content: prompt,
          resumeContext: recoveryContext
        })
      }

      setIsOpen(false)
      setSessions(prev => prev.slice(1))
    } catch (error) {
      console.error('Failed to recover session:', error)
    } finally {
      setIsRecovering(false)
    }
  }

  const handleDismiss = () => {
    setIsOpen(false)
  }

  if (!session || !recoveryContext) return null

  const lastActiveDate = new Date(
    toIso(session.checkpoint.lastActivityAt || session.checkpoint.checkpointAt)
  ).toLocaleString()
  const completedTasks = session.checkpoint.completedTasks?.length || 0
  const interruptedTasks = session.checkpoint.inProgressTasks?.length || 0
  const pendingTasks = session.checkpoint.pendingTasks?.length || 0

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={() => {}}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-zinc-900 border border-zinc-700/50 p-6 text-left align-middle shadow-xl transition-all">
                <Dialog.Title
                  as="h3"
                  className="text-lg font-medium leading-6 text-white flex items-center gap-2"
                >
                  <span className="text-purple-400">⚡</span>
                  Restore Interrupted Session?
                </Dialog.Title>
                <div className="mt-4 space-y-4">
                  <p className="text-sm text-zinc-400">
                    {getRecoverySourceLabel(recoveryContext.recoverySource)} is available for this
                    session. Restore the checkpoint and continue where the run stopped.
                  </p>

                  <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/50 p-4 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium uppercase tracking-wider text-zinc-500">
                        Last Active
                      </span>
                      <span className="text-zinc-300">{lastActiveDate}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium uppercase tracking-wider text-zinc-500">
                        Resume Reason
                      </span>
                      <span className="text-amber-300">
                        {getResumeReasonLabel(recoveryContext.resumeReason)}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-xs">
                      <div className="rounded-md bg-zinc-900/70 p-3">
                        <div className="text-zinc-500">Completed</div>
                        <div className="mt-1 text-emerald-400 font-mono">{completedTasks}</div>
                      </div>
                      <div className="rounded-md bg-zinc-900/70 p-3">
                        <div className="text-zinc-500">Interrupted</div>
                        <div className="mt-1 text-amber-300 font-mono">{interruptedTasks}</div>
                      </div>
                      <div className="rounded-md bg-zinc-900/70 p-3">
                        <div className="text-zinc-500">Pending</div>
                        <div className="mt-1 text-sky-300 font-mono">{pendingTasks}</div>
                      </div>
                    </div>
                    {session.context?.workDir ? (
                      <div className="text-xs text-zinc-500 break-all">{session.context.workDir}</div>
                    ) : null}
                  </div>
                </div>

                <div className="mt-8 flex gap-3 justify-end">
                  <button
                    type="button"
                    className="inline-flex justify-center rounded-lg border border-transparent bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 focus-visible:ring-offset-2 transition-colors"
                    onClick={handleDismiss}
                    disabled={isRecovering}
                  >
                    Dismiss
                  </button>
                  <button
                    type="button"
                    className={clsx(
                      'inline-flex justify-center rounded-lg border border-transparent bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 transition-colors',
                      isRecovering && 'opacity-75 cursor-not-allowed'
                    )}
                    onClick={handleRecover}
                    disabled={isRecovering}
                  >
                    {isRecovering ? (
                      <span className="flex items-center gap-2">
                        <svg
                          className="animate-spin h-4 w-4 text-white"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                        Restoring...
                      </span>
                    ) : (
                      'Resume Session'
                    )}
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}
