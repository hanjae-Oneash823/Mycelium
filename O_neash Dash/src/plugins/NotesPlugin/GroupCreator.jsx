import { useState } from 'react';

const BLUE_SHADES = [
  '#4A90E2', // Bright blue
  '#5B9BD5', // Light blue
  '#2E5C8A', // Deep blue
  '#7BA3CC', // Sky blue
  '#3A7CA5', // Ocean blue
  '#1E3A5F', // Navy blue
];

/**
 * GroupCreator - Modal for creating new note groups
 */
function GroupCreator({ onSave, onClose }) {
  const [name, setName] = useState('');
  const [selectedColor, setSelectedColor] = useState(BLUE_SHADES[0]);

  const handleSave = () => {
    if (!name.trim()) {
      alert('Group must have a name');
      return;
    }
    onSave({ name: name.trim(), color: selectedColor });
  };

  return (
    <div className="note-editor-overlay" onClick={onClose}>
      <div className="group-creator" onClick={(e) => e.stopPropagation()}>
        <div className="group-creator-header">
          <h3>New Note Group</h3>
          <button className="note-close-btn" onClick={onClose}>×</button>
        </div>

        <div className="group-creator-body">
          <div className="group-creator-field">
            <label className="group-creator-label">Group Name</label>
            <input
              type="text"
              className="group-name-input"
              placeholder="Enter group name..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="group-creator-field">
            <label className="group-creator-label">Color</label>
            <div className="color-grid">
              {BLUE_SHADES.map(color => (
                <button
                  key={color}
                  className={`color-option ${selectedColor === color ? 'selected' : ''}`}
                  style={{ backgroundColor: color }}
                  onClick={() => setSelectedColor(color)}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="group-creator-footer">
          <button className="note-cancel-btn" onClick={onClose}>
            Cancel
          </button>
          <button className="note-save-btn" onClick={handleSave}>
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

export default GroupCreator;
