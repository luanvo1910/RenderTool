import { useMemo, useRef, useState } from 'react';

const ROW_HEIGHT = 44;
const VIEW_HEIGHT = 220;

function QueueList({ entries, locked, rendering, onRemove, onMove }) {
  const [query, setQuery] = useState('');
  const [scrollTop, setScrollTop] = useState(0);
  const viewRef = useRef(null);
  const showReorder = entries.length > 0 && entries.length <= 30;
  const needle = query.trim().toLowerCase();

  const visibleEntries = useMemo(() => {
    if (!needle) return entries;
    return entries.filter((entry) =>
      entry.label.toLowerCase().includes(needle) || (entry.title || '').toLowerCase().includes(needle)
    );
  }, [entries, needle]);

  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 3);
  const end = Math.min(visibleEntries.length, start + Math.ceil(VIEW_HEIGHT / ROW_HEIGHT) + 6);
  const slice = visibleEntries.slice(start, end);

  return (
    <div className="queue-browser">
      <div className="queue-summary">
        <strong>{entries.length.toLocaleString('vi-VN')}</strong>
        <span>{rendering ? 'Mục đầu tiên đang được xử lý' : 'Mục trên cùng được xử lý trước'}</span>
      </div>
      {entries.length > 8 && (
        <input
          className="queue-filter"
          type="text"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setScrollTop(0);
            if (viewRef.current) viewRef.current.scrollTop = 0;
          }}
          placeholder="Lọc theo tên hoặc link"
        />
      )}
      {visibleEntries.length === 0 ? (
        <div className="queue-empty">Không có mục nào khớp</div>
      ) : (
        <div
          className="queue-viewport"
          ref={viewRef}
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        >
          <div className="queue-spacer" style={{ height: visibleEntries.length * ROW_HEIGHT }}>
            {slice.map((entry, offset) => {
              const row = start + offset;
              return (
                <div key={entry.key} className="queue-row" style={{ top: row * ROW_HEIGHT, height: ROW_HEIGHT }}>
                  <div className={`queue-item${rendering && entry.index === 0 ? ' is-active' : ''}`}>
                    <div className="queue-item-number">{entry.index + 1}</div>
                    <div className="queue-item-url" title={entry.title || entry.label}>{entry.label}</div>
                    <div className="queue-item-actions">
                      {showReorder && (
                        <>
                          <button className="queue-action-btn" onClick={() => onMove(entry.index, -1)} disabled={locked || entry.index === 0} title="Lên trên">↑</button>
                          <button className="queue-action-btn" onClick={() => onMove(entry.index, 1)} disabled={locked || entry.index === entries.length - 1} title="Xuống dưới">↓</button>
                        </>
                      )}
                      <button className="queue-action-btn queue-delete-btn" onClick={() => onRemove(entry.index)} disabled={locked} title="Xóa">×</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default QueueList;
