import { useEffect } from 'react'
import { toast } from 'sonner'
import { useUpdaterStore } from '../../store/updater.store'
import { Download, AlertCircle, CheckCircle } from 'lucide-react'

export function UpdateToast() {
  const { status, error, updateInfo } = useUpdaterStore()

  useEffect(() => {
    if (status === 'error' && error) {
      toast.error('Update Failed', {
        description: error,
        icon: <AlertCircle className="h-5 w-5 text-red-400" />
      })
    }

    if (status === 'downloaded') {
      toast.success('Update Ready', {
        description: `Version ${updateInfo?.version} is ready to install.`,
        icon: <CheckCircle className="h-5 w-5 text-green-400" />,
        action: {
          label: 'Install',
          onClick: () => window.codeall?.invoke('updater:quit-and-install')
        }
      })
    }
  }, [status, error, updateInfo])

  return null
}
