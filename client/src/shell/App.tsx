import { useApp } from '../store/app'
import { Login } from './Login'
import { Shell } from './Shell'

export function App() {
  const auth = useApp((state) => state.auth)
  const locale = useApp((state) => state.locale)
  if (auth === 'checking') return null
  if (auth !== 'ready') return <Login rejected={auth === 'rejected'} />
  return <Shell key={locale} />
}
