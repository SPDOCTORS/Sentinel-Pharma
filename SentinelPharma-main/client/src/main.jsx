import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || 'Unknown UI error' }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
          <h1 style={{ marginBottom: 8, fontSize: 22 }}>UI failed to load</h1>
          <p style={{ marginBottom: 12, color: '#374151' }}>A runtime error occurred while rendering SentinelPharma.</p>
          <pre style={{ whiteSpace: 'pre-wrap', background: '#f3f4f6', padding: 12, borderRadius: 8, color: '#111827' }}>
            {this.state.message}
          </pre>
        </div>
      )
    }

    return this.props.children
  }
}

const rootEl = document.getElementById('root')
const root = ReactDOM.createRoot(rootEl)

const renderApp = () => {
  root.render(
    <React.StrictMode>
      <RootErrorBoundary>
        <App />
      </RootErrorBoundary>
    </React.StrictMode>
  )
}

window.addEventListener('error', (event) => {
  if (!rootEl) return
  rootEl.innerHTML = `<div style="padding:24px;font-family:system-ui,sans-serif"><h1 style="margin-bottom:8px;font-size:22px">UI failed to load</h1><p style="margin-bottom:12px;color:#374151">An uncaught error occurred.</p><pre style="white-space:pre-wrap;background:#f3f4f6;padding:12px;border-radius:8px;color:#111827">${String(event.error?.message || event.message || 'Unknown error')}</pre></div>`
})

window.addEventListener('unhandledrejection', (event) => {
  if (!rootEl) return
  rootEl.innerHTML = `<div style="padding:24px;font-family:system-ui,sans-serif"><h1 style="margin-bottom:8px;font-size:22px">UI failed to load</h1><p style="margin-bottom:12px;color:#374151">An unhandled promise rejection occurred.</p><pre style="white-space:pre-wrap;background:#f3f4f6;padding:12px;border-radius:8px;color:#111827">${String(event.reason?.message || event.reason || 'Unknown rejection')}</pre></div>`
})

renderApp()
