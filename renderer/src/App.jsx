import { useState, useEffect, useRef } from 'react';
import TemplatePane from './components/TemplatePane';
import EditorPane from './components/EditorPane';
import ControlsPane from './components/ControlsPane';
import './App.css';

const VIDEO_WIDTH = 720;
const defaultTextStyle = {
  fontFamily: 'Arial',
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

  // <<< THÊM STATE MỚI ĐỂ QUẢN LÝ CHẾ ĐỘ CHIA VIDEO >>>
  const [splitMode, setSplitMode] = useState('duration'); // 'duration' hoặc 'equal'

  const urlInputRef = useRef(null);
  const durationInputRef = useRef(null);
  const partsInputRef = useRef(null);
  const savePathInputRef = useRef(null);
  const logOutputRef = useRef(null);
  const canvasRef = useRef(null);

  const selectedElement = elements.find(e => e.id === selectedElementId);

  useEffect(() => {
    loadAndRenderTemplates();
    window.electronAPI.getFonts().then(fonts => {
      if (fonts?.length > 0) {
        setSystemFonts(fonts);
      }
    });

    const removeLogListener = window.electronAPI.onProcessLog((logLine) => {
        if (logLine.startsWith('STATUS:')) {
            setStatusText(logLine.replace('STATUS:', '').trim());
        }
        if (logLine.includes('PYTHON_ERROR:') || logLine.includes('FATAL_ERROR:') || logLine.includes('--- Tiến trình') || logLine.includes('--- Quá trình')) {
          setIsRendering(false);
          if (logLine.includes('ERROR')) {
              setStatusText('Đã xảy ra lỗi!');
          } else {
              setStatusText('Hoàn tất!');
          }
        }
        setLog(prev => prev + logLine + '\n');
      });
  
    const removeProgressListener = window.electronAPI.onProcessProgress(({ type, value }) => {
      setProgress(value);
      if (type === 'DOWNLOAD') {
        setStatusText(`Đang tải video... ${Math.round(value)}%`);
      } else if (type === 'RENDER') {
        setStatusText(`Đang render... ${Math.round(value)}%`);
      } else if (type === 'DONE') {
        setProgress(100);
      }
    });
  
    const removeContextMenuListener = window.electronAPI.onContextMenuCommand(({ action, elementId }) => {
      handleLayerAction(action, elementId);
    });
  
    const removeCookieListener = window.electronAPI.onCookieRequired(() => {
        setLog(prev => prev + 'ERROR: Video này yêu cầu cookies để tải. Vui lòng cập nhật cookies.' + '\n');
        setIsRendering(false);
        setIsCookieRequired(true);
        setStatusText('Lỗi! Cần cập nhật cookies.');
    });
  
    return () => {
      removeLogListener();
      removeProgressListener();
      removeContextMenuListener();
      removeCookieListener();
    };
  }, []);

  useEffect(() => {
    if (logOutputRef.current) {
      logOutputRef.current.scrollTop = logOutputRef.current.scrollHeight;
    }
  }, [log]);

  // <<< CẬP NHẬT HÀM NÀY >>>
  const handleRunRender = () => {
    if (!urlInputRef.current.value) return alert('Vui lòng nhập link YouTube.');
    if (isRendering) return;
    setLog('Bắt đầu gửi dữ liệu layout và xử lý...\n');
    setIsRendering(true);
    setIsCookieRequired(false);
    setStatusText('Bắt đầu...');
    setProgress(0);
    
    // Quyết định giá trị partDuration dựa trên splitMode
    const durationValue = (splitMode === 'duration') 
                            ? durationInputRef.current.value 
                            : 0; // Gửi 0 để Python tự chia đều

    window.electronAPI.runProcessWithLayout({
      url: urlInputRef.current.value,
      parts: partsInputRef.current.value,
      partDuration: durationValue, // Gửi giá trị đã tính toán
      savePath: savePathInputRef.current.value,
      layout: captureLayoutData(),
      encoder: encoder,
    });
  };

  const handleElementSelect = (elementId) => {
    setSelectedElementId(elementId);
  };

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

  const captureLayoutData = () => {
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
    if (!canvasRef.current) return;
    const newElementsState = layoutData.map(itemData => {
      let restoredStyle = itemData.textStyle ? { 
          ...defaultTextStyle,
          ...itemData.textStyle,
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
    const fetchedTemplates = await window.electronAPI.getTemplates();
    setTemplates(fetchedTemplates);
  };

  const handleSaveTemplate = async (templateName) => {
    const newTemplate = { id: `template-${Date.now()}`, name: templateName, layout: captureLayoutData() };
    await window.electronAPI.saveTemplate(newTemplate);
    loadAndRenderTemplates();
  };

  const handleDeleteTemplate = async (templateId) => {
    await window.electronAPI.deleteTemplate(templateId);
    loadAndRenderTemplates();
  };

  const handleAddImage = async () => {
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
    const path = await window.electronAPI.openDirectoryDialog();
    if (path) savePathInputRef.current.value = path;
  };

  const handleReset = () => {
    setElements(initialElements);
    setLog('');
    setStatusText('Sẵn sàng');
    setProgress(0);
    if(urlInputRef.current) urlInputRef.current.value = '';
    if(savePathInputRef.current) savePathInputRef.current.value = '';
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
    return sortedElements.map(elementInfo => {
      const { id, type, zIndex, source, style, content } = elementInfo;
      const isSelected = selectedElementId === id;
      const classNames = `edit-item ${type}-item ${isSelected ? 'selected' : ''}`;
      
      let elementStyle = { zIndex };
      if (type === 'text' && style) {
        elementStyle = {
          ...elementStyle,
          fontFamily: style.fontFamily,
          fontSize: `${style.reactFontSize}px`,
          color: style.fontColor,
          fontWeight: style.isBold ? 'bold' : 'normal',
          fontStyle: style.isItalic ? 'italic' : 'normal',
          textShadow: `${style.outlineColor} 0px 0px ${style.outlineWidth}px, ${style.shadowColor} ${style.shadowDepth}px ${style.shadowDepth}px 2px`,
          backgroundColor: style.boxColor ? `${style.boxColor}${Math.round(style.boxOpacity * 255).toString(16).padStart(2, '0')}` : 'transparent',
          padding: style.boxColor ? `${style.boxPadding}px` : '0',
        };
      } else if (type === 'image' && source) {
        elementStyle.backgroundImage = `url('${source}')`;
      }

      return (
        <div
          key={id} id={id} data-type={type}
          className={classNames} style={elementStyle}
          onClick={(e) => { e.stopPropagation(); handleElementSelect(id); }}
        >
          {content ? <p>{content}</p> : <p>{type.toUpperCase()}</p>}
        </div>
      );
    });
  };

  const controlRefs = { urlInputRef, durationInputRef, partsInputRef, savePathInputRef, logOutputRef };

  return (
    <div className="app-container">
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
        
        // <<< THÊM 2 PROPS NÀY >>>
        splitMode={splitMode}
        onSplitModeChange={(e) => setSplitMode(e.target.value)}
      />
    </div>
  );
}

export default App;