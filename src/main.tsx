import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { RegionalVariantProvider } from './context/RegionalVariantContext.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RegionalVariantProvider>
      <App />
    </RegionalVariantProvider>
  </StrictMode>,
);
