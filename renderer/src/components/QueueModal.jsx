import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

function QueueModal({ 
  isOpen, 
  onClose, 
  queue, 
  onQueueChange, 
  templates = [], 
  isRendering, 
  isPaused, 
  disabled 
}) {
  const [newUrl, setNewUrl] = useState('');

  // Debug: Log templates để kiểm tra (chỉ trong development)
  useEffect(() => {
    if (isOpen && process.env.NODE_ENV === 'development') {
      console.log('QueueModal - isOpen:', isOpen);
      console.log('QueueModal - Templates:', templates);
      console.log('QueueModal - Templates count:', templates?.length || 0);
      console.log('QueueModal - Queue:', queue);
    }
  }, [isOpen, templates, queue]);

  if (!isOpen) {
    return null;
  }

  // Đảm bảo queue luôn là array
  const safeQueue = Array.isArray(queue) ? queue : [];

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
    
    // Thêm tất cả links hợp lệ vào queue với templateId = null (sẽ dùng template hiện tại)
    const newItems = urls.map(url => ({
      url,
      templateId: null,
      splitMode: 'duration',
      partDuration: 120,
      maxParts: 2,
    }));
    onQueueChange([...safeQueue, ...newItems]);
    setNewUrl('');
  };

  const handleRemoveUrl = (index) => {
    const newQueue = safeQueue.filter((_, i) => i !== index);
    onQueueChange(newQueue);
  };

  const handleMoveUp = (index) => {
    if (index === 0) return;
    const newQueue = [...safeQueue];
    [newQueue[index - 1], newQueue[index]] = [newQueue[index], newQueue[index - 1]];
    onQueueChange(newQueue);
  };

  const handleMoveDown = (index) => {
    if (index === safeQueue.length - 1) return;
    const newQueue = [...safeQueue];
    [newQueue[index], newQueue[index + 1]] = [newQueue[index + 1], newQueue[index]];
    onQueueChange(newQueue);
  };

  const handleClearAll = () => {
    if (window.confirm('Bạn có chắc muốn xóa tất cả links trong hàng chờ?')) {
      onQueueChange([]);
    }
  };

  const handleTemplateChange = (index, templateId) => {
    const newQueue = [...safeQueue];
    newQueue[index] = { ...newQueue[index], templateId: templateId || null };
    onQueueChange(newQueue);
  };

  const handleSplitModeChange = (index, value) => {
    const newQueue = [...safeQueue];
    newQueue[index] = { 
      ...newQueue[index], 
      splitMode: value === 'equal' ? 'equal' : 'duration'
    };
    onQueueChange(newQueue);
  };

  const handlePartDurationChange = (index, value) => {
    const duration = Math.max(1, Number(value) || 120);
    const newQueue = [...safeQueue];
    newQueue[index] = { 
      ...newQueue[index], 
      partDuration: duration 
    };
    onQueueChange(newQueue);
  };

  const handleMaxPartsChange = (index, value) => {
    const maxParts = Math.max(1, Number(value) || 2);
    const newQueue = [...safeQueue];
    newQueue[index] = { 
      ...newQueue[index], 
      maxParts 
    };
    onQueueChange(newQueue);
  };

  // Đảm bảo item có url (backward compatibility)
  const normalizedQueue = safeQueue.map(item => {
    if (typeof item === 'string') {
      return { url: item, templateId: null, splitMode: 'duration', partDuration: 120, maxParts: 2 };
    }
    if (item && typeof item === 'object' && item.url) {
      return { 
        url: item.url, 
        templateId: item.templateId || null,
        splitMode: item.splitMode || 'duration',
        partDuration: Number.isFinite(item.partDuration) ? item.partDuration : 120,
        maxParts: Number.isFinite(item.maxParts) ? item.maxParts : 2,
      };
    }
    return { url: String(item), templateId: null, splitMode: 'duration', partDuration: 120, maxParts: 2 };
  });

  const modalContent = (
    <div className="queue-modal-overlay" onClick={onClose}>
      <div className="queue-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="queue-modal-header">
          <h2>Quản lý Hàng chờ ({normalizedQueue.length})</h2>
          <button className="queue-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="queue-modal-body">
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

          {normalizedQueue.length > 0 && (
            <div className="queue-clear-section">
              <button 
                className="clear-all-btn" 
                onClick={handleClearAll}
                disabled={disabled || (isRendering && !isPaused)}
              >
                🗑️ Xóa hết
              </button>
            </div>
          )}

          <div className="queue-list">
            {normalizedQueue.length === 0 ? (
              <div className="queue-empty">Chưa có link nào trong hàng chờ</div>
            ) : (
              normalizedQueue.map((item, index) => {
                const itemUrl = item.url;
                const itemTemplateId = item.templateId || null;
                const itemSplitMode = item.splitMode || 'duration';
                const itemPartDuration = Number.isFinite(item.partDuration) ? item.partDuration : 120;
                const itemMaxParts = Number.isFinite(item.maxParts) ? item.maxParts : 2;
                
                return (
                  <div key={index} className="queue-item">
                    <div className="queue-item-number">{index + 1}</div>
                    <div className="queue-item-content">
                      <div className="queue-item-url" title={itemUrl}>
                        {itemUrl.length > 60 ? `${itemUrl.substring(0, 60)}...` : itemUrl}
                      </div>
                      <div className="queue-item-template">
                        <label>Template:</label>
                        <select
                          value={itemTemplateId || ''}
                          onChange={(e) => handleTemplateChange(index, e.target.value)}
                          disabled={disabled || (isRendering && !isPaused)}
                          className="queue-template-select"
                        >
                          <option value="">Template hiện tại (canvas)</option>
                          {Array.isArray(templates) && templates.length > 0 ? (
                            templates.map(template => {
                              if (!template || !template.id) return null;
                              return (
                                <option key={template.id} value={template.id}>
                                  {template.name || `Template ${template.id}`}
                                </option>
                              );
                            }).filter(Boolean)
                          ) : (
                            <option disabled>Chưa có template nào</option>
                          )}
                        </select>
                      </div>
                      <div className="queue-item-settings">
                        <div className="queue-item-field">
                          <label>Phương thức chia:</label>
                          <select
                            value={itemSplitMode}
                            onChange={(e) => handleSplitModeChange(index, e.target.value)}
                            disabled={disabled || (isRendering && !isPaused)}
                            className="queue-template-select"
                          >
                            <option value="duration">Theo Thời lượng (giây)</option>
                            <option value="equal">Chia đều (Số phần)</option>
                          </select>
                        </div>
                        {itemSplitMode === 'duration' && (
                          <div className="queue-item-field">
                            <label>Thời lượng mỗi phần (giây):</label>
                            <input
                              type="number"
                              min="1"
                              className="queue-number-input"
                              value={itemPartDuration}
                              onChange={(e) => handlePartDurationChange(index, e.target.value)}
                              disabled={disabled || (isRendering && !isPaused)}
                            />
                          </div>
                        )}
                        <div className="queue-item-field">
                          <label>{itemSplitMode === 'duration' ? 'Số phần TỐI ĐA:' : 'Chia thành (Số phần):'}</label>
                          <input
                            type="number"
                            min="1"
                            className="queue-number-input"
                            value={itemMaxParts}
                            onChange={(e) => handleMaxPartsChange(index, e.target.value)}
                            disabled={disabled || (isRendering && !isPaused)}
                          />
                        </div>
                      </div>
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
                        disabled={disabled || (isRendering && !isPaused) || index === normalizedQueue.length - 1}
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
                );
              })
            )}
          </div>
        </div>

        <div className="queue-modal-footer">
          <button className="queue-modal-close-btn" onClick={onClose}>Đóng</button>
        </div>
      </div>
    </div>
  );

  // Sử dụng portal nếu có, nếu không thì render trực tiếp
  try {
    if (document.body) {
      return createPortal(modalContent, document.body);
    }
  } catch (error) {
    console.error('Error creating portal:', error);
  }
  
  return modalContent;
}

export default QueueModal;

