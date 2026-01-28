import { useState } from 'react'
import {
  Bot,
  Globe,
  KeyRound,
  Save,
  Plus,
  TextCursorInput,
  Trash2
} from 'lucide-react'

type ModelProvider = 'anthropic' | 'openai' | 'google' | 'ollama' | 'custom'

export interface ModelConfigFormValues {
  provider: ModelProvider
  modelName: string
  apiKey: string
  baseURL: string
}

export interface ModelConfigFormProps {
  initialProvider?: ModelProvider
  initialModelName?: string
  initialApiKey?: string
  initialBaseURL?: string
  onAdd?: (values: ModelConfigFormValues) => void
  onSave?: (values: ModelConfigFormValues) => void
  onDelete?: () => void
}

const panelClass = [
  'rounded-2xl border border-slate-800/70 bg-slate-950/80 p-6 text-slate-100',
  'shadow-[0_0_24px_rgba(15,23,42,0.35)] backdrop-blur'
].join(' ')

const fieldLabelClass = 'grid gap-2 text-sm text-slate-200'

const fieldTitleClass =
  'flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-500'

const headerIconClass = [
  'flex h-10 w-10 items-center justify-center rounded-xl border border-slate-800/70',
  'bg-slate-950/70 text-sky-300 shadow-[0_0_18px_rgba(56,189,248,0.16)]'
].join(' ')

const headerRowClass = [
  'flex items-center gap-3 border-b border-slate-900/70',
  'pb-4'
].join(' ')

const caretClass = [
  'pointer-events-none absolute right-3 top-1/2 -translate-y-1/2',
  'text-xs text-slate-500'
].join(' ')

const inputClass = [
  'w-full rounded-xl border border-slate-800/70 bg-slate-950/70 px-3 py-2',
  'text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500/60',
  'focus:outline-none focus:ring-2 focus:ring-sky-500/20'
].join(' ')

const selectClass = [
  'w-full appearance-none rounded-xl border border-slate-800/70 bg-slate-950/70',
  'px-3 py-2 text-sm text-slate-100 transition focus:border-sky-500/60',
  'focus:outline-none focus:ring-2 focus:ring-sky-500/20'
].join(' ')

const primaryButtonClass = [
  'inline-flex items-center gap-2 rounded-xl border border-sky-500/30',
  'bg-sky-500/10 px-4 py-2 text-sm font-medium text-sky-200',
  'shadow-[0_0_18px_rgba(56,189,248,0.18)] transition',
  'hover:border-sky-400/60 hover:bg-sky-500/20'
].join(' ')

const dangerButtonClass = [
  'inline-flex items-center gap-2 rounded-xl border border-rose-500/30',
  'bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-200',
  'shadow-[0_0_18px_rgba(244,63,94,0.16)] transition',
  'hover:border-rose-400/60 hover:bg-rose-500/20'
].join(' ')

export function ModelConfigForm({
  initialProvider = 'anthropic',
  initialModelName = '',
  initialApiKey = '',
  initialBaseURL = '',
  onAdd,
  onSave,
  onDelete
}: ModelConfigFormProps) {
  const [provider, setProvider] = useState<ModelProvider>(initialProvider)
  const [modelName, setModelName] = useState(initialModelName)
  const [apiKey, setApiKey] = useState(initialApiKey)
  const [baseURL, setBaseURL] = useState(initialBaseURL)

  const values: ModelConfigFormValues = {
    provider,
    modelName,
    apiKey,
    baseURL
  }

  return (
    <section className={panelClass}>
      <div className={headerRowClass}>
        <div className={headerIconClass}>
          <Bot className='h-5 w-5' />
        </div>
        <div>
          <h2 className='text-base font-semibold tracking-wide text-slate-100'>
            模型配置
          </h2>
          <p className='text-xs text-slate-400'>管理与连接你常用的 LLM 提供商</p>
        </div>
      </div>

      <div className='mt-5 grid gap-4'>
        <label className={fieldLabelClass}>
          <span className={fieldTitleClass}>
            <Bot className='h-4 w-4 text-slate-400' />
            提供商
          </span>
          <div className='relative'>
            <select
              className={selectClass}
              value={provider}
              onChange={(event) =>
                setProvider(event.target.value as ModelProvider)
              }
            >
              <option value='anthropic'>Anthropic</option>
              <option value='openai'>OpenAI</option>
              <option value='google'>Google</option>
              <option value='ollama'>Ollama</option>
              <option value='custom'>Custom</option>
            </select>
            <span className={caretClass}>▾</span>
          </div>
        </label>

        <label className={fieldLabelClass}>
          <span className={fieldTitleClass}>
            <TextCursorInput className='h-4 w-4 text-slate-400' />
            模型名称
          </span>
          <input
            className={inputClass}
            placeholder='claude-3-5-sonnet'
            value={modelName}
            onChange={(event) => setModelName(event.target.value)}
          />
        </label>

        <label className={fieldLabelClass}>
          <span className={fieldTitleClass}>
            <KeyRound className='h-4 w-4 text-slate-400' />
            API Key
          </span>
          <input
            className={inputClass}
            placeholder='sk-...'
            type='password'
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
          />
        </label>

        <label className={fieldLabelClass}>
          <span className={fieldTitleClass}>
            <Globe className='h-4 w-4 text-slate-400' />
            Base URL
          </span>
          <input
            className={inputClass}
            placeholder='https://api.anthropic.com'
            value={baseURL}
            onChange={(event) => setBaseURL(event.target.value)}
          />
          <span className='text-xs text-slate-500'>可选，仅用于自定义端点</span>
        </label>
      </div>

      <div className='mt-6 flex flex-wrap gap-3'>
        <button
          className={primaryButtonClass}
          type='button'
          onClick={() => onAdd?.(values)}
        >
          <Plus className='h-4 w-4' />
          添加模型
        </button>
        <button
          className={primaryButtonClass}
          type='button'
          onClick={() => onSave?.(values)}
        >
          <Save className='h-4 w-4' />
          保存
        </button>
        <button
          className={dangerButtonClass}
          type='button'
          onClick={() => onDelete?.()}
        >
          <Trash2 className='h-4 w-4' />
          删除
        </button>
      </div>
    </section>
  )
}
