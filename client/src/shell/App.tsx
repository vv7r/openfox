import { lazy, Suspense } from 'react'
import { readonlySessionId, usePath } from '../router'
import { useApp } from '../store/app'
import { Login } from './Login'
import { Shell } from './Shell'

const Onboarding = lazy(() => import('./Onboarding'))
const ReadonlySession = lazy(() => import('./ReadonlySession'))

export function App() {
  const path = usePath()
  const auth = useApp((state) => state.auth)
  const locale = useApp((state) => state.locale)
  if (auth === 'checking') return null
  if (auth !== 'ready') return <Login rejected={auth === 'rejected'} />
  const readonly = readonlySessionId(path)
  if (readonly) {
    return (
      <Suspense fallback={null}>
        <ReadonlySession sessionId={readonly} />
      </Suspense>
    )
  }
  if (path === '/onboarding') {
    return (
      <Suspense fallback={null}>
        <Onboarding key={locale} />
      </Suspense>
    )
  }
  return <Shell key={locale} />
}
