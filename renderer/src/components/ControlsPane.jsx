import React from 'react';
import QueueManager from './QueueManager';

function ControlsPane(props) {
  const { 
    refs,
    log, isRendering,
    statusText, progress,
    encoder, onEncoderChange,
    onRunRender, onAddImage, onAddText, onBrowse, onReset,
    onOpenLogModal,
    splitMode, onSplitModeChange,
    // <<< NHẬN PROPS MỚI CHO UPDATE >>>
    updateStatus,
    isUpdateAvailable,
    isDownloadingUpdate,
    isUpdateDownloaded,
    onDownloadUpdate,
    onInstallUpdate,
    // <<< NHẬN PROPS CHO QUẢN LÝ HÀNG CHỜ >>> 
    urlQueue,
    onQueueChange,
    isPaused,
    onPauseToggle,
    // <<< NHẬN PROPS CHO BẬT/TẮT CHỮ "Part..." >>> 
    showPartText,
    onTogglePartText,
    // <<< NHẬN PROPS CHO IMPORT COOKIES >>> 
    onImportCookiesFromEdge
  } = props;
  
  return (
    <div className="controls-pane">
      <h2>Bảng điều khiển</h2>
      
      <QueueManager
        queue={urlQueue || []}
        onQueueChange={onQueueChange || (() => {})}
        isRendering={isRendering}
        isPaused={isPaused}
        disabled={isDownloadingUpdate || isUpdateAvailable}
      />
      
      <div className="control-group">
        <label htmlFor="split-mode">Phương thức chia video:</label>
        <select id="split-mode" value={splitMode} onChange={onSplitModeChange} disabled={isRendering || isDownloadingUpdate}>
          <option value="duration">Theo Thời lượng (giây)</option>
          <option value="equal">Chia đều (theo Số phần)</option>
        </select>
      </div>

      {splitMode === 'duration' && (
        <div className="control-group">
          <label htmlFor="part-duration">Thời lượng mỗi phần (giây):</label>
          <input type="number" id="part-duration" ref={refs.durationInputRef} defaultValue="120" min="1" disabled={isRendering || isDownloadingUpdate} />
        </div>
      )}

      <div className="control-group">
        <label htmlFor="parts-input">
          {splitMode === 'duration' ? 'Số phần TỐI ĐA:' : 'Chia thành (Số phần):'}
        </label>
        <input type="number" id="parts-input" ref={refs.partsInputRef} defaultValue="10" min="1" disabled={isRendering || isDownloadingUpdate} />
      </div>

      <div className="control-group">
        <label>Chức năng khác:</label>
        <div className="button-group">
            <button id="addTextButton" onClick={onAddText} disabled={isRendering || isDownloadingUpdate}>Thêm Văn bản</button>
            <button id="addImageButton" onClick={onAddImage} disabled={isRendering || isDownloadingUpdate}>Thêm Ảnh</button>
        </div>
      </div>

      <div className="control-group">
        <label>Quản lý Cookies:</label>
        <div className="button-group">
            <button onClick={onImportCookiesFromEdge} disabled={isRendering || isDownloadingUpdate} style={{backgroundColor: '#007bff', color: '#fff'}}>
              Import Cookies từ Edge
            </button>
        </div>
        <p style={{fontSize: '12px', color: '#666', marginTop: '5px'}}>
          Tự động đọc cookies từ Microsoft Edge và lưu vào cookies.txt
        </p>
      </div>

      <div className="control-group">
        <label className="checkbox-label">
          <input 
            type="checkbox" 
            checked={showPartText} 
            onChange={(e) => onTogglePartText && onTogglePartText(e.target.checked)}
            disabled={isRendering || isDownloadingUpdate}
          />
          <span>Hiển thị chữ "Part..." trong canvas</span>
        </label>
      </div>
      
      <div className="control-group">
        <label htmlFor="encoder-select">Encoder (Bộ mã hóa):</label>
        <select id="encoder-select" value={encoder} onChange={onEncoderChange} disabled={isRendering || isDownloadingUpdate}>
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
          <button id="browseButton" onClick={onBrowse} disabled={isRendering || isDownloadingUpdate}>Chọn</button>
        </div>
      </div>
      
      <hr />

      <div className="status-container">
        {/* <<< SỬA ĐỔI: Ưu tiên hiển thị thông báo update/render >>> */}
        <p className="status-text">{updateStatus || (isRendering ? statusText : 'Sẵn sàng')}</p>
        <div className="progress-bar-container">
            <div className="progress-bar" style={{ width: `${progress}%` }}></div>
        </div>
      </div>

      {/* --- NÚT UPDATE (HIỂN THỊ CÓ ĐIỀU KIỆN) --- */}

      {/* Hiển thị khi có update và CHƯA tải */}
      {isUpdateAvailable && !isDownloadingUpdate && !isUpdateDownloaded && (
        <div className="control-group action-buttons">
          <button onClick={onDownloadUpdate} style={{backgroundColor: '#28a745'}}>
            TẢI VỀ BẢN CẬP NHẬT
          </button>
        </div>
      )}

      {/* Hiển thị khi ĐÃ tải xong */}
      {isUpdateDownloaded && (
        <div className="control-group action-buttons">
          <button onClick={onInstallUpdate} style={{backgroundColor: '#ffc107', color: '#111'}}>
            KHỞI ĐỘNG LẠI ĐỂ CÀI ĐẶT
          </button>
        </div>
      )}

      {/* --- NÚT RENDER CHÍNH --- */}
      <div className="control-group action-buttons">
        <button id="runButton" onClick={onRunRender} disabled={isDownloadingUpdate || isUpdateAvailable}>
          {isRendering && !isPaused ? 'ĐANG RENDER HÀNG ĐỢI...' : isPaused ? 'TIẾP TỤC RENDER' : 'BẮT ĐẦU RENDER'}
        </button>
        {isRendering && (
          <button onClick={onPauseToggle} disabled={isDownloadingUpdate || isUpdateAvailable} style={{backgroundColor: isPaused ? '#28a745' : '#ffc107', color: isPaused ? '#fff' : '#111'}}>
            {isPaused ? 'TIẾP TỤC' : 'TẠM DỪNG'}
          </button>
        )}
      </div>

      <div className="log-container">
        <div className="log-header">
          <h3>Nhật ký xử lý:</h3>
          <button className="view-log-btn" onClick={onOpenLogModal}>Xem chi tiết</button>
        </div>
        <pre id="log-output" ref={refs.logOutputRef}>{log}</pre>
      </div>

      {/* Nút Reset / Hủy */}
      {(!isRendering && log.includes('--- Tiến trình kết thúc')) && !isUpdateAvailable && (
        <button id="newProjectButton" onClick={onReset}>Bắt đầu Project Mới</button>
      )}
      {isRendering && (
         <button id="newProjectButton" onClick={onReset} style={{backgroundColor: '#ff3b30'}}>HỦY HÀNG ĐỢI</button>
      )}
    </div>
  );
}

export default ControlsPane;