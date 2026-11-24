/** The note node id prefix. An id-based test for the filters that only need to
 * *exclude* notes from an id list; anything that READS the note data channel
 * gates on `node.type === 'note'` instead, because a model node is free to
 * carry an id that starts with `note:` and it would arrive here with box data. */
export const NOTE_PREFIX = 'note:';
export const isNoteId = (id: string): boolean => id.startsWith(NOTE_PREFIX);
