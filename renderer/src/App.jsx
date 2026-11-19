import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import TemplatePane from './components/TemplatePane';
import EditorPane from './components/EditorPane';
import ControlsPane from './components/ControlsPane';
import LogModal from './components/LogModal';
import { VIDEO_WIDTH, VIDEO_HEIGHT, defaultTextStyle, initialElements } from './constants/editor';

function App() {
  const [elements, setElements] = useState(initialElements);
  const [log, setLog] = useState('');
  const [templates, setTemplates] = useState([]);
  const [isRendering, setIsRendering] = useState(false);
  const [selectedElementId, setSelectedElementId] = useState(null);
  const [systemFonts, setSystemFonts] = useState([]);
  const [encoder, setEncoder] = useState('libx264');
  const [playbackSpeed, setPlaybackSpeed] = useState('1');
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [isCookieRequired, setIsCookieRequired] = useState(false);
  const [statusText, setStatusText] = useState('Sẵn sàng');
  const [progress, setProgress] = useState(0);
  const [splitMode, setSplitMode] = useState('duration');
  const [showPartText, setShowPartText] = useState(true); // Bật/tắt hiển thị chữ "Part..."
  const [hasError, setHasError] = useState(false); // Có lỗi ở link hiện tại nhưng queue vẫn còn
  
  const [urlQueue, setUrlQueue] = useState([]);
  const [sourceMode, setSourceMode] = useState('link');
  const [localQueue, setLocalQueue] = useState([]);
  const [thumbnailFile, setThumbnailFile] = useState(null);
  const [isPaused, setIsPaused] = useState(false);
  
  const handleQueueChange = useCallback((newQueue) => {
    setUrlQueue(newQueue);
  }, []);
  
  const handlePauseToggle = useCallback(() => {
    setIsPaused(prev => {
      const next = !prev;
      jobStateRef.current = { ...(jobStateRef.current || {}), isPaused: next };
      return next;
    });
  }, []); 

  const handleRetryFirst = useCallback(() => {
    const state = jobStateRef.current || {};
    const currentQueue = state.sourceMode === 'local' ? (state.localQueue || []) : (state.urlQueue || []);
    if (currentQueue.length === 0) return;
    setHasError(false);
    setIsRendering(true);
    setIsPaused(false);
    setTimeout(() => {
      runJobRef.current?.(currentQueue);
    }, 0);
  }, []);

  const handleSkipFirst = useCallback(() => {
    const isLocal = sourceMode === 'local';
    const queue = isLocal ? localQueue : urlQueue;
    if (!queue || queue.length === 0) return;
    const updatedQueue = queue.slice(1);
    if (isLocal) setLocalQueue(updatedQueue);
    else setUrlQueue(updatedQueue);
    setHasError(false);
    const itemWord = isLocal ? 'video' : 'link';
    if (updatedQueue.length > 0) {
      setUpdateStatus(`Đã bỏ qua ${itemWord} đầu. Còn lại ${updatedQueue.length} ${itemWord} trong hàng chờ.`);
    } else {
      setUpdateStatus(`Đã bỏ qua ${itemWord} cuối cùng. Hàng chờ trống.`);
    }
  }, [urlQueue, localQueue, sourceMode]);

  const [updateInfo, setUpdateInfo] = useState(null); 
  const [isDownloadingUpdate, setIsDownloadingUpdate] = useState(false);
  const [isUpdateDownloaded, setIsUpdateDownloaded] = useState(false);
  const [updateStatus, setUpdateStatus] = useState(''); 

  const durationInputRef = useRef(null);
  const partsInputRef = useRef(null);
  const savePathInputRef = useRef(null);
  const logOutputRef = useRef(null);
  const canvasRef = useRef(null);
  const fullLogRef = useRef('');

  const jobStateRef = useRef();
  const runJobRef = useRef(null);
  const layoutRef = useRef(null); // <<< SỬA LỖI 2: Thêm ref cho layout
  const linkProcessedRef = useRef(false); // Đánh dấu đã xử lý link hiện tại (thành công hoặc lỗi)
  const batchRef = useRef(null);
  const haltQueueRef = useRef(false);
  const logFlushTimerRef = useRef(null);
  const progressTimerRef = useRef(null);
  const pendingProgressRef = useRef(0);

  const selectedElement = useMemo(() => 
    elements.find(e => e.id === selectedElementId), 
    [elements, selectedElementId]
  );

  // <<< SỬA LỖI 2: Tách hàm captureLayoutData ra ngoài
  const captureLayoutData = useCallback(() => {
    if (!canvasRef.current) return [];
    // Filter ra text-placeholder nếu showPartText = false
    const filteredElements = showPartText 
      ? elements 
      : elements.filter(el => el.id !== 'text-placeholder');
    return filteredElements.map(elementInfo => {
      const { id, type, zIndex, source, content, style, aspectRatio, flip } = elementInfo;
      const { width, height, top, left, transformX, transformY } = elementInfo;
      if (!id || !width || !height) return null; 
      // Các giá trị trong state (left, top, width, height, transformX, transformY) 
      // đã là giá trị gốc theo VIDEO_WIDTH (720x1280), không cần scale nữa
      const itemData = {
        id, type, zIndex, source, content, aspectRatio, flip: flip || 'none',
        x: Math.round(left + (transformX || 0)),
        y: Math.round(top + (transformY || 0)),
        width: Math.round(width),
        height: Math.round(height),
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
        // reactFontSize đã là giá trị gốc theo VIDEO_WIDTH, không cần scale
        const finalRenderFontSize = Math.round(reactFontSize * renderScale);
        itemData.textStyle = { ...style, fontSize: finalRenderFontSize };
      }
      return itemData;
    }).filter(Boolean);
  }, [elements, showPartText]);

  useEffect(() => {
    // <<< SỬA LỖI 2: Cập nhật ref mỗi khi state thay đổi >>> 
    jobStateRef.current = {
      isRendering,
      urlQueue,
      localQueue,
      sourceMode,
      thumbnailPath: thumbnailFile?.path || '',
      isPaused,
      splitMode,
      hasError,
      encoder,
      playbackSpeed,
    };
    layoutRef.current = captureLayoutData();
  }, [isRendering, urlQueue, localQueue, sourceMode, thumbnailFile, encoder, playbackSpeed, isPaused, splitMode, hasError, captureLayoutData]);


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

    const syncQueue = (nextQueue) => {
        const current = jobStateRef.current || {};
        if (current.sourceMode === 'local') {
            setLocalQueue(nextQueue);
            jobStateRef.current = { ...current, localQueue: nextQueue };
        } else {
            setUrlQueue(nextQueue);
            jobStateRef.current = { ...current, urlQueue: nextQueue };
        }
    };

    const progressLabel = (finished, total) => `Video ${finished}/${total}`;

    const clearJobLog = (summary) => {
        if (logFlushTimerRef.current) {
            clearTimeout(logFlushTimerRef.current);
            logFlushTimerRef.current = null;
        }
        const text = summary ? `${summary}\n` : '';
        fullLogRef.current = text;
        setLog(text);
    };

    const appendLog = (line) => {
        const current = fullLogRef.current;
        const next = current ? `${current}${line}\n` : `${line}\n`;
        const parts = next.split('\n');
        fullLogRef.current = parts.length > 300 ? parts.slice(-300).join('\n') : next;
        if (logFlushTimerRef.current) return;
        logFlushTimerRef.current = setTimeout(() => {
            logFlushTimerRef.current = null;
            setLog(fullLogRef.current.split('\n').slice(-80).join('\n'));
        }, 200);
    };

    const removeLogListener = window.electronAPI.onProcessLog((logLine) => {
        const snapshot = jobStateRef.current || {};
        const { isRendering, sourceMode: activeSource } = snapshot;
        const urlQueue = activeSource === 'local' ? (snapshot.localQueue || []) : (snapshot.urlQueue || []);
        let skipLog = false;

        if (logLine.startsWith('STATUS:')) { setStatusText(logLine.replace('STATUS:', '').trim()); }

        if (logLine.includes('LINK_SUCCESS')) {
            linkProcessedRef.current = true;
            setHasError(false);
            if (isRendering && urlQueue.length > 0) syncQueue(urlQueue.slice(1));
        } else if (logLine.includes('LINK_ERROR:')) {
            linkProcessedRef.current = true;
            setHasError(true);
            if (isRendering && urlQueue.length > 0) syncQueue(urlQueue.slice(1));
        }

        if (logLine.includes('FATAL_ERROR:')) {
            haltQueueRef.current = true;
            jobStateRef.current = { ...(jobStateRef.current || {}), isRendering: false };
            setIsRendering(false);
            setHasError(true);
            setStatusText('Đã xảy ra lỗi nghiêm trọng.');
            setProgress(100);
        }

        if (logLine.includes('--- Tiến trình kết thúc')) {
            if (haltQueueRef.current) {
                haltQueueRef.current = false;
                setIsRendering(false);
                setIsPaused(false);
                setHasError(true);
            } else {
                const failed = logLine.includes('(lỗi)');
                const exitCodeMatch = logLine.match(/mã (-?\d+)/);
                const exitCode = exitCodeMatch ? parseInt(exitCodeMatch[1], 10) : (failed ? 1 : 0);
                const state = jobStateRef.current || {};
                const queueNow = state.sourceMode === 'local' ? (state.localQueue || []) : (state.urlQueue || []);

                if (!linkProcessedRef.current) {
                    if (!failed && exitCode === 0 && state.isRendering && queueNow.length > 0) {
                        syncQueue(queueNow.slice(1));
                        linkProcessedRef.current = true;
                    } else {
                        setIsRendering(false);
                        setIsPaused(false);
                        setHasError(true);
                        setStatusText('Đã dừng do lỗi.');
                        const batch = batchRef.current;
                        const total = batch?.total || 1;
                        const index = Math.min((batch?.finished || 0) + 1, total);
                        setUpdateStatus(progressLabel(index, total));
                    }
                }

                if (linkProcessedRef.current) {
                    const batch = batchRef.current || { total: Math.max(queueNow.length, 1), finished: 0 };
                    batch.finished += 1;
                    batchRef.current = batch;
                    linkProcessedRef.current = false;
                    const latest = jobStateRef.current || {};
                    const nextQueue = latest.sourceMode === 'local' ? (latest.localQueue || []) : (latest.urlQueue || []);
                    const label = progressLabel(batch.finished, batch.total);
                    clearJobLog(label);
                    skipLog = true;
                    if (nextQueue.length > 0 && !latest.isPaused && latest.isRendering !== false) {
                        const nextLabel = progressLabel(Math.min(batch.finished + 1, batch.total), batch.total);
                        setUpdateStatus(nextLabel);
                        setTimeout(() => {
                            const now = jobStateRef.current || {};
                            if (now.isPaused || haltQueueRef.current) return;
                            runJobRef.current?.(nextQueue);
                        }, 0);
                    } else if (latest.isPaused && nextQueue.length > 0) {
                        setUpdateStatus(label);
                    } else {
                        setIsRendering(false);
                        setIsPaused(false);
                        setStatusText('Sẵn sàng');
                        setProgress(100);
                        setUpdateStatus(label);
                    }
                }
            }
        }

        if (!skipLog) appendLog(logLine);
      });

    const removeProgressListener = window.electronAPI.onProcessProgress(({ type, value }) => {
      if (type === 'DONE' || value >= 100) {
        if (progressTimerRef.current) {
          clearTimeout(progressTimerRef.current);
          progressTimerRef.current = null;
        }
        setProgress(100);
        return;
      }
      pendingProgressRef.current = value;
      if (progressTimerRef.current) return;
      progressTimerRef.current = setTimeout(() => {
        progressTimerRef.current = null;
        setProgress(pendingProgressRef.current || 0);
      }, 200);
    });
    const removeContextMenuListener = window.electronAPI.onContextMenuCommand(({ action, elementId }) => { handleLayerAction(action, elementId); });
    const removeCookieListener = window.electronAPI.onCookieRequired(() => {
        appendLog('ERROR: Video này yêu cầu cookies để tải.');
        setIsCookieRequired(true);
        setStatusText('Cảnh báo: Video yêu cầu cookies.');
        linkProcessedRef.current = true;
        const state = jobStateRef.current || {};
        const queue = state.sourceMode === 'local' ? (state.localQueue || []) : (state.urlQueue || []);
        if (state.isRendering && queue.length > 0) syncQueue(queue.slice(1));
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
      if (logFlushTimerRef.current) clearTimeout(logFlushTimerRef.current);
      if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
    };
  }, []); // <<< Dependency rỗng (chỉ chạy 1 lần) là CỐ Ý và ĐÚNG

  useEffect(() => {
    if (logOutputRef.current) {
      logOutputRef.current.scrollTop = logOutputRef.current.scrollHeight;
    }
  }, [log]);


  const runJob = useCallback((queue) => {
    const state = jobStateRef.current || {};
    const isLocal = state.sourceMode === 'local';
    const activeQueue = queue && queue.length ? queue : (isLocal ? state.localQueue : state.urlQueue);
    if (!activeQueue || activeQueue.length === 0) {
        setIsRendering(false);
        setUpdateStatus(isLocal ? 'Chưa chọn video trên máy.' : 'Hàng chờ trống!');
        return;
    }
    const item = activeQueue[0];
    if (!item) {
        setIsRendering(false);
        setUpdateStatus('Lỗi hàng đợi!');
        return;
    }
    linkProcessedRef.current = false;
    const batch = batchRef.current;
    const total = batch?.total || activeQueue.length;
    const index = batch ? Math.min((batch.finished || 0) + 1, total) : 1;
    setUpdateStatus(`Video ${index}/${total}`);
    setStatusText('Bắt đầu...'); 
    
    const startLog = `Video ${index}/${total}\n--- ${item} ---\n`;
    setLog(startLog);
    fullLogRef.current = startLog;
    
    setProgress(0);
    setIsCookieRequired(false);
    const currentSplitMode = state.splitMode;
    const durationValue = (currentSplitMode === 'duration') 
                            ? (durationInputRef.current ? durationInputRef.current.value : 120) 
                            : 0; 
    window.electronAPI.runProcessWithLayout({
      source: isLocal ? 'local' : 'link',
      url: item,
      videoPath: isLocal ? item : '',
      thumbnailPath: isLocal ? (state.thumbnailPath || '') : '',
      parts: partsInputRef.current.value,
      partDuration: durationValue, 
      savePath: savePathInputRef.current.value,
      layout: layoutRef.current, // <<< SỬA LỖI 2: Đọc layout từ ref
      encoder: state.encoder || encoder,
      speed: Number(state.playbackSpeed) > 0 ? Number(state.playbackSpeed) : 1,
    });
  }, [encoder]);

  runJobRef.current = runJob;


  const handleRunRender = useCallback(() => {
    const isLocal = sourceMode === 'local';
    const queue = isLocal ? localQueue : urlQueue;
    if (isLocal) {
      if (queue.length === 0) {
        return alert('Vui lòng chọn ít nhất một video có sẵn trên máy.');
      }
      if (!thumbnailFile?.path) {
        return alert('Vui lòng chọn một ảnh có sẵn trên máy để thay thumbnail.');
      }
    } else if (queue.length === 0) {
      return alert('Vui lòng thêm ít nhất một link YouTube vào hàng chờ.');
    }
    if (isRendering && !isPaused) return;
    
    // Nếu đang pause, tiếp tục render
    if (isPaused) {
      setIsPaused(false);
      setUpdateStatus('Đã tiếp tục render hàng chờ...');
      setTimeout(() => {
        const current = jobStateRef.current || {};
        const currentQueue = current.sourceMode === 'local' ? current.localQueue : current.urlQueue;
        if (currentQueue && currentQueue.length > 0) {
          runJob(currentQueue);
        }
      }, 0);
      return;
    }
    
    batchRef.current = { total: queue.length, finished: 0 };
    haltQueueRef.current = false;
    jobStateRef.current = {
      ...(jobStateRef.current || {}),
      isRendering: true,
      isPaused: false,
      sourceMode,
      urlQueue,
      localQueue,
      thumbnailPath: thumbnailFile?.path || '',
    };
    setIsRendering(true);
    setIsPaused(false);
    runJob(queue);
  }, [urlQueue, localQueue, sourceMode, thumbnailFile, isRendering, isPaused, runJob]);

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
  const nextFlip = (current, action) => {
    const flip = current || 'none';
    const horizontal = flip === 'horizontal' || flip === 'both';
    const vertical = flip === 'vertical' || flip === 'both';
    const nextHorizontal = action === 'flip-horizontal' ? !horizontal : horizontal;
    const nextVertical = action === 'flip-vertical' ? !vertical : vertical;
    if (nextHorizontal && nextVertical) return 'both';
    if (nextHorizontal) return 'horizontal';
    if (nextVertical) return 'vertical';
    return 'none';
  };

  const handleLayerAction = (action, elementId) => {
    if (action === 'flip-horizontal' || action === 'flip-vertical') {
      setElements(prev => prev.map(el => (
        el.id === elementId ? { ...el, flip: nextFlip(el.flip, action) } : el
      )));
      return;
    }
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
    // Convert từ giá trị đã scale (trong DOM) về giá trị gốc (theo VIDEO_WIDTH)
    if (!canvasRef.current) return;
    const canvasWidth = canvasRef.current.offsetWidth;
    // Canvas có aspect-ratio: 9/16, nên chỉ cần tính scale dựa trên width
    // previewScale để scale từ VIDEO_WIDTH (gốc) lên canvas (hiển thị)
    const previewScale = canvasWidth / VIDEO_WIDTH;
    
    setElements(prevElements =>
      prevElements.map(el =>
        el.id === elementId
          ? {
              ...el,
              width: updates.width / previewScale,
              height: updates.height / previewScale,
              top: updates.top / previewScale,
              left: updates.left / previewScale,
              transformX: updates.transformX / previewScale,
              transformY: updates.transformY / previewScale,
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
      
      let width, height, top, left, transformX, transformY;
      
      // Ưu tiên dùng itemData.ui nếu có và giá trị hợp lý (theo VIDEO_WIDTH)
      // Nếu itemData.ui có giá trị quá lớn (có thể là template cũ đã scale), 
      // thì dùng itemData.x, y, width, height (đã được convert về VIDEO_WIDTH)
      if (itemData.ui && itemData.ui.width && itemData.ui.height) {
        const uiWidth = itemData.ui.width;
        const uiHeight = itemData.ui.height;
        
        // Kiểm tra xem có phải template cũ với giá trị đã scale không
        // Nếu giá trị quá lớn so với VIDEO_WIDTH, có thể là đã scale
        if (uiWidth <= VIDEO_WIDTH && uiHeight <= VIDEO_HEIGHT) {
          // Giá trị hợp lý, dùng ui (template mới)
          width = uiWidth;
          height = uiHeight;
          top = itemData.ui.top || 0;
          left = itemData.ui.left || 0;
          transformX = itemData.ui.x || 0;
          transformY = itemData.ui.y || 0;
        } else if (itemData.width && itemData.height && itemData.x !== undefined && itemData.y !== undefined) {
          // Template cũ với ui đã scale, dùng x, y, width, height (đã convert về VIDEO_WIDTH)
          width = itemData.width;
          height = itemData.height;
          // Tính left và top từ x, y (giả sử transformX/Y = 0 trong template cũ)
          left = itemData.x;
          top = itemData.y;
          transformX = 0;
          transformY = 0;
        } else {
          // Vẫn dùng ui nhưng có thể sẽ bị scale sai - để renderCanvasChildren xử lý
          width = uiWidth;
          height = uiHeight;
          top = itemData.ui.top || 0;
          left = itemData.ui.left || 0;
          transformX = itemData.ui.x || 0;
          transformY = itemData.ui.y || 0;
        }
      } else if (itemData.width && itemData.height && itemData.x !== undefined && itemData.y !== undefined) {
        // Template chỉ có x, y, width, height (đã convert về VIDEO_WIDTH)
        width = itemData.width;
        height = itemData.height;
        left = itemData.x;
        top = itemData.y;
        transformX = 0;
        transformY = 0;
      } else {
        // Fallback: giá trị mặc định
        width = 300;
        height = 300;
        top = 50;
        left = 50;
        transformX = 0;
        transformY = 0;
      }
      
      return {
        id: itemData.id, type: itemData.type, zIndex: itemData.zIndex,
        source: itemData.id === 'thumbnail-placeholder' && thumbnailFile?.dataUrl
          ? thumbnailFile.dataUrl
          : itemData.source,
        content: itemData.content, 
        style: restoredStyle,
        aspectRatio: itemData.aspectRatio || null,
        flip: itemData.flip || 'none',
        width, height, top, left, transformX, transformY,
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
  
  const applyThumbnailPreview = (dataUrl) => {
    setElements(prev => prev.map(el =>
      el.id === 'thumbnail-placeholder' ? { ...el, source: dataUrl || null } : el
    ));
  };

  const handleAddLocalVideos = async () => {
    const paths = await window.electronAPI.openVideosDialog();
    if (!paths || paths.length === 0) return;
    setLocalQueue(prev => {
      const existing = new Set(prev);
      const next = [...prev];
      paths.forEach(filePath => {
        if (!existing.has(filePath)) next.push(filePath);
      });
      return next;
    });
  };

  const handlePickThumbnail = async () => {
    const imageData = await window.electronAPI.openThumbnailFileDialog();
    if (!imageData || !imageData.path) return;
    setThumbnailFile(imageData);
    applyThumbnailPreview(imageData.dataUrl);
  };

  const handleClearThumbnail = () => {
    setThumbnailFile(null);
    applyThumbnailPreview(null);
  };

  const handleBrowse = async () => {
    const path = await window.electronAPI.openDirectoryDialog();
    if (path) savePathInputRef.current.value = path;
  };
  const handleReset = () => {
    if (isRendering) { 
        if (window.confirm("Bạn có chắc muốn hủy hàng đợi render? (Video hiện tại sẽ hoàn tất và dừng lại)")) {
            setIsPaused(true); // Pause để dừng xử lý link tiếp theo
            setUpdateStatus('Đã tạm dừng hàng đợi. Video hiện tại sẽ hoàn tất.');
        }
        return; 
    }
    setElements(initialElements.map(el => (
      el.id === 'thumbnail-placeholder' && thumbnailFile?.dataUrl
        ? { ...el, source: thumbnailFile.dataUrl }
        : el
    ))); 
    setLog('');
    fullLogRef.current = '';
    batchRef.current = null;
    setStatusText('Sẵn sàng');
    setProgress(0);
    if(savePathInputRef.current) savePathInputRef.current.value = '';
    setIsRendering(false);
    setIsPaused(false);
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

  const handleUpdateCookies = async () => {
    try {
      const result = await window.electronAPI.updateCookies();
      if (result.success) {
        alert(result.message);
      } else {
        alert(result.message);
      }
    } catch (error) {
      alert(`Lỗi: ${error.message}`);
    }
  };

  const renderCanvasChildren = useCallback(() => {
    // Filter ra text-placeholder nếu showPartText = false
    const filteredElements = showPartText 
      ? elements 
      : elements.filter(el => el.id !== 'text-placeholder');
    const sortedElements = [...filteredElements].sort((a, b) => a.zIndex - b.zIndex);
    const canvasWidth = canvasRef.current ? canvasRef.current.offsetWidth : VIDEO_WIDTH;
    // Canvas có aspect-ratio: 9/16, nên chỉ cần tính scale dựa trên width
    // previewScale để scale từ VIDEO_WIDTH (gốc) lên canvas (hiển thị)
    const previewScale = canvasWidth / VIDEO_WIDTH;
    return sortedElements.map(elementInfo => {
      const { id, type, zIndex, source, style, content, flip } = elementInfo;
      const { width, height, top, left, transformX, transformY, aspectRatio } = elementInfo;
      const isSelected = selectedElementId === id;
      const classNames = `edit-item ${type}-item ${isSelected ? 'selected' : ''} ${type === 'image' ? 'custom-image' : ''}`;
      const flipX = flip === 'horizontal' || flip === 'both' ? -1 : 1;
      const flipY = flip === 'vertical' || flip === 'both' ? -1 : 1;
      const flipScale = flipX === 1 && flipY === 1 ? '' : ` scale(${flipX}, ${flipY})`;
      
      // Scale tất cả kích thước và vị trí theo previewScale
      const scaledWidth = width * previewScale;
      const scaledHeight = height * previewScale;
      const scaledTop = top * previewScale;
      const scaledLeft = left * previewScale;
      const scaledTransformX = (transformX || 0) * previewScale;
      const scaledTransformY = (transformY || 0) * previewScale;
      
      let elementStyle = { 
        zIndex,
        width: `${scaledWidth}px`,
        height: `${scaledHeight}px`,
        top: `${scaledTop}px`,
        left: `${scaledLeft}px`,
        transform: `translate(${scaledTransformX}px, ${scaledTransformY}px)${flipScale}`
      };
      
      let pStyle = {}; 
      if (type === 'text' && style) {
        const fontName = systemFonts.find(f => f.file === style.fontFamily)?.name || style.fontFamily;
        const scaledOutlineWidth = (style.outlineWidth || 0) * previewScale;
        const scaledShadowDepth = (style.shadowDepth || 0) * previewScale;
        const scaledBoxPadding = (style.boxPadding || 0) * previewScale;
        const scaledFontSize = (style.reactFontSize || 70) * previewScale;
        elementStyle = {
          ...elementStyle,
          fontFamily: fontName, 
          fontSize: `${scaledFontSize}px`,
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
      } else if ((type === 'image' || type === 'thumbnail') && source) {
        elementStyle.backgroundImage = `url('${source}')`;
        elementStyle.backgroundSize = '100% 100%';
        elementStyle.backgroundPosition = 'center';
        elementStyle.backgroundRepeat = 'no-repeat';
      }
      return (
        <div
          key={id} id={id} data-type={type}
          className={classNames} style={elementStyle}
          onClick={(e) => { e.stopPropagation(); handleElementSelect(id); }}
          data-aspect-ratio={aspectRatio || 0}
          data-flip={flip || 'none'}
        >
          {(type === 'text' || !source) && (
            <p style={pStyle}>{content ? content : type.toUpperCase()}</p>
          )}
        </div>
      );
    });
  }, [elements, showPartText, selectedElementId, systemFonts]);

  const handleDownloadUpdate = () => {
    setIsDownloadingUpdate(true);
    setUpdateStatus('Bắt đầu tải bản cập nhật...');
    window.electronAPI.startDownload();
  };
  const handleInstallUpdate = () => {
    window.electronAPI.quitAndInstall();
  };
  
  const controlRefs = { durationInputRef, partsInputRef, savePathInputRef, logOutputRef };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">R</span>
          <div>
            <strong>RenderTool</strong>
            <span>Cắt và dựng video</span>
          </div>
        </div>
      </header>
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
        playbackSpeed={playbackSpeed}
        onPlaybackSpeedChange={(e) => setPlaybackSpeed(e.target.value)}
        onOpenLogModal={() => setIsLogModalOpen(true)}
        
        splitMode={splitMode}
        onSplitModeChange={(e) => setSplitMode(e.target.value)}
        
        updateStatus={updateStatus}
        isUpdateAvailable={updateInfo !== null}
        isDownloadingUpdate={isDownloadingUpdate}
        isUpdateDownloaded={isUpdateDownloaded}
        onDownloadUpdate={handleDownloadUpdate}
        onInstallUpdate={handleInstallUpdate}
        
        urlQueue={urlQueue}
        onQueueChange={handleQueueChange}
        sourceMode={sourceMode}
        onSourceModeChange={(e) => setSourceMode(e.target.value)}
        localQueue={localQueue}
        onAddLocalVideos={handleAddLocalVideos}
        onLocalQueueChange={setLocalQueue}
        thumbnailFile={thumbnailFile}
        onPickThumbnail={handlePickThumbnail}
        onClearThumbnail={handleClearThumbnail}
        isPaused={isPaused}
        onPauseToggle={handlePauseToggle}
        showPartText={showPartText}
        onTogglePartText={(checked) => setShowPartText(checked)}
        onUpdateCookies={handleUpdateCookies}
        hasError={hasError}
        onRetryFirst={handleRetryFirst}
        onSkipFirst={handleSkipFirst}
      />
      </div>
    </div>
  );
}

export default App;