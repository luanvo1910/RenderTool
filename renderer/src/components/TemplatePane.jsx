import React, { useRef } from 'react';

function TemplatePane({ templates, onSave, onLoad, onDelete }) {
  const templateNameInputRef = useRef(null);

  const handleSave = () => {
    const name = templateNameInputRef.current.value;
    if (name && name.trim() !== "") {
      onSave(name.trim());
      templateNameInputRef.current.value = '';
    } else {
      alert("Vui lòng nhập tên cho mẫu layout.");
    }
  };

  const handleDeleteWithConfirmation = (e, templateId, templateName) => {
    e.stopPropagation();
    if (window.confirm(`Bạn có chắc muốn xóa mẫu "${templateName}"?`)) {
      onDelete(templateId);
    }
  }

  return (
    <div className="template-pane">
      <h3>Mẫu Layout</h3>
      <div className="template-list">
        {templates.map(template => (
          <div key={template.id} className="template-item" onClick={() => onLoad(template.layout)}>
            <span>{template.name}</span>
            <button className="delete-btn" onClick={(e) => handleDeleteWithConfirmation(e, template.id, template.name)}>X</button>
          </div>
        ))}
      </div>
      <div className="save-template-group">
        <input
          type="text"
          id="template-name-input"
          ref={templateNameInputRef}
          style={{
            width: '77%',
            padding: '8px',
            backgroundColor: 'var(--tertiary-bg)',
            border: '1px solid var(--border-color)',
            color: 'var(--primary-text)',
            borderRadius: '4px',
            boxSizing: 'border-box',
          }}
          placeholder="Nhập tên mẫu để lưu..."
        />

        <button id="saveTemplateButton" onClick={handleSave}>Lưu</button>
      </div>
    </div>
  );
}

export default TemplatePane;