import '@fontsource/anton/latin-400.css'
import '@fontsource/nunito-sans/latin-600.css'
import '@fontsource/nunito-sans/latin-700.css'
import '@fontsource/nunito-sans/latin-800.css'
import './stili/tokens.css'
import './stili/base.css'
import './stili/ui.css'
import './stili/pagine.css'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import { applicaTemaSalvato } from './lib/tema.ts'

applicaTemaSalvato()
createRoot(document.getElementById('root')!).render(<App />)
