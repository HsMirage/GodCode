import { useEffect } from 'react'
import { EVENT_CHANNELS, INVOKE_CHANNELS } from '@shared/ipc-channels'
import { useUpdaterStore } from '../../store/updater.store'
import { UpdateDialog } from './UpdateDialog'
import { UpdateToast } from './UpdateToast'

export function UpdaterManager() {
  const { setStatus, setUpdateInfo, setProgress, setError } = useUpdaterStore()

  useEffect(() => {
    // Skip if not running in Electron environment
    if (!window.codeall) {
      console.warn('[UpdaterManager] window.codeall not available, skipping updater events')
      return
    }

    // Listen for updater events
    const unsubChecking = window.codeall.on(EVENT_CHANNELS.UPDATER_CHECKING_FOR_UPDATE, () => {
      setStatus('checking')
    })

    const unsubAvailable = window.codeall.on(EVENT_CHANNELS.UPDATER_UPDATE_AVAILABLE, info => {
      setStatus('available')
      setUpdateInfo(info)
    })

    const unsubNotAvailable = window.codeall.on(EVENT_CHANNELS.UPDATER_UPDATE_NOT_AVAILABLE, () => {
      setStatus('not-available')
    })

    const unsubError = window.codeall.on(EVENT_CHANNELS.UPDATER_ERROR, err => {
      setStatus('error')
      setError(err)
    })

    const unsubProgress = window.codeall.on(EVENT_CHANNELS.UPDATER_DOWNLOAD_PROGRESS, progress => {
      setStatus('downloading')
      setProgress(progress)
    })

    const unsubDownloaded = window.codeall.on(EVENT_CHANNELS.UPDATER_UPDATE_DOWNLOADED, info => {
      setStatus('downloaded')
      setUpdateInfo(info)
    })

    void window.codeall.invoke(INVOKE_CHANNELS.UPDATER_CHECK_FOR_UPDATES).catch(error => {
      console.error('[UpdaterManager] Failed to trigger update check:', error)
    })

    return () => {
      unsubChecking()
      unsubAvailable()
      unsubNotAvailable()
      unsubError()
      unsubProgress()
      unsubDownloaded()
    }
  }, [setStatus, setUpdateInfo, setProgress, setError])

  return (
    <>
      <UpdateDialog />
      <UpdateToast />
    </>
  )
}
