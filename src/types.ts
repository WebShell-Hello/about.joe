/** Shared data contracts for the vanilla Scene Engine. */

export type SceneId = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type LayerType = 'text' | 'image' | 'video' | 'control' | 'scroll';
export type VideoPhase = 'hold-start' | 'playing' | 'paused' | 'transitioning' | 'returning';
export type DisplayGroup = 'reality' | 'digital' | 'spring' | 'summer' | 'autumn' | 'winter' | string;

export interface BilingualText {
  en: string;
  zh: string;
}

export interface TextStyle {
  fontSize?: number | null;
  fontWeight?: number | null;
  letterSpacing?: number | null;
  lineHeight?: number | null;
  color?: string | null;
  align?: 'left' | 'center' | 'right' | null;
  fontFamily?: string;
}

export interface ImageStyle {
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
}

export interface LayerBase {
  scene: SceneId;
  role?: string;
  core?: boolean;
  name: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  z: number;
  visible: boolean;
  locked: boolean;
  flow?: boolean;
  /** Visual group used by the Scene 1 perspective switcher. */
  displayGroup?: DisplayGroup;
  /** Runtime-only relationship metadata used by the X-ray compositor. */
  xrayLayer?: boolean;
  xrayPairOf?: string;
}

export interface TextLayer extends LayerBase {
  type: 'text';
  text?: string | BilingualText;
  localized?: boolean;
  texts?: Partial<BilingualText>;
  textStyle?: TextStyle;
  boxWidth?: number | null;
  displayTiming?: {
    /** Delay after entering the owning scene before the text becomes visible. */
    enterDelayMs?: number;
    /** Optional visible duration; zero keeps the text visible for the scene. */
    visibleForMs?: number;
  };
  link?: { href: string; target?: '_self' | '_blank'; offset?: number } | null;
}

export interface ImageLayer extends LayerBase {
  type: 'image';
  src: string;
  assetId?: string;
  fileName?: string;
  width: number;
  height: number;
  sourceWidth?: number | null;
  sourceHeight?: number | null;
  imageStyle?: ImageStyle;
}

export interface VideoLayer extends LayerBase {
  type: 'video';
  src: string;
  poster?: string;
  fileName?: string;
  width: number;
  height: number;
  sourceWidth?: number | null;
  sourceHeight?: number | null;
  fit?: 'cover' | 'contain' | 'fill';
  playbackRate?: number;
}

export interface ControlLayer extends LayerBase { type: 'control' | 'scroll'; }
export type Layer = TextLayer | ImageLayer | VideoLayer | ControlLayer;

/** Legacy/local-storage shape accepted before normalisation into Layout. */
export type LayoutCandidate = Partial<Layout> & Record<string, unknown>;

export interface ProjectAssetRecord {
  dataUrl: string;
  fileName?: string;
}

export interface ProjectExportPayload {
  format: 'joe-scene1-project' | 'joe-multiscene-project';
  layout: Layout;
  assets?: Record<string, ProjectAssetRecord>;
  [key: string]: unknown;
}

export type DynamicLayer = Exclude<Layer, ControlLayer>;

export interface SceneTransition {
  lift: number;
  foregroundSpeed: number;
  backgroundSpeed: number;
  bottomShade: number;
  dwellRatio: number;
  crossfadeMs?: number;
}

export interface SceneBackground {
  x: number;
  y: number;
  zoom: number;
  src: string;
  fileName?: string;
  sourceWidth?: number | null;
  sourceHeight?: number | null;
}

export interface Layout {
  version: number;
  siteTitle: BilingualText;
  layers: Record<string, Layer>;
  deletedLayers: string[];
  bindings: Record<string, { id: string; mode: 'absolute'; name: string; members: string[] }>;
  xray: Record<string, number>;
  digitalRain: { density: number; digitSize: number };
  backgroundPerspectiveBinding: {
    enabled: boolean;
    offsetX: number;
    offsetY: number;
    scaleRatio: number;
  } | null;
  transition: SceneTransition;
  sceneTransitions: Partial<Record<SceneId, SceneTransition>>;
  cinematicSettings: { pauseInertiaMs: number };
  background: SceneBackground;
  sceneBackgrounds: Partial<Record<SceneId, SceneBackground>>;
  sceneVisibility: Partial<Record<SceneId, boolean>>;
  sceneShades: Partial<Record<SceneId, { top: number; bottom: number }>>;
}

export interface SceneDefinition {
  id: SceneId;
  name: string;
  rootId: string;
  stageId: string;
  dynamicAnchorId: string;
  shade?: { topId: string; bottomId: string };
  layers: Record<string, Layer>;
  createController?: (options?: { editMode?: boolean }) => VideoController | Record<string, never>;
}

export interface VideoController {
  id: SceneId;
  root: HTMLElement;
  video: HTMLVideoElement;
  phase: VideoPhase;
  ready: boolean;
  pausePending: boolean;
  captionStartedAt: number;
  captionElapsedMs: number;
  finalFrameCanvas: HTMLCanvasElement | null;
  mountedFinalFrame: HTMLElement | null;
  finalFrameMediaTime: number;
  firstFrameOverlay: HTMLElement | null;
  frameCallbackId: number;
  onScroll(): void;
  resetForNextEntry(): void;
}
