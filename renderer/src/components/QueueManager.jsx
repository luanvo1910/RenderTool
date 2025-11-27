import React, { useState } from 'react';

function QueueManager({ queue = [], onQueueChange, isRendering, isPaused, disabled }) {
  const [newUrl, setNewUrl] = useState('');

  const handleAddUrl = () => {
    const input = newUrl.trim();
    if (!input) return;
    
    // Tách nhiều links (mỗi link một dòng)
    const urls = input.split('\n')
      .map(line => line.trim())
      .filter(line => line && line.startsWith('http'));
    
    if (urls.length === 0) {
      alert('Vui lòng nhập link YouTube hợp lệ (bắt đầu bằng http)');
      return;
    }
    
    // Thêm tất cả links hợp lệ vào queue
    onQueueChange([...queue, ...urls]);
    setNewUrl('');
  };

  const handleRemoveUrl = (index) => {
    const newQueue = queue.filter((_, i) => i !== index);
    onQueueChange(newQueue);
  };

  const handleMoveUp = (index) => {
    if (index === 0) return;
    const newQueue = [...queue];
    [newQueue[index - 1], newQueue[index]] = [newQueue[index], newQueue[index - 1]];
    onQueueChange(newQueue);
  };

  const handleMoveDown = (index) => {
    if (index === queue.length - 1) return;
    const newQueue = [...queue];
    [newQueue[index], newQueue[index + 1]] = [newQueue[index + 1], newQueue[index]];
    onQueueChange(newQueue);
  };

  const handleClearAll = () => {
    if (window.confirm('Bạn có chắc muốn xóa tất cả links trong hàng chờ?')) {
      onQueueChange([]);
    }
  };

  return (
    <div className="queue-manager">
      <div className="queue-manager-header">
        <h3>Quản lý Hàng chờ ({queue.length})</h3>
        {queue.length > 0 && (
          <button 
            className="clear-all-btn" 
            onClick={handleClearAll}
            disabled={disabled || (isRendering && !isPaused)}
            title="Xóa tất cả"
          >
            🗑️ Xóa hết
          </button>
        )}
      </div>

      <div className="queue-add-section">
        <textarea
          className="queue-input"
          placeholder="Nhập link YouTube... (có thể paste nhiều links, mỗi link một dòng)"
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          onKeyDown={(e) => {
            // Ctrl+Enter hoặc Cmd+Enter để thêm
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault();
              handleAddUrl();
            }
          }}
          disabled={disabled}
          rows={3}
        />
        <button 
          className="queue-add-btn"
          onClick={handleAddUrl}
          disabled={disabled || !newUrl.trim()}
        >
          ➕ Thêm
        </button>
      </div>

      <div className="queue-list">
        {queue.length === 0 ? (
          <div className="queue-empty">Chưa có link nào trong hàng chờ</div>
        ) : (
          queue.map((url, index) => (
            <div key={index} className="queue-item">
              <div className="queue-item-number">{index + 1}</div>
              <div className="queue-item-url" title={url}>
                {url.length > 50 ? `${url.substring(0, 50)}...` : url}
              </div>
              <div className="queue-item-actions">
                <button
                  className="queue-action-btn"
                  onClick={() => handleMoveUp(index)}
                  disabled={disabled || (isRendering && !isPaused) || index === 0}
                  title="Lên trên"
                >
                  ⬆️
                </button>
                <button
                  className="queue-action-btn"
                  onClick={() => handleMoveDown(index)}
                  disabled={disabled || (isRendering && !isPaused) || index === queue.length - 1}
                  title="Xuống dưới"
                >
                  ⬇️
                </button>
                <button
                  className="queue-action-btn queue-delete-btn"
                  onClick={() => handleRemoveUrl(index)}
                  disabled={disabled || (isRendering && !isPaused)}
                  title="Xóa"
                >
                  ❌
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default QueueManager;

