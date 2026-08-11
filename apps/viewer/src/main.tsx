import { createRoot } from 'react-dom/client';
import { Viewer, type ViewerData } from './Viewer';
import '@fontsource/kalam/400.css';
import '@fontsource/kalam/700.css';
import '@fontsource/caveat/500.css';
import '@fontsource/caveat/700.css';

function readData(): ViewerData | null {
  const el = document.getElementById('dg-data');
  if (el?.textContent == null) return null;
  try {
    const parsed = JSON.parse(el.textContent) as unknown;
    return parsed !== null && typeof parsed === 'object' ? (parsed as ViewerData) : null;
  } catch {
    return null;
  }
}

// The publisher navigates to `<page>.html?export=1` for the screenshot, which
// unfolds every group; a human opening the page plainly gets the folded view.
const expandAll = new URLSearchParams(location.search).has('export');

const el = document.getElementById('root');
if (el) createRoot(el).render(<Viewer data={readData()} expandAll={expandAll} />);

// The export handshake (__DG_READY__ / __DG_BOUNDS__ / __DG_FIT__) is published
// by the Viewer once React Flow has laid the graph out — it owns the layout API
// that yields the true content bounds and the re-fit hook.
