import React from 'react';

function ControlsPane(props) {
  const { 
    refs,
    log, results, isRendering, isRenderFinished,
    statusText, progress,
    encoder, onEncoderChange,
    onRunRender, onAddImage, onAddText, onBrowse, onReset,
    onOpenLogModal, onUpdateCookies, onUpdateDependencies
  } = props;
  
  return (
    <div className="controls-pane">
      <h2>Bảng điều khiển</h2>
      <div className="control-group">
        <label htmlFor="youtube-url">Link YouTube:</label>
        <input type="text" id="youtube-url" ref={refs.urlInputRef} placeholder="Dán link video vào đây..." />
      </div>
      <div className="control-group">
        <label htmlFor="part-duration">Thời lượng mỗi phần (giây):</label>
        <input type="number" id="part-duration" ref={refs.durationInputRef} defaultValue="120" min="1" />
      </div>
      <div className="control-group">
        <label htmlFor="parts-input">Số phần tối đa:</label>
        <input type="number" id="parts-input" ref={refs.partsInputRef} defaultValue="2" min="1" />
      </div>

      <div className="control-group">
        <label>Chức năng khác:</label>
        <div className="button-group">
            <button id="addTextButton" onClick={onAddText} disabled={isRendering}>Thêm Văn bản</button>
            <button id="addImageButton" onClick={onAddImage} disabled={isRendering}>Thêm Ảnh</button>
        </div>
      </div>
      
      <div className="control-group">
        <label htmlFor="encoder-select">Encoder (Bộ mã hóa):</label>
        <select id="encoder-select" value={encoder} onChange={onEncoderChange} disabled={isRendering}>
          <option value="libx264">Phần mềm (x264 - Tương thích nhất)</option>
          <option value="hevc_nvenc">Phần cứng (NVIDIA HEVC)</option>
          <option value="h264_nvenc">Phần cứng (NVIDIA H264)</option>
          <option value="hevc_amf">Phần cứng (AMD HEVC)</option>
          <option value="h264_amf">Phần cứng (AMD H264)</option>
          <option value="hevc_qsv">Phần cứng (Intel HEVC)</option>
          <option value="h264_qsv">Phần cứng (Intel H264)</option>
        </select>
      </div>

      <div className="control-group">
        <label htmlFor="save-path-input">Lưu vào thư mục:</label>
        <div className="input-group">
          <input type="text" id="save-path-input" ref={refs.savePathInputRef} placeholder="Mặc định là thư mục 'output'" readOnly />
          <button id="browseButton" onClick={onBrowse} disabled={isRendering}>Chọn</button>
        </div>
      </div>
      
      <div className="control-group">
        <label>Bảo trì & Cài đặt:</label>
        <div className="button-group">
            <button id="updateCookiesButton" onClick={onUpdateCookies} disabled={isRendering}>Cập nhật Cookies</button>
            <button id="updateDepsButton" onClick={onUpdateDependencies} disabled={isRendering}>Cập nhật Thư viện</button>
        </div>
      </div>

      <hr />

      <div className="status-container">
        <p className="status-text">{statusText}</p>
        <div className="progress-bar-container">
            <div className="progress-bar" style={{ width: `${progress}%` }}></div>
        </div>
      </div>

      <div className="control-group action-buttons">
        <button id="runButton" onClick={onRunRender} disabled={isRendering}>
          {isRendering ? 'ĐANG RENDER...' : 'BẮT ĐẦU RENDER'}
        </button>
      </div>

      <div className="log-container">
        <div className="log-header">
          <h3>Nhật ký xử lý:</h3>
          <button className="view-log-btn" onClick={onOpenLogModal}>Xem chi tiết</button>
        </div>
        <pre id="log-output" ref={refs.logOutputRef}>{log}</pre>
      </div>
    </div>
  );
}

export default ControlsPane;