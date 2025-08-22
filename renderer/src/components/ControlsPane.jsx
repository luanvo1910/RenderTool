import React from 'react';

// Thêm isRendering, statusText, và onUpdateCookies vào danh sách props được sử dụng
export default function ControlsPane({ 
  refs, log, results, isRenderFinished, encoder, 
  onEncoderChange, onRunRender, onAddImage, onBrowse, 
  onReset, onOpenLogModal, onUpdateCookies, isRendering, statusText 
}) {
  
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
        <input type="number" id="parts-input" ref={refs.partsInputRef} defaultValue="4" min="1" />
      </div>
      
      <div className="control-group">
        <label htmlFor="encoder-select">Encoder (Bộ mã hóa):</label>
        <select id="encoder-select" value={encoder} onChange={onEncoderChange}>
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
          <button id="browseButton" onClick={onBrowse}>Chọn</button>
        </div>
      </div>
      <div className="control-group">
        <button id="addImageButton" onClick={onAddImage}>Thêm Ảnh / Sticker</button>
        <button id="updateCookiesButton" onClick={onUpdateCookies} style={{marginLeft: '10px'}}>Cập nhật Cookies</button>
      </div>
      <hr />
      <div className="control-group">
        <button id="runButton" onClick={onRunRender} disabled={isRendering}>
          {isRendering ? 'ĐANG XỬ LÝ...' : 'BẮT ĐẦU RENDER VIDEO'}
        </button>
        {/* Thêm dòng này để hiển thị trạng thái tiến trình */}
        {isRendering && <p className="status-text" style={{ textAlign: 'center', marginTop: '10px', color: '#ccc' }}>{statusText}</p>}
      </div>

      <div className="log-container">
        <div className="log-header">
          <h3>Nhật ký xử lý:</h3>
          <button className="view-log-btn" onClick={onOpenLogModal}>Xem chi tiết</button>
        </div>
        {/* Giới hạn log hiển thị để tránh giao diện bị dài */}
        <pre id="log-output" ref={refs.logOutputRef}>{log.split('\n').slice(-5).join('\n')}</pre>
      </div>

      <div id="results-container">
        {results.length > 0 && <h3>Video đã hoàn thành:</h3>}
        <div id="video-list">
          {results.map((path, index) => <video key={index} src={path} controls style={{width: '100%', marginTop: '1rem'}} />)}
        </div>
        {isRenderFinished && <button id="newProjectButton" onClick={onReset}>Bắt đầu Project Mới</button>}
      </div>
    </div>
  );
}
