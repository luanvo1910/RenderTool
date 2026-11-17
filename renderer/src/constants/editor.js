export const VIDEO_WIDTH = 720;
export const VIDEO_HEIGHT = 1280;

export const defaultTextStyle = {
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

export const initialElements = [
  {
    id: 'video-placeholder', type: 'video', zIndex: 1, source: null,
    width: 600, height: 400, top: 450, left: 60, transformX: 0, transformY: 0,
  },
  {
    id: 'thumbnail-placeholder', type: 'thumbnail', zIndex: 2, source: null,
    width: 600, height: 400, top: 20, left: 60, transformX: 0, transformY: 0,
  },
  {
    id: 'text-placeholder', type: 'text', zIndex: 3, content: 'Part ...', style: { ...defaultTextStyle },
    width: 600, height: 150, top: 900, left: 60, transformX: 0, transformY: 0,
  },
];
