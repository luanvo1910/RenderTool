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

    // Cleanup previous interact instances
    interact('.edit-item').unset();
    interact('#element-properties').unset();

    const withFlip = (target, x, y) => {
      const flip = target.getAttribute("data-flip") || "none";
      const scaleX = flip === "horizontal" || flip === "both" ? -1 : 1;
      const scaleY = flip === "vertical" || flip === "both" ? -1 : 1;
      const scale = scaleX === 1 && scaleY === 1 ? "" : ` scale(${scaleX}, ${scaleY})`;
      return `translate(${x}px, ${y}px)${scale}`;
    };

    const readTranslate = (target) => {
      const attrX = target.getAttribute("data-x");
      const attrY = target.getAttribute("data-y");
      if (attrX !== null && attrY !== null) {
        return { x: parseFloat(attrX) || 0, y: parseFloat(attrY) || 0 };
      }
      const match = (target.style.transform || "").match(/translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px\)/);
      if (match) {
        return { x: parseFloat(match[1]) || 0, y: parseFloat(match[2]) || 0 };
      }
      return { x: 0, y: 0 };
    };

    const editItemInteract = interact(".edit-item")
      .draggable({
        listeners: { 
          move(event) {
            const target = event.target;
            const x = (parseFloat(target.getAttribute("data-x")) || 0) + event.dx;
            const y = (parseFloat(target.getAttribute("data-y")) || 0) + event.dy;
            
            target.style.transform = withFlip(target, x, y);

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
          })
        ],
      })
      .resizable({
        edges: { top: true, left: true, bottom: true, right: true },
        listeners: { 
          start(event) {
            const target = event.target;
            const { x, y } = readTranslate(target);
            target.setAttribute("data-x", x);
            target.setAttribute("data-y", y);
            target.setAttribute("data-gap-w", "0");
            target.setAttribute("data-gap-h", "0");
          },
          move: function (event) {
            const target = event.target;
            const edges = event.edges || {};
            let x = parseFloat(target.getAttribute("data-x")) || 0;
            let y = parseFloat(target.getAttribute("data-y")) || 0;
            let width = event.rect.width;
            let height = event.rect.height;
            const aspect = parseFloat(target.getAttribute("data-aspect-ratio"));

            if (target.dataset.type === "image" && aspect > 0) {
              if (edges.left || edges.right) {
                height = width / aspect;
              } else {
                width = height * aspect;
              }
              const gapW = width - event.rect.width;
              const gapH = height - event.rect.height;
              const prevGapW = parseFloat(target.getAttribute("data-gap-w")) || 0;
              const prevGapH = parseFloat(target.getAttribute("data-gap-h")) || 0;
              if (edges.left) x -= gapW - prevGapW;
              if (edges.top) y -= gapH - prevGapH;
              target.setAttribute("data-gap-w", gapW);
              target.setAttribute("data-gap-h", gapH);
            }

            target.style.width = `${width}px`;
            target.style.height = `${height}px`;

            x += event.deltaRect.left;
            y += event.deltaRect.top;
            target.style.transform = withFlip(target, x, y);

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
      });

    const propertiesInteract = interact("#element-properties").draggable({
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

    // Cleanup function
    return () => {
      editItemInteract.unset();
      propertiesInteract.unset();
    };
  }, [elements.length, ref, onElementUpdate]); 

  const handleContextMenu = (e) => {
    e.preventDefault();
    const target = e.target.closest(".edit-item");
    if (target) {
      onElementSelect(target.id);
      window.electronAPI.showContextMenu(target.id, target.dataset.type, target.dataset.flip || "none");
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