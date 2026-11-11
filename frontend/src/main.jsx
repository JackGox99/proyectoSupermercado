import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap-icons/font/bootstrap-icons.min.css'
import './index.css'
import App from './App.jsx'
import { applyTheme, initialTheme } from './lib/theme'

// Aplicar el tema antes del primer render evita un parpadeo claro/oscuro.
applyTheme(initialTheme())

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
