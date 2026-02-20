/**
 * ConfirmDialog - Simple confirmation modal
 */
function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <div className="note-editor-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-dialog-message">{message}</div>
        <div className="confirm-dialog-buttons">
          <button className="note-cancel-btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="note-delete-btn" onClick={onConfirm}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
