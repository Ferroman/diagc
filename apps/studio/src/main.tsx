import { createRoot } from 'react-dom/client';
import { App } from './App';
import '@fontsource/kalam/400.css';
import '@fontsource/kalam/700.css';
import '@fontsource/caveat/500.css';
import '@fontsource/caveat/700.css';
import './app.css';

const el = document.getElementById('root');
if (el) createRoot(el).render(<App />);
