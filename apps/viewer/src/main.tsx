/*
 * diagc viewer — the single-file shell that published diagram pages are built on.
 * Copyright (C) 2026 Bogdan Frankovskyi
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License version 3 as
 * published by the Free Software Foundation, with the additional permissions
 * granted under section 7 that are set out in the LICENSE file at the root of
 * this repository.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License
 * for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
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
