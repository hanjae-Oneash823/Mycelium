import { useState } from 'react';

/**
 * GroupGrid - Grid of note group circles
 */
function GroupGrid({ groups, onGroupSelect, onCreateGroup, onDeleteGroup }) {
  return (
    <div className="group-grid-container">
      <div className="group-grid">
        {/* Add new group button */}
        <div className="group-grid-item">
          <button className="group-circle group-circle-add" onClick={onCreateGroup}>
            <span className="group-add-icon">+</span>
          </button>
        </div>

        {/* Existing groups */}
        {groups.map(group => (
          <div key={group.id} className="group-grid-item">
            <button 
              className="group-circle"
              style={{ backgroundColor: group.color }}
              onClick={() => onGroupSelect(group)}
            >
            </button>
            {!['quick-notes', 'shopping-list', 'ideas'].includes(group.id) && (
              <button 
                className="group-delete-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onDeleteGroup(group.id);
                }}
                title="Delete group"
              >
                ×
              </button>
            )}
            <div className="group-name">{group.name}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default GroupGrid;
