import QueueList from './QueueList';

function fileName(filePath) {
  const parts = String(filePath).split(/[/\\]/);
  return parts[parts.length - 1] || filePath;
}

function LocalSourcePanel({
  videos = [],
  thumbnail,
  isRendering,
  isPaused,
  disabled,
  onAddVideos,
  onVideosChange,
  onPickThumbnail,
  onClearThumbnail,
}) {
  const locked = disabled || (isRendering && !isPaused);

  const handleRemove = (index) => {
    onVideosChange(videos.filter((_, i) => i !== index));
  };

  const handleMove = (index, direction) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= videos.length) return;
    const next = [...videos];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    onVideosChange(next);
  };

  return (
    <div className="queue-manager">
      <div className="queue-manager-header">
        <h3>Video trên máy ({videos.length})</h3>
        {videos.length > 0 && (
          <button
            className="clear-all-btn"
            onClick={() => {
              if (window.confirm('Bạn có chắc muốn xóa tất cả video đã chọn?')) onVideosChange([]);
            }}
            disabled={locked}
          >
            Xóa hết
          </button>
        )}
      </div>

      <button className="local-pick-btn" onClick={onAddVideos} disabled={disabled}>
        Chọn video
      </button>

      {videos.length === 0 ? (
        <div className="queue-empty">Chưa chọn video nào</div>
      ) : (
        <QueueList
          entries={videos.map((videoPath, index) => ({
            key: `${index}-${videoPath}`,
            index,
            label: fileName(videoPath),
            title: videoPath,
          }))}
          locked={locked}
          rendering={isRendering && !isPaused}
          onRemove={handleRemove}
          onMove={handleMove}
        />
      )}

      <div className="local-thumb-block">
        <h3>Ảnh thay thumbnail</h3>
        {thumbnail ? (
          <div className="local-thumb-preview">
            <img src={thumbnail.dataUrl} alt="Ảnh thumbnail đã chọn" />
            <div className="local-thumb-meta">
              <div className="local-thumb-name" title={thumbnail.path}>{thumbnail.name}</div>
              <div className="button-group">
                <button onClick={onPickThumbnail} disabled={disabled}>Đổi ảnh</button>
                <button onClick={onClearThumbnail} disabled={locked}>Xóa</button>
              </div>
            </div>
          </div>
        ) : (
          <button className="local-pick-btn" onClick={onPickThumbnail} disabled={disabled}>
            Chọn ảnh từ máy
          </button>
        )}
        <p className="local-hint">Ảnh này thay thumbnail và được đặt vào khung thumbnail trên canvas.</p>
      </div>
    </div>
  );
}

export default LocalSourcePanel;
