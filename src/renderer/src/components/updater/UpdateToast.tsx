import { useEffect } from 'react'
import { toast } from 'sonner'
import { useUpdaterStore } from '../../store/updater.store'
import { AlertCircle, CheckCircle } from 'lucide-react'
import { INVOKE_CHANNELS } from '@shared/ipc-channels'
import { UI_TEXT } from '../../constants/i18n'

export function UpdateToast() {
  const { status, error, updateInfo } = useUpdaterStore()

  useEffect(() => {
    if (status === 'error' && error) {
      toast.error(UI_TEXT.updater.updateFailedTitle, {
        description: error,
        icon: <AlertCircle className="h-5 w-5 text-red-400" />
      })
    }

    if (status === 'downloaded') {
      toast.success(UI_TEXT.updater.updateReadyTitle, {
        description: UI_TEXT.updater.updateReadyDescription(updateInfo?.version),
        icon: <CheckCircle className="h-5 w-5 text-green-400" />,
        action: {
          label: UI_TEXT.updater.install,
          onClick: () => window.godcode?.invoke(INVOKE_CHANNELS.UPDATER_QUIT_AND_INSTALL)
        }
      })
    }
  }, [status, error, updateInfo])

  return null
}
