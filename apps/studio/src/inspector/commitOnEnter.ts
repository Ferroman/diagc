import type { KeyboardEvent } from 'react';

/** An inspector field's key handler: Enter commits the draft, as leaving the
 * field does, and goes no further. */
export const commitOnEnter = (e: KeyboardEvent, run: () => void) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    run();
  }
};
