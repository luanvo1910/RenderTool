import React from 'react';

function TextPropertiesPanel({ textStyle, systemFonts, onStyleChange }) {
  return (
    <div id="element-properties">
      <h4>Thuộc tính Chữ</h4>

      <div className="prop-group">
        <label>Font chữ:</label>
        <select
          value={textStyle.fontFamily}
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
          value={textStyle.fontSize}
          onChange={(e) => onStyleChange('fontSize', parseInt(e.target.value, 10) || 0)}
        />
      </div>

      <div className="prop-group">
        <label>Màu chữ:</label>
        <input type="color" value={textStyle.fontColor} onChange={(e) => onStyleChange('fontColor', e.target.value)} />
      </div>

      <div className="prop-group">
        <label>Kiểu chữ:</label>
        <div className="input-group">
          <button
            className={`style-toggle ${textStyle.isBold ? 'active' : ''}`}
            onClick={() => onStyleChange('isBold', !textStyle.isBold)}>
            <b>B</b>
          </button>
          <button
            className={`style-toggle ${textStyle.isItalic ? 'active' : ''}`}
            onClick={() => onStyleChange('isItalic', !textStyle.isItalic)}>
            <i>I</i>
          </button>
        </div>
      </div>
      <label className="prop-label">Viền (Outline)</label>
      <div className="prop-group">
        <label>Màu viền:</label>
        <input type="color" value={textStyle.outlineColor} onChange={(e) => onStyleChange('outlineColor', e.target.value)} />
        <label>Độ dày: {textStyle.outlineWidth}</label>
        <input type="range" min="0" max="20" value={textStyle.outlineWidth} onChange={(e) => onStyleChange('outlineWidth', parseInt(e.target.value, 10))} />
      </div>
      <label className="prop-label">Bóng (Shadow)</label>
      <div className="prop-group">
        <label>Màu bóng:</label>
        <input type="color" value={textStyle.shadowColor} onChange={(e) => onStyleChange('shadowColor', e.target.value)} />
        <label>Độ sâu: {textStyle.shadowDepth}</label>
        <input type="range" min="0" max="10" value={textStyle.shadowDepth} onChange={(e) => onStyleChange('shadowDepth', parseInt(e.target.value, 10))} />
      </div>
    </div>
  );
}

export default TextPropertiesPanel;