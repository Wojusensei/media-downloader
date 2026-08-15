import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './styles/base.css'
import './styles/components.css'
import App from './App.tsx'
import { ThemeProvider } from './theme.tsx'
import { I18nProvider } from './i18n.tsx'
import { ToastProvider } from './toast.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <ThemeProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </ThemeProvider>
    </I18nProvider>
  </StrictMode>,
)
