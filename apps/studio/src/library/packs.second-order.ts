import type { Library, LibraryEntry } from './types';

const entry = (id: string, name: string, keywords: string[]): LibraryEntry => ({
  id,
  category: 'second-order',
  name,
  keywords,
  template: { type: id },
});

export const SECOND_ORDER_PACK: Library = {
  categories: [{ id: 'second-order', name: 'Second-order thinking', builtin: true }],
  entries: [
    entry('so-decision', 'Decision', ['decision', 'choice', 'option', 'second order']),
    entry('so-consequence-positive', 'Good consequence', ['consequence', 'effect', 'good', 'positive', 'upside']),
    entry('so-consequence-negative', 'Bad consequence', ['consequence', 'effect', 'bad', 'negative', 'downside', 'risk']),
    entry('so-consequence-neutral', 'Neutral consequence', ['consequence', 'effect', 'neutral', 'and then what']),
  ],
};
