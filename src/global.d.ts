import type { Layout, SceneDefinition, VideoController } from './types';

interface JoeScenesRegistry {
  manifest: Array<{ id: number; name: string; html: string; style: string; script: string }>;
  register(definition: SceneDefinition): SceneDefinition;
  get(id: number): SceneDefinition | null;
  all(): SceneDefinition[];
}

interface JoeStoryEngine {
  active: boolean;
  currentSceneId: number;
  getActiveDomainId?(): number;
  getDomainSnapshot?(): unknown;
  navigateToScene?(sceneId: number, options?: { autoplay?: boolean; reason?: string }): Promise<number>;
  registerController?(sceneId: number, root: HTMLElement, video: HTMLVideoElement): VideoController;
  installGlobalHandlers?(): void;
  manualCrossfades?: boolean;
  stackLocked?: boolean;
  lockedViewportHeight?: number;
  getLayerOpacityMultiplier?(id: string): number;
  onRuntimeScroll?(): void;
}

interface SceneLanguageApi {
  readonly language: 'zh' | 'en';
  setLanguage(next: unknown): void;
}

interface SceneRuntimeApi {
  readonly layout: Layout | null;
  readonly previewMode: boolean;
  /** The legacy runtime exposes additional editor/navigation methods. */
  [key: string]: any;
}

declare global {
  interface Window {
    JoeScenes: JoeScenesRegistry;
    JoeSceneRuntime?: SceneRuntimeApi;
    Scene1?: SceneRuntimeApi;
    SceneLanguage?: SceneLanguageApi;
    __joeSimpleVideoStory?: JoeStoryEngine;
    createJoeSimpleVideoController?: (options?: { editMode?: boolean; sceneId?: number; rootId?: string; videoId?: string }) => VideoController | object;
    __lastLensScene?: { x: number; y: number };
    __joeXrayLensState?: unknown;
  }
}

export {};
