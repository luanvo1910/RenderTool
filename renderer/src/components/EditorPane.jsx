import React, { useEffect, forwardRef } from "react";
import interact from "interactjs";
import TextPropertiesPanel from "./TextPropertiesPanel";

const EditorPane = forwardRef(function EditorPane(props, ref) {
  const { 
    selectedElement, 
    textStyle, 
    systemFonts,
    onStyleChange, 
    onElementSelect 
  } = props;

  const getTextPreviewStyle = () => {
    if (!textStyle) return {};
    const outline = `${textStyle.outlineColor} 0px 0px ${textStyle.outlineWidth}px`;
    const shadow = `${textStyle.shadowColor} ${textStyle.shadowDepth}px ${textStyle.shadowDepth}px 2px`;
    return {
      fontFamily: textStyle.fontFamily,
      fontSize: `${textStyle.fontSize}px`,
      color: textStyle.fontColor,
      fontWeight: textStyle.isBold ? "bold" : "normal",
      fontStyle: textStyle.isItalic ? "italic" : "normal",
      textShadow: `${outline}, ${shadow}`,
    };
  };

  useEffect(() => {
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
        },
        inertia: true,
        modifiers: [
          interact.modifiers.restrictRect({
            restriction: "parent",
            endOnly: true,
          }),
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
        },
        inertia: true,
      });

    interact("#element-properties").draggable({
      inertia: true,
      modifiers: [
        interact.modifiers.restrictRect({
          restriction: "parent",
          endOnly: true,
        }),
      ],
      autoScroll: true,
      listeners: {
        move(event) {
          const target = event.target;
          const x = (parseFloat(target.getAttribute("data-x")) || 0) + event.dx;
          const y = (parseFloat(target.getAttribute("data-y")) || 0) + event.dy;
          target.style.transform = `translate(${x}px, ${y}px)`;
          target.setAttribute("data-x", x);
          target.setAttribute("data-y", y);
        },
      },
    });
  }, []);

  const handleElementClick = (e) => {
    e.stopPropagation();
    onElementSelect(e.currentTarget);
  };

  const handleContextMenu = (e) => {
    e.preventDefault();
    const target = e.target.closest(".edit-item");
    if (target) {
      onElementSelect(target);
      window.electronAPI.showContextMenu(target.id, target.dataset.type);
    }
  };
  
  return (
    <div className="editor-pane">
      {selectedElement && selectedElement.dataset.type === "text" && (
        <TextPropertiesPanel
          textStyle={textStyle}
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
          {props.children}
        </div>
      </div>
    </div>
  );
});

export default EditorPane;