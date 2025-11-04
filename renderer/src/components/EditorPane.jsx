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
    onElementUpdate
  } = props;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    if (interact('.edit-item').off) {
        interact('.edit-item').off();
    }
    
    const { offsetWidth: canvasWidth, offsetHeight: canvasHeight } = canvas;
    const snapRange = 15;

    const snapTargets = [
      interact.snappers.grid({
        x: canvasWidth / 2,   
        y: canvasHeight / 2,  
        range: snapRange,
        offset: { x: 0, y: 0 } 
      }),
    ];

    interact(".edit-item")
      .draggable({
        listeners: { 
          move(event) {
            const target = event.target;
            const x = (parseFloat(target.getAttribute("data-x")) || 0) + event.dx;
            const y = (parseFloat(target.getAttribute("data-y")) || 0) + event.dy;
            
            target.style.transform = `translate(${x}px, ${y}px)`;

            target.setAttribute("data-x", x);
            target.setAttribute("data-y", y);
          },
          end(event) {
            const target = event.target;
            if (onElementUpdate) {
              onElementUpdate(target.id, {
                width: parseFloat(target.style.width),
                height: parseFloat(target.style.height),
                top: parseFloat(target.style.top),
                left: parseFloat(target.style.left),
                transformX: parseFloat(target.getAttribute("data-x")) || 0,
                transformY: parseFloat(target.getAttribute("data-y")) || 0
              });
            }
          }
        },
        inertia: true,
        modifiers: [
          interact.modifiers.restrictRect({ 
            restriction: "parent", 
            endOnly: true 
          }),
          interact.modifiers.snap({
            targets: snapTargets,
            relativePoints: [
              { x: 0.5, y: 0.5 }, { x: 0, y: 0.5 }, { x: 1, y: 0.5 }, { x: 0.5, y: 0 }, { x: 0.5, y: 1 },
            ],
            offset: 'parent',
          })
        ],
      })
      .resizable({
        edges: { top: true, left: true, bottom: true, right: true },
        listeners: { 
          move: function (event) {
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
          },
          end(event) {
            const target = event.target;
             if (onElementUpdate) {
              onElementUpdate(target.id, {
                width: event.rect.width,
                height: event.rect.height,
                top: parseFloat(target.style.top),
                left: parseFloat(target.style.left),
                transformX: parseFloat(target.getAttribute("data-x")) || 0,
                transformY: parseFloat(target.getAttribute("data-y")) || 0
              });
            }
          }
        },
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

  }, [elements.length, ref, onElementUpdate]); 

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