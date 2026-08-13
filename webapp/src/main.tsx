import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.js'
import { connectVesselStream } from './store/vesselStore.js'
import './index.css'

const container = document.getElementById('root')
if (!container) throw new Error('missing #root element')

connectVesselStream()

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
)
