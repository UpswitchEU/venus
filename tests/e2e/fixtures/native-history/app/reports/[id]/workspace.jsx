'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useFormSessionSync } from '@venus/hooks/useFormSessionSync'
import { useManualNavigationGuard } from '@venus/features/manual/hooks/useManualNavigationGuard'
import { useManualFormStore, useSessionStore, loadReport } from '../../../fixture'
export default function Workspace({ id }) {
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    let active = true
    loadReport(id).then(() => {
      if (active) setLoaded(true)
    })
    return () => {
      active = false
    }
  }, [id])
  return loaded ? <Editor id={id} /> : <p>Loading report {id}</p>
}
function Editor({ id }) {
  const router = useRouter()
  const formData = useManualFormStore((s) => s.formData)
  const state = useSessionStore()
  const flush = useFormSessionSync({ reportId: id, formData })
  const navigate = useManualNavigationGuard({ flushForm: flush, isBusy: () => false })
  return (
    <main>
      <h1>Report {id.toUpperCase()}</h1>
      <label>
        Company
        <input
          aria-label="Company"
          value={formData.company_name}
          onChange={(e) =>
            useManualFormStore.setState({ formData: { ...formData, company_name: e.target.value } })
          }
        />
      </label>
      <p data-testid="save-state">
        {state.isSaving
          ? 'Saving'
          : state.saveErrorMessage || (state.hasUnsavedChanges ? 'Unsaved' : 'Saved')}
      </p>
      <button onClick={() => navigate(() => router.push(id === 'a' ? '/reports/b' : '/reports/a'))}>
        Open report {id === 'a' ? 'B' : 'A'}
      </button>
      <button
        onClick={() =>
          fetch('/api/reports', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ failure: true }),
          })
        }
      >
        Fail saves
      </button>
      <button
        onClick={() =>
          fetch('/api/reports', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ failure: false }),
          })
        }
      >
        Recover saves
      </button>
    </main>
  )
}
