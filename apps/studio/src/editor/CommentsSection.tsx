import { useEffect, useState } from 'react';
import { nextCommentId, type Comment, type EditorCommand, type ElementTarget } from '@diagc/core';

interface CommentsSectionProps {
  target: ElementTarget;
  comments: readonly Comment[];
  onCommand: (command: EditorCommand) => void;
}

function CommentRow({ target, comment, onCommand }: { target: ElementTarget; comment: Comment; onCommand: (c: EditorCommand) => void }) {
  const patch = (p: { text?: string; by?: string | null; at?: string | null }) =>
    onCommand({ type: 'update-comment', target, id: comment.id, patch: p });
  // Controlled with resync, as ThreatRow: local state carries the keystrokes,
  // an effect follows a change made underneath the panel (Undo), and every
  // commit diffs first so nothing lands an undo step for no change.
  const [text, setText] = useState(comment.text);
  useEffect(() => setText(comment.text), [comment.text]);
  const [by, setBy] = useState(comment.by ?? '');
  useEffect(() => setBy(comment.by ?? ''), [comment.by]);

  const commitText = () => {
    const trimmed = text.trim();
    // a comment without text is not a comment (validation rejects it): snap back
    if (trimmed === '') {
      setText(comment.text);
      return;
    }
    if (trimmed !== comment.text) patch({ text: trimmed });
  };
  const commitBy = () => {
    const trimmed = by.trim();
    if (trimmed === (comment.by ?? '')) return;
    patch({ by: trimmed === '' ? null : trimmed });
  };

  return (
    <div className="comment">
      <textarea
        aria-label={`Comment ${comment.id} text`}
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commitText}
      />
      <div className="comment-row">
        <input
          aria-label={`Comment ${comment.id} author`}
          placeholder="Author"
          value={by}
          onChange={(e) => setBy(e.target.value)}
          onBlur={commitBy}
        />
        {/* a date input only ever yields '' or a valid YYYY-MM-DD, so it commits on change */}
        <input
          type="date"
          aria-label={`Comment ${comment.id} date`}
          value={comment.at ?? ''}
          onChange={(e) => patch({ at: e.target.value === '' ? null : e.target.value })}
        />
        <button
          type="button"
          className="chip icon-btn"
          aria-label={`Remove comment ${comment.id}`}
          title="Remove comment"
          onClick={() => onCommand({ type: 'remove-comment', target, id: comment.id })}
        >
          Remove
        </button>
      </div>
    </div>
  );
}

/** The comments of one element, in the panel that already edits it — offered on
 * every node and relation: a remark is not any notation's. */
export function CommentsSection({ target, comments, onCommand }: CommentsSectionProps) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const text = draft.trim();
    if (text === '') return;
    onCommand({ type: 'add-comment', target, comment: { id: nextCommentId(comments), text } });
    setDraft('');
  };
  return (
    <section className="panel-section comments" aria-label="Comments">
      <h3>
        Comments <span className="so-hint">{comments.length}</span>
      </h3>
      {comments.map((c) => (
        <CommentRow key={c.id} target={target} comment={c} onCommand={onCommand} />
      ))}
      <div className="comment-add">
        <textarea aria-label="New comment" placeholder="Comment" rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button type="button" className="chip" aria-label="Add comment" onClick={add} disabled={draft.trim() === ''}>
          Add
        </button>
      </div>
    </section>
  );
}
