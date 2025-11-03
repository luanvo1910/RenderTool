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
  { id: 'video-placeholder', type: 'video', zIndex: 1, source: null },
  { id: 'thumbnail-placeholder', type: 'thumbnail', zIndex: 2, source: null },
  { id: 'text-placeholder', type: 'text', zIndex: 3, content: "Part ...", style: { ...defaultTextStyle } },
];

function LogModal({ log, onClose }) {
  // ... (code không đổi)
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

  const urlInputRef = useRef(null);
  const durationInputRef = useRef(null);
  const partsInputRef = useRef(null);
  const savePathInputRef = useRef(null);
  const logOutputRef = useRef(null);
  const canvasRef = useRef(null);

  const jobStateRef = useRef();
  
  // <<< SỬA LỖI TẠI ĐÂY: Thêm 'splitMode' vào ref >>>
  useEffect(() => {
    jobStateRef.current = { isRendering, urlQueue, currentQueueIndex, splitMode };
  }, [isRendering, urlQueue, currentQueueIndex, splitMode]); // Thêm splitMode vào dependency array


  const selectedElement = elements.find(e => e.id === selectedElementId);

  useEffect(() => {
    loadAndRenderTemplates();
    
    window.electronAPI.getFonts().then(fonts => {
      // ... (code getFonts không đổi) ...
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
        initialElements[2].style = { ...defaultTextStyle, fontFamily: defaultFontFile };
      }
    });

    // --- Listener Log (Xử lý hàng đợi) ---
    const removeLogListener = window.electronAPI.onProcessLog((logLine) => {
        // Luôn đọc state mới nhất từ ref
        const { isRendering, urlQueue, currentQueueIndex } = jobStateRef.current || {};

        if (logLine.startsWith('STATUS:')) {
            setStatusText(logLine.replace('STATUS:', '').trim());
        }

        if (logLine.includes('FATAL_ERROR:')) {
            setIsRendering(false); 
            setQueueStatus(`LỖI NGHIÊM TRỌNG! Đã dừng hàng đợi.`);
            setStatusText('Đã xảy ra lỗi nghiêm trọng!');
            setUrlQueue([]);
            setCurrentQueueIndex(0);
        } 
        else if (logLine.includes('PYTHON_ERROR:') && !logLine.includes('WARNING:')) {
            setIsRendering(false); 
            setQueueStatus(`LỖI PYTHON! Đã dừng hàng đợi.`);
            setStatusText('Đã xảy ra lỗi Python!');
            setUrlQueue([]);
            setCurrentQueueIndex(0);
        }

        if (logLine.includes('--- Tiến trình kết thúc')) {
            if (isRendering && urlQueue.length > 0) {
                const nextIndex = currentQueueIndex + 1;
                if (nextIndex < urlQueue.length) {
                    runJob(nextIndex, urlQueue); // Chạy job tiếp theo
                } else {
                    // Hàng đợi hoàn tất
                    setIsRendering(false);
                    setQueueStatus(`Hoàn tất! Đã render ${urlQueue.length} video.`);
                    setStatusText('Sẵn sàng');
                    setUrlQueue([]);
                    setCurrentQueueIndex(0);
                    setProgress(100);
                }
            } else {
                // Trường hợp chạy 1 link (không trong queue) hoặc đã bị hủy
                setIsRendering(false);
                setStatusText('Hoàn tất!');
                setProgress(100);
            }
        }
        setLog(prev => prev + logLine + '\n');
      });
  
    // --- Listener Progress (Rút gọn thông báo) ---
    const removeProgressListener = window.electronAPI.onProcessProgress(({ type, value }) => {
      setProgress(value);
      if (type === 'DONE') {
        setProgress(100);
      }
    });
  
    // --- Các Listener khác ---
    const removeContextMenuListener = window.electronAPI.onContextMenuCommand(({ action, elementId }) => {
      handleLayerAction(action, elementId);
    });
  
    const removeCookieListener = window.electronAPI.onCookieRequired(() => {
        setLog(prev => prev + 'ERROR: Video này yêu cầu cookies để tải. Vui lòng cập nhật cookies.' + '\n');
        setIsRendering(false); 
        setIsCookieRequired(true);
        setStatusText('Lỗi! Cần cập nhật cookies.');
        setQueueStatus('Lỗi Cookies! Đã dừng hàng đợi.');
        setUrlQueue([]);
    });
  
    // Cleanup
    return () => {
      removeLogListener();
      removeProgressListener();
      removeContextMenuListener();
      removeCookieListener();
    };
  }, []); // Chạy 1 lần duy nhất

  useEffect(() => {
    // ... (code không đổi) ...
    if (logOutputRef.current) {
      logOutputRef.current.scrollTop = logOutputRef.current.scrollHeight;
    }
  }, [log]);


  // <<< SỬA LỖI TẠI ĐÂY: Đọc 'splitMode' từ ref >>>
  const runJob = (index, queue = urlQueue) => {
    const url = queue[index]; 
    if (!url) {
        setIsRendering(false);
        setQueueStatus('Lỗi hàng đợi!');
        setUrlQueue([]);
        return;
    }

    setCurrentQueueIndex(index);
    setQueueStatus(`Đang xử lý link ${index + 1}/${queue.length}:`);
    setStatusText(`Bắt đầu...`); 
    setLog(prev => prev + `\n--- Bắt đầu Link ${index + 1}/${queue.length}: ${url} ---\n`);
    setProgress(0);
    setIsCookieRequired(false);

    // Đọc 'splitMode' mới nhất từ ref thay vì state
    const { splitMode: currentSplitMode } = jobStateRef.current;

    const durationValue = (currentSplitMode === 'duration') 
                            ? (durationInputRef.current ? durationInputRef.current.value : 120) 
                            : 0; 

    window.electronAPI.runProcessWithLayout({
      url: url, 
      parts: partsInputRef.current.value,
      partDuration: durationValue, 
      savePath: savePathInputRef.current.value,
      layout: captureLayoutData(),
      encoder: encoder,
    });
  };


  const handleRunRender = () => {
    // ... (code không đổi) ...
    const urlsText = urlInputRef.current.value;
    if (!urlsText) return alert('Vui lòng nhập ít nhất một link YouTube.');
    if (isRendering) return;

    const urls = urlsText.split('\n')
                         .map(url => url.trim())
                         .filter(url => url.startsWith('http'));
    
    if (urls.length === 0) return alert('Không tìm thấy link YouTube hợp lệ. (Phải bắt đầu bằng http và mỗi link 1 dòng).');

    setLog(`Bắt đầu render hàng đợi ${urls.length} link...\n`);
    setIsRendering(true);
    setQueueStatus(`Đã xếp ${urls.length} link vào hàng đợi.`);
    setUrlQueue(urls); 
    setCurrentQueueIndex(0); 

    runJob(0, urls);
  };

  const handleElementSelect = (elementId) => {
    // ... (code không đổi) ...
    setSelectedElementId(elementId);
  };

  const handleStyleChange = (property, value) => {
    // ... (code không đổi) ...
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
    // ... (code không đổi) ...
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

  const captureLayoutData = () => {
    // ... (code không đổi) ...
    if (!canvasRef.current) return [];
    const scaleFactor = VIDEO_WIDTH / canvasRef.current.offsetWidth;
    
    return elements.map(elementInfo => {
      const el = document.getElementById(elementInfo.id);
      if (!el) return null;
      const transformX = parseFloat(el.getAttribute('data-x')) || 0;
      const transformY = parseFloat(el.getAttribute('data-y')) || 0;
      
      const itemData = {
        id: el.id, type: el.dataset.type,
        x: Math.round((el.offsetLeft + transformX) * scaleFactor),
        y: Math.round((el.offsetTop + transformY) * scaleFactor),
        width: Math.round(el.offsetWidth * scaleFactor),
        height: Math.round(el.offsetHeight * scaleFactor),
        zIndex: elementInfo.zIndex, source: elementInfo.source || null, content: elementInfo.content || null,
        ui: { x: transformX, y: transformY, width: el.offsetWidth, height: el.offsetHeight },
      };
      
      if (itemData.type === 'text' && elementInfo.style) {
        const style = elementInfo.style;
        const reactFontSize = style.reactFontSize || 70;
        const renderScale = style.fontRenderScale || 1.0;
        
        const scaledReactSize = reactFontSize * scaleFactor;
        const finalRenderFontSize = Math.round(scaledReactSize * renderScale);

        itemData.textStyle = {
            ...style,
            fontSize: finalRenderFontSize
        };
      }
      return itemData;
    }).filter(Boolean);
  };

  const applyLayout = (layoutData) => {
    // ... (code không đổi) ...
    if (!canvasRef.current) return;
    const newElementsState = layoutData.map(itemData => {
      let restoredStyle = itemData.textStyle ? { 
          ...defaultTextStyle,
          ...itemData.textStyle,
          fontFamily: itemData.textStyle.fontFamily || 'arial.ttf', 
          reactFontSize: itemData.textStyle.reactFontSize || 70,
          fontRenderScale: itemData.textStyle.fontRenderScale || 1.0,
          boxPadding: itemData.textStyle.boxPadding || 10,
      } : null;

      setTimeout(() => {
        const element = document.getElementById(itemData.id);
        if (element && itemData.ui) {
          element.style.width = `${itemData.ui.width}px`;
          element.style.height = `${itemData.ui.height}px`;
          element.style.transform = `translate(${itemData.ui.x}px, ${itemData.ui.y}px)`;
          element.setAttribute('data-x', itemData.ui.x);
          element.setAttribute('data-y', itemData.ui.y);
        }
      }, 0);

      return {
        id: itemData.id, type: itemData.type, zIndex: itemData.zIndex,
        source: itemData.source, content: itemData.content, 
        style: restoredStyle,
      };
    });
    setElements(newElementsState);
  };

  const loadAndRenderTemplates = async () => {
    // ... (code không đổi) ...
    const fetchedTemplates = await window.electronAPI.getTemplates();
    setTemplates(fetchedTemplates);
  };

  const handleSaveTemplate = async (templateName) => {
    // ... (code không đổi) ...
    const newTemplate = { id: `template-${Date.now()}`, name: templateName, layout: captureLayoutData() };
    await window.electronAPI.saveTemplate(newTemplate);
    loadAndRenderTemplates();
  };

  const handleDeleteTemplate = async (templateId) => {
    // ... (code không đổi) ...
    await window.electronAPI.deleteTemplate(templateId);
    loadAndRenderTemplates();
  };

  const handleAddImage = async () => {
    // ... (code không đổi) ...
    const dataUrl = await window.electronAPI.openImageDialog();
    if (dataUrl) {
      const newId = `image-${Date.now()}`;
      setElements(prev => {
        const maxZIndex = prev.length > 0 ? Math.max(...prev.map(e => e.zIndex)) : 0;
        return [...prev, { id: newId, type: 'image', zIndex: maxZIndex + 1, source: dataUrl }];
      });
    }
  };

  const handleAddText = () => {
    // ... (code không đổi) ...
    const newId = `text-${Date.now()}`;
    setElements(prev => {
        const maxZIndex = prev.length > 0 ? Math.max(...prev.map(e => e.zIndex)) : 0;
        return [...prev, {
            id: newId, type: 'text', zIndex: maxZIndex + 1,
            content: "Văn bản mới", style: { ...defaultTextStyle, reactFontSize: 50 }
        }];
    });
  };

  const handleBrowse = async () => {
    // ... (code không đổi) ...
    const path = await window.electronAPI.openDirectoryDialog();
    if (path) savePathInputRef.current.value = path;
  };

  const handleReset = () => {
    // ... (code không đổi) ...
    if (isRendering) {
        if (window.confirm("Bạn có chắc muốn hủy hàng đợi render? (Video hiện tại sẽ hoàn tất và dừng lại)")) {
            setUrlQueue([]); 
            setQueueStatus('Đang hủy... Chờ video hiện tại hoàn tất.');
        }
        return;
    }

    setElements(initialElements);
    setLog('');
    setStatusText('Sẵn sàng');
    setProgress(0);
    if(urlInputRef.current) urlInputRef.current.value = '';
    if(savePathInputRef.current) savePathInputRef.current.value = '';
    
    setIsRendering(false);
    setUrlQueue([]);
    setCurrentQueueIndex(0);
    setQueueStatus('');
  };
  
  const handleUpdateCookiesAndRetry = async () => {
    // ... (code không đổi) ...
    setIsCookieRequired(false);
    const result = await window.electronAPI.updateCookies();
    if (result.success) {
      handleRunRender();
    } else {
        alert(result.message);
    }
  };

  const renderCanvasChildren = () => {
    // ... (code không đổi) ...
    const sortedElements = [...elements].sort((a, b) => a.zIndex - b.zIndex);
    
    const canvasWidth = canvasRef.current ? canvasRef.current.offsetWidth : (360 * 1.2);
    const targetWidth = VIDEO_WIDTH; 
    const previewScale = canvasWidth / targetWidth;

    return sortedElements.map(elementInfo => {
      const { id, type, zIndex, source, style, content } = elementInfo;
      const isSelected = selectedElementId === id;
      const classNames = `edit-item ${type}-item ${isSelected ? 'selected' : ''}`;
      
      let elementStyle = { zIndex };
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
        >
          <p style={pStyle}>{content ? content : type.toUpperCase()}</p>
        </div>
      );
    });
  };

  const controlRefs = { urlInputRef, durationInputRef, partsInputRef, savePathInputRef, logOutputRef };

  return (
    <div className="app-container">
      {/* ... (code modal không đổi) ... */}
      {isLogModalOpen && <LogModal log={log} onClose={() => setIsLogModalOpen(false)} />}
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
        
        queueStatus={queueStatus}
      />
    </div>
  );
}

export default App;