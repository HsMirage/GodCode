import { useEffect } from 'react'
import { ModelConfigForm, ModelConfigFormValues } from '../components/ModelConfigForm'
import { useConfigStore } from '../stores/config.store'
import type { Model } from '@renderer/types/domain'

export function SettingsPage() {
  const { models, loadModels } = useConfigStore()

  useEffect(() => {
    async function fetchModels() {
      try {
        const data = await window.codeall.invoke('model:list') as Model[]
        loadModels(data)
      } catch (error) {
        console.error('Failed to load models:', error)
      }
    }
    fetchModels()
  }, [loadModels])

  const handleAdd = async (values: ModelConfigFormValues) => {
    try {
      await window.codeall.invoke('model:create', values)
      const data = await window.codeall.invoke('model:list') as Model[]
      loadModels(data)
    } catch (error) {
      console.error('Failed to create model:', error)
    }
  }

  const handleSave = async (values: ModelConfigFormValues) => {
    try {
      const model = models[0]
      if (model) {
        await window.codeall.invoke('model:update', { id: model.id, data: values })
        const data = await window.codeall.invoke('model:list') as Model[]
        loadModels(data)
      }
    } catch (error) {
      console.error('Failed to update model:', error)
    }
  }

  const handleDelete = async () => {
    try {
      const model = models[0]
      if (model) {
        await window.codeall.invoke('model:delete', model.id)
        const data = await window.codeall.invoke('model:list') as Model[]
        loadModels(data)
      }
    } catch (error) {
      console.error('Failed to delete model:', error)
    }
  }

  return (
    <div className='px-6 py-4'>
      <ModelConfigForm onAdd={handleAdd} onSave={handleSave} onDelete={handleDelete} />
    </div>
  )
}
