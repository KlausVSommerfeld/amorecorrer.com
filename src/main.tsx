import { createRoot } from 'react-dom/client'

// Fontes auto-hospedadas (sem CDN externo no caminho crítico).
// Archivo: display/UI. IBM Plex Mono: códigos e dados. Source Serif 4: só dentro do documento.
import '@fontsource-variable/archivo/wght.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/source-serif-4/400.css'
import '@fontsource/source-serif-4/600.css'

import App from './App.tsx'
import './index.css'

createRoot(document.getElementById("root")!).render(<App />);
