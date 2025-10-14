import React from 'react';

function TextPropertiesPanel({ element, systemFonts, onStyleChange }) {
  // Guard clause để đảm bảo an toàn
  if (!element || !element.style) {
    return null;
  }

  const { style, content } = element;

  return (
    <div id="element-properties">
      <h4>Thuộc tính Chữ</h4>

      {/* Chỉ cho phép sửa nội dung của text tự thêm */}
      {element.id !== 'text-placeholder' && (
         <div className="prop-group">
            <label>Nội dung:</label>
            <textarea
              value={content}
              onChange={(e) => onStyleChange('content', e.target.value)}
              rows="3"
            />
          </div>
      )}
     
      <div className="prop-group">
        <label>Font chữ:</label>
        <select
          value={style.fontFamily}
          onChange={(e) => onStyleChange('fontFamily', e.target.value)}
          className="font-select"
        >
          {systemFonts.map(font => (
            <option key={font} value={font}>{font}</option>
          ))}
        </select>
      </div>

      <div className="prop-group">
        <label>Kích thước:</label>
        <input
          type="number"
          value={style.fontSize}
          onChange={(e) => onStyleChange('fontSize', parseInt(e.target.value, 10) || 0)}
        />
      </div>

      <div className="prop-group">
        <label>Màu chữ:</label>
        <input type="color" value={style.fontColor} onChange={(e) => onStyleChange('fontColor', e.target.value)} />
      </div>

      <div className="prop-group">
        <label>Kiểu chữ:</label>
        <div className="input-group">
          <button
            className={`style-toggle ${style.isBold ? 'active' : ''}`}
            onClick={() => onStyleChange('isBold', !style.isBold)}>
            <b>B</b>
          </button>
          <button
            className={`style-toggle ${style.isItalic ? 'active' : ''}`}
            onClick={() => onStyleChange('isItalic', !style.isItalic)}>
            <i>I</i>
          </button>
        </div>
      </div>
      <label className="prop-label">Viền (Outline)</label>
      <div className="prop-group">
        <label>Màu viền:</label>
        <input type="color" value={style.outlineColor} onChange={(e) => onStyleChange('outlineColor', e.target.value)} />
        <label>Độ dày: {style.outlineWidth}</label>
        <input type="range" min="0" max="20" value={style.outlineWidth} onChange={(e) => onStyleChange('outlineWidth', parseInt(e.target.value, 10))} />
      </div>
      <label className="prop-label">Bóng (Shadow)</label>
      <div className="prop-group">
        <label>Màu bóng:</label>
        <input type="color" value={style.shadowColor} onChange={(e) => onStyleChange('shadowColor', e.target.value)} />
        <label>Độ sâu: {style.shadowDepth}</label>
        <input type="range" min="0" max="10" value={style.shadowDepth} onChange={(e) => onStyleChange('shadowDepth', parseInt(e.target.value, 10))} />
      </div>
    </div>
  );
}

export default TextPropertiesPanel;