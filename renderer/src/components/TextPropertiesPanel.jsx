// --- Tệp: TextPropertiesPanel.jsx ---

import React from 'react';

function TextPropertiesPanel({ element, systemFonts, onStyleChange }) {
  if (!element || !element.style) {
    return null;
  }

  const { style, content } = element;

  // Lấy giá trị mặc định nếu chưa có
  // <<< SỬA ĐỔI: Đảm bảo fontFamily có giá trị mặc định là file >>>
  const fontFamily = style.fontFamily || (systemFonts[0]?.file || 'arial.ttf');
  const reactFontSize = style.reactFontSize || 70;
  const fontRenderScale = style.fontRenderScale || 1.0;
  const fontColor = style.fontColor || '#FFFFFF';
  const outlineColor = style.outlineColor || '#000000';
  const outlineWidth = style.outlineWidth || 2;
  const shadowColor = style.shadowColor || '#000000';
  const shadowDepth = style.shadowDepth || 2;
  const boxColor = style.boxColor || '#000000';
  const boxOpacity = style.boxOpacity || 0.5;
  const boxPadding = style.boxPadding || 10; // FFMPEG gọi đây là boxborderw

  return (
    <div id="element-properties">
      <h4>Thuộc tính Chữ</h4>

      {/* SỬA LỖI CSS: Đổi tên class thành "text-prop-group" */}
      {element.id !== 'text-placeholder' && (
         <div className="text-prop-group">
            <label>Nội dung:</label>
            <textarea
              value={content}
              onChange={(e) => onStyleChange('content', e.target.value)}
              rows="3"
            />
          </div>
      )}
     
     {/* ======================================================= */}
     {/* <<< SỬA ĐỔI DROPDOWN FONT TẠI ĐÂY >>> */}
     {/* ======================================================= */}
      <div className="text-prop-group">
        <label>Font chữ:</label>
        <select
          value={fontFamily} // Giá trị là 'arial.ttf', 'impact.ttf', v.v.
          onChange={(e) => onStyleChange('fontFamily', e.target.value)}
        >
          {systemFonts.map(font => (
            // Giá trị (value) là font.file, nhưng hiển thị cho người dùng là font.name
            <option key={font.file} value={font.file}>
              {font.name}
            </option>
          ))}
        </select>
      </div>

      <div className="text-prop-group">
        <label>Kích thước (Preview):</label>
        <input
          type="number"
          value={reactFontSize}
          onChange={(e) => onStyleChange('reactFontSize', parseInt(e.target.value, 10) || 0)}
        />
      </div>
      <div className="text-prop-group">
        <label>Tỷ lệ Render (Tinh chỉnh):</label>
        <input
          type="number"
          min="0.1"
          max="3.0"
          step="0.05"
          value={fontRenderScale}
          onChange={(e) => onStyleChange('fontRenderScale', parseFloat(e.target.value) || 1.0)}
        />
      </div>

      <div className="text-prop-group">
        <label>Màu chữ:</label>
        <input type="color" value={fontColor} onChange={(e) => onStyleChange('fontColor', e.target.value)} />
      </div>

      <div className="text-prop-group">
        <label>Kiểu chữ:</label>
        <div className="text-input-group"> {/* Đổi tên class */}
          <button
            className={`text-style-toggle ${style.isBold ? 'active' : ''}`} // Đổi tên class
            onClick={() => onStyleChange('isBold', !style.isBold)}>
            <b>B</b>
          </button>
          <button
            className={`text-style-toggle ${style.isItalic ? 'active' : ''}`} // Đổi tên class
            onClick={() => onStyleChange('isItalic', !style.isItalic)}>
            <i>I</i>
          </button>
        </div>
      </div>
      <label className="text-prop-label">Viền (Outline)</label> {/* Đổi tên class */}
      <div className="text-prop-group">
        <label>Màu viền:</label>
        <input type="color" value={outlineColor} onChange={(e) => onStyleChange('outlineColor', e.target.value)} />
        <label>Độ dày: {outlineWidth}</label>
        <input type="range" min="0" max="20" value={outlineWidth} onChange={(e) => onStyleChange('outlineWidth', parseInt(e.target.value, 10))} />
      </div>
      <label className="text-prop-label">Bóng (Shadow)</label> {/* Đổi tên class */}
      <div className="text-prop-group">
        <label>Màu bóng:</label>
        <input type="color" value={shadowColor} onChange={(e) => onStyleChange('shadowColor', e.target.value)} />
        <label>Độ sâu: {shadowDepth}</label>
        <input type="range" min="0" max="10" value={shadowDepth} onChange={(e) => onStyleChange('shadowDepth', parseInt(e.target.value, 10))} />
      </div>

      {/* SỬA LỖI HIỂU LẦM: Đổi tên các nhãn */}
      <label className="text-prop-label">Viền/Nền (Box)</label>
      <div className="text-prop-group">
        <label>Màu Viền/Nền:</label>
        <input type="color" value={boxColor} onChange={(e) => onStyleChange('boxColor', e.target.value)} />
        <label>Độ mờ Viền/Nền: {boxOpacity}</label>
        <input type="range" min="0" max="1" step="0.1" value={boxOpacity} onChange={(e) => onStyleChange('boxOpacity', parseFloat(e.target.value))} />
      </div>

      <div className="text-prop-group">
        <label>Kích thước Viền/Nền:</label>
        <input
          type="number"
          min="0"
          max="100"
          value={boxPadding}
          onChange={(e) => onStyleChange('boxPadding', parseInt(e.target.value, 10) || 0)}
        />
      </div>

    </div>
  );
}

export default TextPropertiesPanel;