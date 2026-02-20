import { useState, useEffect } from 'react';

/**
 * NoteEditor - Inline editor for creating/editing notes
 */
function NoteEditor({ note, onSave, onDelete, onClose }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  useEffect(() => {
    if (note) {
      setTitle(note.title || '');
      setContent(note.content || '');
    } else {
      setTitle('');
      setContent('');
    }
  }, [note]);

  const handleSave = () => {
    onSave({ title, content });
  };

  const handleDelete = () => {
    if (note) {
      onDelete(note.id);
    }
  };

  return (
    <div className="note-editor-inline">
      <div className="note-editor-header">
        <input
          type="text"
          className="note-title-input"
          placeholder="note title..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />
      </div>

      <div className="note-editor-body">
        <textarea
          className="note-content-input"
          placeholder="write your note here... use #tags to categorize"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
      </div>

      <div className="note-editor-footer">
        <div className="note-editor-actions-left">
          {note && (
            <button className="note-delete-btn" onClick={handleDelete}>
              delete
            </button>
          )}
        </div>
        <div className="note-editor-actions-right">
          <button className="note-cancel-btn" onClick={onClose}>
            close
          </button>
          <button className="note-save-btn" onClick={handleSave}>
            save
          </button>
        </div>
      </div>
    </div>
  );
}

export default NoteEditor;
