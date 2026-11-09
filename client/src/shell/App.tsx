import { lazy, Suspense } from 'react'
import { usePath } from '../router'
import { useApp } from '../store/app'
import { Login } from './Login'
import { Shell } from './Shell'

const Onboarding = lazy(() => import('./Onboarding'))

export function App() {
  const path = usePath()
  const auth = useApp((state) => state.auth)
  const locale = useApp((state) => state.locale)
  if (auth === 'checking') return null
  if (auth !== 'ready') return <Login rejected={auth === 'rejected'} />
  if (path === '/onboarding') {
    return (
      <Suspense fallback={null}>
        <Onboarding key={locale} />
      </Suspense>
    )
  }
  return <Shell key={locale} />
}
