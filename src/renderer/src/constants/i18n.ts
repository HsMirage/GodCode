export const UI_TEXT = {
  agentSelector: {
    currentAgentTitle: (agentName: string) => `当前智能体：${agentName}`,
    choosePreset: '选择运行预设'
  },
  browserShell: {
    newTabFallbackTitle: '新标签页',
    manualControlActive: '已切换为手动控制',
    toggleOperationLogs: '切换操作日志',
    noTabsOpen: '暂无标签页',
    openNewTab: '打开新标签页',
    loadingBrowserView: '浏览器视图加载中…'
  },
  updater: {
    updateFailedTitle: '更新失败',
    updateReadyTitle: '更新已就绪',
    updateReadyDescription: (version?: string) =>
      version ? `版本 ${version} 已下载完成，可立即安装。` : '新版本已下载完成，可立即安装。',
    install: '立即安装',
    dialogTitleReady: '更新已就绪',
    dialogTitleAvailable: '发现新版本',
    versionLabel: (version: string) => `CodeAll v${version}`,
    downloadedDescription: '新版本已下载完成，重启后即可安装。',
    availableDescription: '检测到新版本，可立即下载。',
    releaseNotes: '更新说明',
    downloading: '下载中…',
    later: '稍后',
    downloadUpdate: '下载更新',
    installLater: '稍后安装',
    restartAndInstall: '重启并安装'
  }
} as const
