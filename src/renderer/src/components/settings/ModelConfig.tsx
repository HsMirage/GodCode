import { useState } from 'react'
import { Key, Save, RotateCw, Check, AlertCircle } from 'lucide-react'
import { cn } from '../../utils'

interface ProviderConfig {
  id: string
  provider: string
  apiKey: string
  model: string
  baseUrl?: string
}

export function ModelConfig() {
  const [configs, setConfigs] = useState<ProviderConfig[]>([
    { id: '1', provider: 'openai-compatible', apiKey: '', model: 'gpt-4o' }
  ])

  const [testingId, setTestingId] = useState<string | null>(null)
  const [testStatus, setTestStatus] = useState<Record<string, 'success' | 'error' | null>>({})

  const handleTest = async (id: string) => {
    setTestingId(id)
    setTestStatus(prev => ({ ...prev, [id]: null }))

    // Simulate API call
    setTimeout(() => {
      setTestingId(null)
      // Random success/fail for demo
      setTestStatus(prev => ({
        ...prev,
        [id]: Math.random() > 0.3 ? 'success' : 'error'
      }))
    }, 1500)
  }

  const handleSave = (id: string) => {
    // In real app, this would save to backend via IPC
    console.log(
      'Saving config:',
      configs.find(c => c.id === id)
    )
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-slate-100">Model Configuration</h2>
        <p className="text-sm text-slate-400 mt-1">
          Configure API keys and default models for each LLM provider. Keys are stored securely in
          the local system keychain.
        </p>
      </div>

      <div className="grid gap-4">
        {configs.map(config => (
          <div
            key={config.id}
            className="bg-slate-900 border border-slate-700 rounded-lg p-4 transition-all hover:border-slate-600"
          >
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center shrink-0">
                <span className="font-bold text-slate-300 text-xs uppercase">
                  {config.provider.slice(0, 2)}
                </span>
              </div>

              <div className="flex-1 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-slate-200 capitalize">
                    {config.provider} Provider
                  </h3>
                  {testStatus[config.id] && (
                    <span
                      className={cn(
                        'text-xs flex items-center gap-1.5 px-2 py-1 rounded',
                        testStatus[config.id] === 'success'
                          ? 'bg-green-500/10 text-green-400'
                          : 'bg-red-500/10 text-red-400'
                      )}
                    >
                      {testStatus[config.id] === 'success' ? (
                        <>
                          <Check className="w-3 h-3" /> Connected
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-3 h-3" /> Failed
                        </>
                      )}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-400 font-medium">API Key</label>
                    <div className="relative">
                      <Key className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-500" />
                      <input
                        type="password"
                        placeholder={`sk-...`}
                        value={config.apiKey}
                        onChange={e => {
                          const newConfigs = [...configs]
                          const idx = newConfigs.findIndex(c => c.id === config.id)
                          if (idx >= 0) {
                            newConfigs[idx].apiKey = e.target.value
                            setConfigs(newConfigs)
                          }
                        }}
                        className="w-full bg-slate-950 border border-slate-700 rounded-md py-2 pl-9 pr-3 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors placeholder:text-slate-600"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-400 font-medium">Default Model</label>
                    <input
                      type="text"
                      placeholder="e.g. gpt-4-turbo"
                      value={config.model}
                      onChange={e => {
                        const newConfigs = [...configs]
                        const idx = newConfigs.findIndex(c => c.id === config.id)
                        if (idx >= 0) {
                          newConfigs[idx].model = e.target.value
                          setConfigs(newConfigs)
                        }
                      }}
                      className="w-full bg-slate-950 border border-slate-700 rounded-md py-2 px-3 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => handleTest(config.id)}
                    disabled={testingId === config.id}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-slate-800 text-xs text-slate-300 hover:bg-slate-700 hover:text-white transition-colors disabled:opacity-50"
                  >
                    {testingId === config.id ? (
                      <RotateCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RotateCw className="w-3.5 h-3.5" />
                    )}
                    Test Connection
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSave(config.id)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-indigo-600 text-xs text-white hover:bg-indigo-500 transition-colors ml-auto"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Save Configuration
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
