import { createRoot } from 'react-dom/client'
import { boot } from './controller'
import { App } from './shell/App'
import './styles/tokens.css'

void boot()
createRoot(document.getElementById('root')!).render(<App />)
