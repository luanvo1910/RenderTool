document.addEventListener('DOMContentLoaded', () => {
    // --- KHAI BÁO CÁC BIẾN CHO GIAO DIỆN ---
    const canvas = document.getElementById('editor-canvas');
    const runButton = document.getElementById('runButton');
    const addImageButton = document.getElementById('addImageButton');
    const logOutput = document.getElementById('log-output');
    const urlInput = document.getElementById('youtube-url');
    const durationInput = document.getElementById('part-duration');
    const partsInput = document.getElementById('parts-input');
    const videoList = document.getElementById('video-list');
    const savePathInput = document.getElementById('save-path-input');
    const browseButton = document.getElementById('browseButton');
    const saveTemplateButton = document.getElementById('saveTemplateButton');
    const templateNameInput = document.getElementById('template-name-input');
    const templateListDiv = document.getElementById('template-list');
    const newProjectButton = document.getElementById('newProjectButton');
    const hiddenFontColorPicker = document.getElementById('hidden-font-color-picker');
    const hiddenBoxColorPicker = document.getElementById('hidden-box-color-picker');
    const hiddenShadowColorPicker = document.getElementById('hidden-shadow-color-picker');
    const enlargeLogButton = document.getElementById('enlargeLogButton');
    const logModal = document.getElementById('log-modal');
    const modalLogOutput = document.getElementById('modal-log-output');
    const closeModalButton = document.getElementById('closeModalButton');

    let allTemplates = [];
    let selectedElement = null;

    // --- LOGIC KÉO THẢ VÀ THAY ĐỔI KÍCH THƯỚC ---
    interact('.edit-item')
        .draggable({
            listeners: {
                move(event) {
                    const target = event.target;
                    const x = (parseFloat(target.getAttribute('data-x')) || 0) + event.dx;
                    const y = (parseFloat(target.getAttribute('data-y')) || 0) + event.dy;
                    target.style.transform = `translate(${x}px, ${y}px)`;
                    target.setAttribute('data-x', x);
                    target.setAttribute('data-y', y);
                }
            },
            inertia: true,
            modifiers: [interact.modifiers.restrictRect({ restriction: 'parent', endOnly: true })]
        })
        .resizable({
            edges: { top: true, left: true, bottom: true, right: true },
            listeners: {
                move: function (event) {
                    const target = event.target;
                    let x = parseFloat(target.getAttribute('data-x')) || 0;
                    let y = parseFloat(target.getAttribute('data-y')) || 0;
                    target.style.width = `${event.rect.width}px`;
                    target.style.height = `${event.rect.height}px`;
                    x += event.deltaRect.left;
                    y += event.deltaRect.top;
                    target.style.transform = `translate(${x}px, ${y}px)`;
                    target.setAttribute('data-x', x);
                    target.setAttribute('data-y', y);
                }
            },
            inertia: true,
        });

    // --- LOGIC MENU CHUỘT PHẢI VÀ CHỌN ĐỐI TƯỢNG ---
    function selectElement(element) {
        document.querySelectorAll('.edit-item.selected').forEach(el => el.classList.remove('selected'));
        selectedElement = element;
        if (selectedElement) {
            selectedElement.classList.add('selected');
        }
    }

    canvas.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const target = e.target;
        if (target.classList.contains('edit-item')) {
            selectElement(target);
            window.electronAPI.showContextMenu(target.id, target.dataset.type);
        }
    });

    canvas.addEventListener('click', (e) => {
        if (!e.target.classList.contains('edit-item')) {
            selectElement(null);
        }
    });

    window.electronAPI.onContextMenuCommand(({ elementId, action }) => {
        const target = document.getElementById(elementId);
        if (!target) return;

        switch (action) {
            case 'bring-forward':
                if (target.nextElementSibling) {
                    target.parentNode.insertBefore(target.nextElementSibling, target);
                }
                break;
            case 'send-backward':
                if (target.previousElementSibling) {
                    target.parentNode.insertBefore(target, target.previousElementSibling);
                }
                break;
            case 'delete-element':
                if (confirm('Bạn có chắc muốn xóa đối tượng này?')) {
                    target.remove();
                }
                break;
            case 'change-font-color':
                hiddenFontColorPicker.oninput = () => { target.dataset.fontColor = hiddenFontColorPicker.value; };
                hiddenFontColorPicker.click();
                break;
            case 'change-box-color':
                hiddenBoxColorPicker.oninput = () => {
                    target.dataset.boxColor = hiddenBoxColorPicker.value;
                    let opacity = Math.round(parseFloat(target.dataset.boxOpacity || '0.8') * 255).toString(16).padStart(2, '0');
                    target.style.backgroundColor = `${hiddenBoxColorPicker.value}${opacity}`;
                };
                hiddenBoxColorPicker.click();
                break;
            case 'change-shadow-color':
                hiddenShadowColorPicker.oninput = () => { target.dataset.shadowColor = hiddenShadowColorPicker.value; };
                hiddenShadowColorPicker.click();
                break;
        }
    });

    // --- CÁC HÀM XỬ LÝ SỰ KIỆN NÚT BẤM ---
    browseButton.addEventListener('click', async () => {
        const path = await window.electronAPI.openDirectoryDialog();
        if (path) { savePathInput.value = path; }
    });
        
    addImageButton.addEventListener('click', async () => {
        const filePath = await window.electronAPI.openImageDialog();
        if (filePath) {
            const newImage = document.createElement('div');
            newImage.style.backgroundImage = `url('${filePath.replace(/\\/g, '/')}')`;
            newImage.className = 'edit-item custom-image';
            newImage.setAttribute('data-type', 'image');
            newImage.setAttribute('data-source', filePath);
            newImage.id = `image-${Date.now()}`;
            canvas.appendChild(newImage);
            interact(newImage);
        }
    });

    // --- LOGIC QUẢN LÝ TEMPLATE ---
    function captureLayoutData() {
        const scaleFactor = 720 / canvas.offsetWidth;
        const layoutData = [];
        document.querySelectorAll('#editor-canvas > .edit-item').forEach((el, index) => {
            const transformX = parseFloat(el.getAttribute('data-x')) || 0;
            const transformY = parseFloat(el.getAttribute('data-y')) || 0;
            const initialX = el.offsetLeft;
            const initialY = el.offsetTop;
            const finalX = initialX + transformX;
            const finalY = initialY + transformY;
            const itemData = {
                id: el.id, type: el.dataset.type,
                x: Math.round(finalX * scaleFactor), y: Math.round(finalY * scaleFactor),
                width: Math.round(el.offsetWidth * scaleFactor), height: Math.round(el.offsetHeight * scaleFactor),
                zIndex: index, source: el.dataset.source || null,
                ui: { x: transformX, y: transformY, width: el.offsetWidth, height: el.offsetHeight }
            };
            if (el.dataset.type === 'text') {
                itemData.fontColor = el.dataset.fontColor;
                itemData.boxColor = el.dataset.boxColor;
                itemData.boxOpacity = el.dataset.boxOpacity;
                itemData.shadowColor = el.dataset.shadowColor;
            }
            layoutData.push(itemData);
        });
        return layoutData;
    }

    function applyLayout(layoutData) {
        document.querySelectorAll('.custom-image').forEach(el => el.remove());
        layoutData.forEach(itemData => {
            let element = document.getElementById(itemData.id);
            if (!element && itemData.type === 'image') {
                element = document.createElement('div');
                element.id = itemData.id;
                element.className = 'edit-item custom-image';
                element.dataset.type = 'image';
                element.dataset.source = itemData.source;
                element.style.backgroundImage = `url('${itemData.source.replace(/\\/g, '/')}')`;
                canvas.appendChild(element);
                interact(element);
            }
            if (element && itemData.ui) {
                element.style.width = `${itemData.ui.width}px`;
                element.style.height = `${itemData.ui.height}px`;
                element.style.transform = `translate(${itemData.ui.x}px, ${itemData.ui.y}px)`;
                element.setAttribute('data-x', itemData.ui.x);
                element.setAttribute('data-y', itemData.ui.y);
            }
        });
    }

    async function loadAndRenderTemplates() {
        allTemplates = await window.electronAPI.getTemplates();
        templateListDiv.innerHTML = '';
        allTemplates.forEach(template => {
            const item = document.createElement('div');
            item.className = 'template-item';
            item.dataset.id = template.id;
            item.textContent = template.name;
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn';
            deleteBtn.textContent = 'X';
            item.appendChild(deleteBtn);
            templateListDiv.appendChild(item);
            item.addEventListener('click', (e) => {
                if (e.target !== deleteBtn) {
                    applyLayout(template.layout);
                    document.querySelectorAll('.template-item.active').forEach(i => i.classList.remove('active'));
                    item.classList.add('active');
                }
            });
            deleteBtn.addEventListener('click', async () => {
                if (confirm(`Bạn có chắc muốn xóa mẫu "${template.name}"?`)) {
                    await window.electronAPI.deleteTemplate(template.id);
                    await loadAndRenderTemplates();
                }
            });
        });
    }

    saveTemplateButton.addEventListener('click', async () => {
        const templateName = templateNameInput.value.trim();
        if (!templateName) {
            alert("Vui lòng nhập tên cho mẫu layout.");
            return;
        }
        const newTemplate = {
            id: `template-${Date.now()}`,
            name: templateName,
            layout: captureLayoutData()
        };
        await window.electronAPI.saveTemplate(newTemplate);
        templateNameInput.value = '';
        await loadAndRenderTemplates();
    });
    
    // --- LOGIC CHẠY RENDER VÀ RESET ---
    function resetInterface() {
        urlInput.value = '';
        logOutput.textContent = '';
        modalLogOutput.textContent = '';
        videoList.innerHTML = '';
        newProjectButton.classList.add('hidden');
        document.querySelectorAll('.custom-image').forEach(el => el.remove());
        const placeholders = document.querySelectorAll('#video-placeholder, #thumbnail-placeholder, #text-placeholder');
        placeholders.forEach(el => {
            el.style.transform = '';
            el.style.width = '';
            el.style.height = '';
            el.removeAttribute('data-x');
            el.removeAttribute('data-y');
        });
        runButton.disabled = false;
        selectElement(null);
    }

    newProjectButton.addEventListener('click', resetInterface);

    runButton.addEventListener('click', () => {
        if (!urlInput.value) { return alert('Vui lòng nhập link YouTube.'); }
        const layoutData = captureLayoutData();
        logOutput.textContent = 'Bắt đầu gửi dữ liệu layout và xử lý...\n';
        videoList.innerHTML = '';
        runButton.disabled = true;
        window.electronAPI.runProcessWithLayout({
            url: urlInput.value,
            parts: partsInput.value,
            partDuration: durationInput.value,
            savePath: savePathInput.value,
            layout: layoutData
        });
    });

    // --- LOGIC LOG VÀ CỬA SỔ LOG ---
    enlargeLogButton.addEventListener('click', () => {
        modalLogOutput.textContent = logOutput.textContent;
        modalLogOutput.scrollTop = modalLogOutput.scrollHeight;
        logModal.classList.remove('hidden');
    });

    closeModalButton.addEventListener('click', () => {
        logModal.classList.add('hidden');
    });

    logModal.addEventListener('click', (e) => {
        if (e.target === logModal) {
            logModal.classList.add('hidden');
        }
    });

    window.electronAPI.onProcessLog((logLine) => {
        const text = logLine + '\n';
        logOutput.textContent += text;
        modalLogOutput.textContent += text;
        logOutput.scrollTop = logOutput.scrollHeight;
        modalLogOutput.scrollTop = modalLogOutput.scrollHeight;
        
        if (logLine.startsWith('RESULT:')) {
            const filePath = logLine.replace('RESULT:', '').trim();
            const videoItem = document.createElement('video');
            videoItem.src = filePath;
            videoItem.controls = true;
            videoItem.style.width = '100%';
            videoItem.style.marginTop = '1rem';
            videoList.appendChild(videoItem);
        } else if (logLine.includes('--- Tiến trình kết thúc ---')) {
            runButton.disabled = false;
            newProjectButton.classList.remove('hidden');
        }
    });

    // Tải template lần đầu khi ứng dụng khởi động
    loadAndRenderTemplates();
});