import { useState, useEffect, useRef } from 'react';
import TemplatePane from './components/TemplatePane';
import EditorPane from './components/EditorPane';
import ControlsPane from './components/ControlsPane';
import './App.css';

const VIDEO_WIDTH = 720;
const defaultTextStyle = {
  fontFamily: 'arial.ttf', 
  reactFontSize: 70,
  fontRenderScale: 1.0,
  fontColor: '#FFFFFF',
  isBold: false,
  isItalic: false,
  outlineColor: '#000000',
  outlineWidth: 2,
  shadowColor: '#000000',
  shadowDepth: 2,
  boxColor: '#000000',
  boxOpacity: 0.5,
  boxPadding: 10,
};

const initialElements = [
  { 
    id: 'video-placeholder', type: 'video', zIndex: 1, source: null,
    width: 400, height: 300, top: 350, left: 10, transformX: 0, transformY: 0
  },
  { 
    id: 'thumbnail-placeholder', type: 'thumbnail', zIndex: 2, source: null,
    width: 400, height: 300, top: 20, left: 10, transformX: 0, transformY: 0
  },
  { 
    id: 'text-placeholder', type: 'text', zIndex: 3, content: "Part ...", style: { ...defaultTextStyle },
    width: 400, height: 150, top: 700, left: 10, transformX: 0, transformY: 0
  },
];

function LogModal({ log, onClose }) {
  return (
    <div className="log-modal-overlay" onClick={onClose}>
      <div className="log-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="log-modal-header">
          <h3>Chi tiết Nhật ký xử lý</h3>
          <button className="close-btn" onClick={onClose}>Đóng</button>
        </div>
        <pre className="log-modal-body">{log}</pre>
      </div>
    </div>
  );
}

function App() {
  const [elements, setElements] = useState(initialElements);
  const [log, setLog] = useState('');
  const [templates, setTemplates] = useState([]);
  const [isRendering, setIsRendering] = useState(false);
  const [selectedElementId, setSelectedElementId] = useState(null);
  const [systemFonts, setSystemFonts] = useState([]);
  const [encoder, setEncoder] = useState('libx264');
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [isCookieRequired, setIsCookieRequired] = useState(false);
  const [statusText, setStatusText] = useState('Sẵn sàng');
  const [progress, setProgress] = useState(0);
  const [splitMode, setSplitMode] = useState('duration');
  
  const [urlQueue, setUrlQueue] = useState([]);
  const [currentQueueIndex, setCurrentQueueIndex] = useState(0);
  const [queueStatus, setQueueStatus] = useState(''); 

  const [updateInfo, setUpdateInfo] = useState(null); 
  const [isDownloadingUpdate, setIsDownloadingUpdate] = useState(false);
  const [isUpdateDownloaded, setIsUpdateDownloaded] = useState(false);
  const [updateStatus, setUpdateStatus] = useState(''); 

  const urlInputRef = useRef(null);
  const durationInputRef = useRef(null);
  const partsInputRef = useRef(null);
  const savePathInputRef = useRef(null);
  const logOutputRef = useRef(null);
  const canvasRef = useRef(null);
  const fullLogRef = useRef('');

  const jobStateRef = useRef();
  const layoutRef = useRef(null); // <<< SỬA LỖI 2: Thêm ref cho layout
  const linkProcessedRef = useRef(false); // Đánh dấu đã xử lý link hiện tại (thành công hoặc lỗi)

  const selectedElement = elements.find(e => e.id === selectedElementId);

  // <<< SỬA LỖI 2: Tách hàm captureLayoutData ra ngoài
  const captureLayoutData = () => {
    if (!canvasRef.current) return [];
    const scaleFactor = VIDEO_WIDTH / canvasRef.current.offsetWidth;
    return elements.map(elementInfo => {
      const { id, type, zIndex, source, content, style, aspectRatio } = elementInfo;
      const { width, height, top, left, transformX, transformY } = elementInfo;
      if (!id || !width || !height) return null; 
      const itemData = {
        id, type, zIndex, source, content, aspectRatio,
        x: Math.round((left + (transformX || 0)) * scaleFactor),
        y: Math.round((top + (transformY || 0)) * scaleFactor),
        width: Math.round(width * scaleFactor),
        height: Math.round(height * scaleFactor),
        ui: { 
          x: transformX || 0, 
          y: transformY || 0, 
          width, 
          height,
          top,
          left
        },
      };
      if (itemData.type === 'text' && style) {
        const reactFontSize = style.reactFontSize || 70;
        const renderScale = style.fontRenderScale || 1.0;
        const scaledReactSize = reactFontSize * scaleFactor;
        const finalRenderFontSize = Math.round(scaledReactSize * renderScale);
        itemData.textStyle = { ...style, fontSize: finalRenderFontSize };
      }
      return itemData;
    }).filter(Boolean);
  };

  useEffect(() => {
    // <<< SỬA LỖI 2: Cập nhật ref mỗi khi state thay đổi >>>
    jobStateRef.current = { isRendering, urlQueue, currentQueueIndex, splitMode };
    layoutRef.current = captureLayoutData();
  }, [isRendering, urlQueue, currentQueueIndex, splitMode, elements]); // <<< Thêm `elements` vào dependency


  useEffect(() => {
    loadAndRenderTemplates();
    window.electronAPI.getFonts().then(fonts => {
      if (fonts?.length > 0) {
        setSystemFonts(fonts);
        const existingStyleEl = document.getElementById('dynamic-font-loader');
        if (existingStyleEl) {
          existingStyleEl.remove(); 
        }
        const styleEl = document.createElement('style');
        styleEl.id = 'dynamic-font-loader';
        const fontFaces = fonts.map(font => {
          if (!font.dataUrl || !font.name) return '';
          return `
            @font-face {
              font-family: "${font.name}"; 
              src: url(${font.dataUrl});
            }
          `;
        }).join('\n');
        styleEl.innerHTML = fontFaces;
        document.head.appendChild(styleEl);
        const defaultFontFile = fonts[0]?.file || 'arial.ttf';
        setElements(prev => prev.map(el => 
            el.type === 'text' && el.style.fontFamily === 'arial.ttf' 
            ? { ...el, style: { ...el.style, fontFamily: defaultFontFile }} 
            : el
        ));
        const textPlaceholder = initialElements.find(el => el.id === 'text-placeholder');
        if (textPlaceholder) {
            textPlaceholder.style = { ...defaultTextStyle, fontFamily: defaultFontFile };
        }
      }
    });

    const removeLogListener = window.electronAPI.onProcessLog((logLine) => {
        // <<< SỬA LỖI 2: Đọc state từ ref >>>
        const { isRendering, urlQueue, currentQueueIndex } = jobStateRef.current || {};
        
        fullLogRef.current += logLine + '\n';

        if (logLine.startsWith('STATUS:')) { setStatusText(logLine.replace('STATUS:', '').trim()); }
        
        // Xử lý link thành công hoặc lỗi
        if (logLine.includes('LINK_SUCCESS')) {
            linkProcessedRef.current = true; // Đánh dấu đã xử lý
            // Link thành công, tiếp tục với link tiếp theo
            if (isRendering && urlQueue.length > 0) {
                const nextIndex = currentQueueIndex + 1;
                if (nextIndex < urlQueue.length) {
                    setUpdateStatus(`Link ${currentQueueIndex + 1} thành công. Chuyển sang link ${nextIndex + 1}...`);
                    runJob(nextIndex, urlQueue); 
                } else {
                    setIsRendering(false);
                    setUpdateStatus(`Hoàn tất! Đã render ${urlQueue.length} video.`);
                    setStatusText('Sẵn sàng');
                    setUrlQueue([]);
                    setCurrentQueueIndex(0);
                    setProgress(100);
                }
            }
        } else if (logLine.includes('LINK_ERROR:')) {
            linkProcessedRef.current = true; // Đánh dấu đã xử lý
            // Link lỗi, skip và tiếp tục với link tiếp theo
            const errorMsg = logLine.replace('LINK_ERROR:', '').trim();
            setUpdateStatus(`Link ${currentQueueIndex + 1} bị lỗi: ${errorMsg}. Đang bỏ qua và chuyển sang link tiếp theo...`);
            if (isRendering && urlQueue.length > 0) {
                const nextIndex = currentQueueIndex + 1;
                if (nextIndex < urlQueue.length) {
                    // Bỏ qua link lỗi và chuyển sang link tiếp theo
                    runJob(nextIndex, urlQueue); 
                } else {
                    setIsRendering(false);
                    setUpdateStatus(`Hoàn tất! Đã xử lý ${urlQueue.length} link (có link bị lỗi đã được bỏ qua).`);
                    setStatusText('Sẵn sàng');
                    setUrlQueue([]);
                    setCurrentQueueIndex(0);
                    setProgress(100);
                }
            }
        }
        
        // Xử lý FATAL_ERROR (lỗi nghiêm trọng không thể tiếp tục)
        if (logLine.includes('FATAL_ERROR:')) {
            setIsRendering(false); 
            setUpdateStatus(`LỖI NGHIÊM TRỌNG! Đã dừng hàng đợi.`);
            setStatusText('Đã xảy ra lỗi nghiêm trọng!');
            setUrlQueue([]);
            setCurrentQueueIndex(0);
        }
        
        if (logLine.includes('--- Tiến trình kết thúc')) {
            // Chỉ xử lý nếu chưa có LINK_SUCCESS hoặc LINK_ERROR (tránh xử lý trùng)
            if (!linkProcessedRef.current && isRendering && urlQueue.length > 0) {
                // Kiểm tra exit code từ main.js
                const exitCodeMatch = logLine.match(/mã (\d+)/);
                const exitCode = exitCodeMatch ? parseInt(exitCodeMatch[1]) : 0;
                
                // Nếu exit code là 0 (thành công) hoặc 1 (lỗi nhưng đã xử lý), tiếp tục
                if (exitCode === 0 || exitCode === 1) {
                    const nextIndex = currentQueueIndex + 1;
                    if (nextIndex < urlQueue.length) {
                        // Nếu exit code là 1, đây là link lỗi
                        if (exitCode === 1) {
                            setUpdateStatus(`Link ${currentQueueIndex + 1} bị lỗi. Đang bỏ qua và chuyển sang link tiếp theo...`);
                        }
                        linkProcessedRef.current = false; // Reset flag cho link tiếp theo
                        runJob(nextIndex, urlQueue); 
                    } else {
                        setIsRendering(false);
                        const successCount = urlQueue.length; // Có thể đếm chính xác hơn nếu cần
                        setUpdateStatus(`Hoàn tất! Đã xử lý ${successCount} link.`);
                        setStatusText('Sẵn sàng');
                        setUrlQueue([]);
                        setCurrentQueueIndex(0);
                        setProgress(100);
                        linkProcessedRef.current = false; // Reset flag
                    }
                }
            } else if (!isRendering || urlQueue.length === 0) {
                setIsRendering(false);
                setStatusText('Hoàn tất!');
                setProgress(100);
                linkProcessedRef.current = false; // Reset flag
            }
        }
        
        setLog(prev => {
            const newLog = prev + logLine + '\n';
            const lines = newLog.split('\n');
            return lines.slice(-100).join('\n');
        });
      });
  
    const removeProgressListener = window.electronAPI.onProcessProgress(({ type, value }) => {
      setProgress(value);
      if (type === 'DONE') {
        setProgress(100);
      }
    });
    const removeContextMenuListener = window.electronAPI.onContextMenuCommand(({ action, elementId }) => { handleLayerAction(action, elementId); });
    const removeCookieListener = window.electronAPI.onCookieRequired(() => {
        const errorMsg = 'ERROR: Video này yêu cầu cookies để tải.\n';
        setLog(prev => prev + errorMsg);
        fullLogRef.current += errorMsg;
        // Không dừng queue nữa, chỉ hiển thị cảnh báo và tiếp tục
        setIsCookieRequired(true);
        setStatusText('Cảnh báo: Video yêu cầu cookies.');
        setUpdateStatus('Link này yêu cầu cookies. Đang bỏ qua và tiếp tục...');
        // Tiếp tục với link tiếp theo thay vì dừng
        const { isRendering, urlQueue, currentQueueIndex } = jobStateRef.current || {};
        if (isRendering && urlQueue && urlQueue.length > 0) {
            const nextIndex = currentQueueIndex + 1;
            if (nextIndex < urlQueue.length) {
                setTimeout(() => {
                    runJob(nextIndex, urlQueue);
                }, 1000); // Đợi 1 giây trước khi chuyển link
            } else {
                setIsRendering(false);
                setUpdateStatus(`Hoàn tất! Đã xử lý ${urlQueue.length} link (có link yêu cầu cookies đã được bỏ qua).`);
                setStatusText('Sẵn sàng');
                setUrlQueue([]);
                setCurrentQueueIndex(0);
            }
        }
    });
    const removeUpdateMessageListener = window.electronAPI.onUpdateMessage((message) => {
        setUpdateStatus(message);
    });
    const removeUpdateAvailableListener = window.electronAPI.onUpdateAvailable((info) => {
        setUpdateInfo(info); 
        setIsUpdateDownloaded(false);
        setIsDownloadingUpdate(false);
    });
    const removeUpdateProgressListener = window.electronAPI.onUpdateProgress((percent) => {
        setIsDownloadingUpdate(true);
        setProgress(percent); 
    });
    const removeUpdateDownloadedListener = window.electronAPI.onUpdateDownloaded(() => {
        setIsUpdateDownloaded(true); 
        setIsDownloadingUpdate(false);
        setProgress(100);
    });
    return () => {
      removeLogListener();
      removeProgressListener();
      removeContextMenuListener();
      removeCookieListener();
      removeUpdateMessageListener();
      removeUpdateAvailableListener();
      removeUpdateProgressListener();
      removeUpdateDownloadedListener();
    };
  }, []); // <<< Dependency rỗng (chỉ chạy 1 lần) là CỐ Ý và ĐÚNG

  useEffect(() => {
    if (logOutputRef.current) {
      logOutputRef.current.scrollTop = logOutputRef.current.scrollHeight;
    }
  }, [log]);


  const runJob = (index, queue = urlQueue) => {
    const url = queue[index]; 
    if (!url) {
        setIsRendering(false);
        setUpdateStatus('Lỗi hàng đợi!');
        setUrlQueue([]);
        return;
    }
    linkProcessedRef.current = false; // Reset flag khi bắt đầu link mới
    setCurrentQueueIndex(index);
    setUpdateStatus(`Đang xử lý link ${index + 1}/${queue.length}:`); 
    setStatusText(`Bắt đầu...`); 
    
    const startLog = `--- Bắt đầu Link ${index + 1}/${queue.length}: ${url} ---\n`;
    setLog(startLog);
    fullLogRef.current = startLog;
    
    setProgress(0);
    setIsCookieRequired(false);
    const { splitMode: currentSplitMode } = jobStateRef.current;
    const durationValue = (currentSplitMode === 'duration') 
                            ? (durationInputRef.current ? durationInputRef.current.value : 120) 
                            : 0; 
    window.electronAPI.runProcessWithLayout({
      url: url, 
      parts: partsInputRef.current.value,
      partDuration: durationValue, 
      savePath: savePathInputRef.current.value,
      layout: layoutRef.current, // <<< SỬA LỖI 2: Đọc layout từ ref
      encoder: encoder,
    });
  };


  const handleRunRender = () => {
    const urlsText = urlInputRef.current.value;
    if (!urlsText) return alert('Vui lòng nhập ít nhất một link YouTube.');
    if (isRendering) return;
    const urls = urlsText.split('\n')
                         .map(url => url.trim())
                         .filter(url => url.startsWith('http'));
    if (urls.length === 0) return alert('Không tìm thấy link YouTube hợp lệ. (Phải bắt đầu bằng http và mỗi link 1 dòng).');
    
    const startLog = `Bắt đầu render hàng đợi ${urls.length} link...\n`;
    setLog(startLog);
    fullLogRef.current = startLog;
    
    setIsRendering(true);
    setUpdateStatus(`Đã xếp ${urls.length} link vào hàng đợi.`); 
    setUrlQueue(urls); 
    setCurrentQueueIndex(0); 
    runJob(0, urls); // <<< SỬA LỖI 2: Không cần truyền layout
  };

  const handleElementSelect = (elementId) => { setSelectedElementId(elementId); };
  const handleStyleChange = (property, value) => {
    if (!selectedElementId) return;
    setElements(prevElements =>
      prevElements.map(el =>
        el.id === selectedElementId
          ? {
              ...el,
              ...(property === 'content'
                ? { content: value }
                : { style: { ...el.style, [property]: value } })
            }
          : el
      )
    );
  };
  const handleLayerAction = (action, elementId) => {
    setElements(currentElements => {
      const newElements = [...currentElements].sort((a, b) => a.zIndex - b.zIndex);
      const currentIndex = newElements.findIndex(el => el.id === elementId);
      if (currentIndex === -1) return currentElements;
      if (action === 'bring-forward' && currentIndex < newElements.length - 1) {
        [newElements[currentIndex].zIndex, newElements[currentIndex + 1].zIndex] = [newElements[currentIndex + 1].zIndex, newElements[currentIndex].zIndex];
      } else if (action === 'send-backward' && currentIndex > 0) {
        [newElements[currentIndex].zIndex, newElements[currentIndex - 1].zIndex] = [newElements[currentIndex - 1].zIndex, newElements[currentIndex].zIndex];
      } else if (action === 'delete-element') {
        if (selectedElementId === elementId) setSelectedElementId(null);
        return newElements.filter(el => el.id !== elementId);
      }
      return newElements;
    });
  };
  
  const handleElementUpdate = (elementId, updates) => {
    setElements(prevElements =>
      prevElements.map(el =>
        el.id === elementId
          ? {
              ...el,
              width: updates.width,
              height: updates.height,
              top: updates.top,
              left: updates.left,
              transformX: updates.transformX,
              transformY: updates.transformY,
            }
          : el
      )
    );
  };
  
  const applyLayout = (layoutData) => {
    if (!canvasRef.current) return;
    const newElementsState = layoutData.map(itemData => {
      let restoredStyle = itemData.textStyle ? { 
          ...defaultTextStyle, ...itemData.textStyle,
          fontFamily: itemData.textStyle.fontFamily || 'arial.ttf', 
          reactFontSize: itemData.textStyle.reactFontSize || 70,
          fontRenderScale: itemData.textStyle.fontRenderScale || 1.0,
          boxPadding: itemData.textStyle.boxPadding || 10,
      } : null;
      return {
        id: itemData.id, type: itemData.type, zIndex: itemData.zIndex,
        source: itemData.source, content: itemData.content, 
        style: restoredStyle,
        aspectRatio: itemData.aspectRatio || null,
        width: itemData.ui ? itemData.ui.width : 300,
        height: itemData.ui ? itemData.ui.height : 300,
        top: itemData.ui ? itemData.ui.top : 50,
        left: itemData.ui ? itemData.ui.left : 50,
        transformX: itemData.ui ? itemData.ui.x : 0,
        transformY: itemData.ui ? itemData.ui.y : 0,
      };
    });
    setElements(newElementsState);
  };
  
  const loadAndRenderTemplates = async () => {
    const fetchedTemplates = await window.electronAPI.getTemplates();
    setTemplates(fetchedTemplates);
  };
  const handleSaveTemplate = async (templateName) => {
    const newTemplate = { id: `template-${Date.now()}`, name: templateName, layout: layoutRef.current }; // <<< Sửa: Dùng ref
    await window.electronAPI.saveTemplate(newTemplate);
    loadAndRenderTemplates();
  };
  const handleDeleteTemplate = async (templateId) => {
    await window.electronAPI.deleteTemplate(templateId);
    loadAndRenderTemplates();
  };

  const handleAddImage = async () => {
    const imageData = await window.electronAPI.openImageDialog(); 
    if (imageData && imageData.dataUrl) {
      const newId = `image-${Date.now()}`;
      const aspectRatio = imageData.width / imageData.height;
      const initialWidth = 300; 
      const initialHeight = 300 / aspectRatio; 
      setElements(prev => {
        const maxZIndex = prev.length > 0 ? Math.max(...prev.map(e => e.zIndex)) : 0;
        return [...prev, { 
            id: newId, 
            type: 'image', 
            zIndex: maxZIndex + 1, 
            source: imageData.dataUrl,
            aspectRatio: aspectRatio,
            width: initialWidth,
            height: initialHeight,
            top: 50,
            left: 50,
            transformX: 0,
            transformY: 0
        }];
      });
    }
  };

  const handleAddText = () => {
    const newId = `text-${Date.now()}`;
    setElements(prev => {
        const maxZIndex = prev.length > 0 ? Math.max(...prev.map(e => e.zIndex)) : 0;
        return [...prev, {
            id: newId, type: 'text', zIndex: maxZIndex + 1,
            content: "Văn bản mới", 
            style: { ...defaultTextStyle, reactFontSize: 50 },
            width: 300,
            height: 100,
            top: 100,
            left: 50,
            transformX: 0,
            transformY: 0
        }];
    });
  };
  
  const handleBrowse = async () => {
    const path = await window.electronAPI.openDirectoryDialog();
    if (path) savePathInputRef.current.value = path;
  };
  const handleReset = () => {
    if (isRendering) { 
        if (isRendering && window.confirm("Bạn có chắc muốn hủy hàng đợi render? (Video hiện tại sẽ hoàn tất và dừng lại)")) {
            setUrlQueue([]); 
            setUpdateStatus('Đang hủy... Chờ video hiện tại hoàn tất.');
        }
        return; 
    }
    setElements(initialElements); 
    setLog(''); 
    fullLogRef.current = '';
    setStatusText('Sẵn sàng');
    setProgress(0);
    if(urlInputRef.current) urlInputRef.current.value = '';
    if(savePathInputRef.current) savePathInputRef.current.value = '';
    setIsRendering(false); setUrlQueue([]); setCurrentQueueIndex(0);
    setUpdateStatus('');
    setUpdateInfo(null); setIsDownloadingUpdate(false); setIsUpdateDownloaded(false);
  };
  const handleUpdateCookiesAndRetry = async () => {
    setIsCookieRequired(false);
    const result = await window.electronAPI.updateCookies();
    if (result.success) {
      handleRunRender();
    } else {
        alert(result.message);
    }
  };

  const renderCanvasChildren = () => {
    const sortedElements = [...elements].sort((a, b) => a.zIndex - b.zIndex);
    const canvasWidth = canvasRef.current ? canvasRef.current.offsetWidth : (360 * 1.2);
    const targetWidth = VIDEO_WIDTH; 
    const previewScale = canvasWidth / targetWidth;
    return sortedElements.map(elementInfo => {
      const { id, type, zIndex, source, style, content } = elementInfo;
      const { width, height, top, left, transformX, transformY, aspectRatio } = elementInfo;
      const isSelected = selectedElementId === id;
      const classNames = `edit-item ${type}-item ${isSelected ? 'selected' : ''} ${type === 'image' ? 'custom-image' : ''}`;
      
      let elementStyle = { 
        zIndex,
        width: `${width}px`,
        height: `${height}px`,
        top: `${top}px`,
        left: `${left}px`,
        transform: `translate(${transformX || 0}px, ${transformY || 0}px)`
      };
      
      let pStyle = {}; 
      if (type === 'text' && style) {
        const fontName = systemFonts.find(f => f.file === style.fontFamily)?.name || style.fontFamily;
        const scaledOutlineWidth = (style.outlineWidth || 0) * previewScale;
        const scaledShadowDepth = (style.shadowDepth || 0) * previewScale;
        const scaledBoxPadding = (style.boxPadding || 0) * previewScale;
        elementStyle = {
          ...elementStyle,
          fontFamily: fontName, 
          fontSize: `${style.reactFontSize}px`,
          color: style.fontColor,
          fontWeight: style.isBold ? 'bold' : 'normal',
          fontStyle: style.isItalic ? 'italic' : 'normal',
          textShadow: `${style.shadowColor} ${scaledShadowDepth}px ${scaledShadowDepth}px 2px`,
          WebkitTextStroke: `${scaledOutlineWidth}px ${style.outlineColor}`,
          textStroke: `${scaledOutlineWidth}px ${style.outlineColor}`,
        };
        if (style.boxColor) {
            pStyle = {
                backgroundColor: `${style.boxColor}${Math.round(style.boxOpacity * 255).toString(16).padStart(2, '0')}`,
                padding: `${scaledBoxPadding}px`,
                display: 'inline-block',
                maxWidth: '100%',
                boxSizing: 'border-box', 
            };
        }
      } else if (type === 'image' && source) {
        elementStyle.backgroundImage = `url('${source}')`;
      }
      return (
        <div
          key={id} id={id} data-type={type}
          className={classNames} style={elementStyle}
          onClick={(e) => { e.stopPropagation(); handleElementSelect(id); }}
          data-aspect-ratio={aspectRatio || 0}
        >
          {(type === 'text' || !source) && (
            <p style={pStyle}>{content ? content : type.toUpperCase()}</p>
          )}
        </div>
      );
    });
  };

  const handleDownloadUpdate = () => {
    setIsDownloadingUpdate(true);
    setUpdateStatus('Bắt đầu tải bản cập nhật...');
    window.electronAPI.startDownload();
  };
  const handleInstallUpdate = () => {
    window.electronAPI.quitAndInstall();
  };
  
  const controlRefs = { urlInputRef, durationInputRef, partsInputRef, savePathInputRef, logOutputRef };

  return (
    <div className="app-container">
      {isLogModalOpen && <LogModal log={fullLogRef.current} onClose={() => setIsLogModalOpen(false)} />}
      {isCookieRequired && (
        <div className="cookie-modal-overlay">
          <div className="cookie-modal-content">
            <h3>Video Yêu Cầu Cookies</h3>
            <p>Video này có thể là video riêng tư hoặc bị giới hạn, yêu cầu cookies để tải xuống. Vui lòng cập nhật file cookies.txt trong thư mục cài đặt và thử lại.</p>
            <button onClick={() => setIsCookieRequired(false)}>Đóng</button>
          </div>
        </div>
      )}

      <TemplatePane
        templates={templates} onSave={handleSaveTemplate}
        onLoad={applyLayout} onDelete={handleDeleteTemplate}
      />
      
      <EditorPane
        ref={canvasRef}
        elements={elements} 
        selectedElement={selectedElement}
        systemFonts={systemFonts}
        onElementSelect={handleElementSelect}
        onStyleChange={handleStyleChange}
        onElementUpdate={handleElementUpdate} 
      >
        {renderCanvasChildren()}
      </EditorPane>
      
      <ControlsPane 
        refs={controlRefs}
        log={log}
        isRendering={isRendering}
        statusText={statusText}
        progress={progress}
        onRunRender={handleRunRender}
        onAddImage={handleAddImage}
        onAddText={handleAddText}
        onBrowse={handleBrowse}
        onReset={handleReset}
        encoder={encoder}
        onEncoderChange={(e) => setEncoder(e.target.value)}
        onOpenLogModal={() => setIsLogModalOpen(true)}
        
        splitMode={splitMode}
        onSplitModeChange={(e) => setSplitMode(e.target.value)}
        
        updateStatus={updateStatus}
        isUpdateAvailable={updateInfo !== null}
        isDownloadingUpdate={isDownloadingUpdate}
        isUpdateDownloaded={isUpdateDownloaded}
        onDownloadUpdate={handleDownloadUpdate}
        onInstallUpdate={handleInstallUpdate}
      />
    </div>
  );
}

export default App;