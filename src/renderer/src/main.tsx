import { createRoot } from 'react-dom/client'
import '@xterm/xterm/css/xterm.css'
import 'dockview-react/dist/styles/dockview.css'
import './styles.css'
import { App } from './App'

// No StrictMode: terminal panes own native processes and must mount exactly once.
createRoot(document.getElementById('root')!).render(<App />)
