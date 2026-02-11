import { TopNavigation } from './TopNavigation'
import { SettingsPage } from '../../pages/SettingsPage'

export function SettingsLayout() {
  return (
    <div className="h-screen flex flex-col ui-bg-app ui-text-primary overflow-hidden">
      <TopNavigation />
      <div className="flex-1 overflow-y-auto">
        <SettingsPage />
      </div>
    </div>
  )
}
