import React, { useEffect, forwardRef } from "react";
import interact from "interactjs";
import TextPropertiesPanel from "./TextPropertiesPanel";

const EditorPane = forwardRef(function EditorPane(props, ref) {
  const {
    elements,
    children, 
    selectedElement,
    systemFonts,
    onElementSelect,
    onStyleChange,
  } = props;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    if (interact('.edit-item').off) {
        interact('.edit-item').off();
    }
    
    // =================================================================
    // <<< SỬA LỖI TÍNH NĂNG SNAP (HÍT) TẠI ĐÂY >>>
    // =================================================================
    
    const { offsetWidth: canvasWidth, offsetHeight: canvasHeight } = canvas;
    const snapRange = 15; // Khoảng cách hít (pixel)

    // <<< SỬA ĐỔI: Gộp thành MỘT lưới duy nhất >>>
    // Tạo một lưới duy nhất có đường kẻ ở các cạnh (0, 0)
    // và ở giữa (width/2, height/2)
    const snapTargets = [
      interact.snappers.grid({
        x: canvasWidth / 2,   // Kẻ 1 đường dọc ở 50%
        y: canvasHeight / 2,  // Kẻ 1 đường ngang ở 50%
        range: snapRange,
        offset: { x: 0, y: 0 } // Bắt đầu lưới ở (0, 0)
      }),
    ];

    interact(".edit-item")
      .draggable({
        listeners: { move(event) {
            const target = event.target;
            const x = (parseFloat(target.getAttribute("data-x")) || 0) + event.dx;
            const y = (parseFloat(target.getAttribute("data-y")) || 0) + event.dy;
            target.style.transform = `translate(${x}px, ${y}px)`;
            target.setAttribute("data-x", x);
            target.setAttribute("data-y", y);
        }},
        inertia: true,
        modifiers: [
          interact.modifiers.restrictRect({ 
            restriction: "parent", 
            endOnly: true 
          }),
          
          interact.modifiers.snap({
            targets: snapTargets,
            relativePoints: [
              { x: 0.5, y: 0.5 }, // hít bằng tâm
              { x: 0, y: 0.5 },   // hít bằng cạnh trái
              { x: 1, y: 0.5 },   // hít bằng cạnh phải
              { x: 0.5, y: 0 },   // hít bằng cạnh trên
              { x: 0.5, y: 1 },   // hít bằng cạnh dưới
            ],
            offset: 'parent',
            // endOnly: true // Đã xóa ở bước trước
          })
        ],
      })
      .resizable({
        edges: { top: true, left: true, bottom: true, right: true },
        listeners: { move: function (event) {
            const target = event.target;
            let x = parseFloat(target.getAttribute("data-x")) || 0;
            let y = parseFloat(target.getAttribute("data-y")) || 0;
            target.style.width = `${event.rect.width}px`;
            target.style.height = `${event.rect.height}px`;
            x += event.deltaRect.left;
            y += event.deltaRect.top;
            target.style.transform = `translate(${x}px, ${y}px)`;
            target.setAttribute("data-x", x);
            target.setAttribute("data-y", y);
        }},
        inertia: true,
      });

    interact("#element-properties").draggable({
        allowFrom: 'h4',
        inertia: true,
        modifiers: [interact.modifiers.restrictRect({ restriction: "parent", endOnly: true })],
        listeners: { move(event) {
            const target = event.target;
            const x = (parseFloat(target.getAttribute("data-x")) || 0) + event.dx;
            const y = (parseFloat(target.getAttribute("data-y")) || 0) + event.dy;
            target.style.transform = `translate(${x}px, ${y}px)`;
            target.setAttribute("data-x", x);
            target.setAttribute("data-y", y);
        }},
    });

  }, [elements.length, ref]); // Thêm ref vào dependency array

  const handleContextMenu = (e) => {
    e.preventDefault();
    const target = e.target.closest(".edit-item");
    if (target) {
      onElementSelect(target.id);
      window.electronAPI.showContextMenu(target.id, target.dataset.type);
    }
  };

  return (
    <div className="editor-pane">
      {selectedElement?.type === "text" && (
        <TextPropertiesPanel
          element={selectedElement}
          systemFonts={systemFonts}
          onStyleChange={onStyleChange}
        />
      )}
      <div id="canvas-container">
        <div
          id="editor-canvas"
          ref={ref}
          onContextMenu={handleContextMenu}
          onClick={() => onElementSelect(null)}
          className="canvas-720-1280"
        >
          {children}
        </div>
      </div>
    </div>
  );
});

export default EditorPane;