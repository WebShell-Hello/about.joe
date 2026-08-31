(() => {
  'use strict';
  /** @typedef {import('../src/types').Layout} Layout */
  /** @typedef {import('../src/types').Layer} Layer */
  /** @typedef {import('../src/types').ProjectExportPayload} ProjectExportPayload */
  /** @typedef {import('../src/types').DynamicLayer} DynamicLayer */

  /**
   * Editor consumes the legacy runtime as a command surface. Keeping this
   * boundary explicit lets the editor evolve independently from the renderer.
   * @typedef {{
   *   layout: Layout,
   *   applyLayout: () => void,
   *   applyLayer: (id: string) => void,
   *   flushLayout: () => Promise<unknown>,
   *   commitEditSession: () => Promise<unknown>,
   *   discardEditSession: () => Promise<unknown>,
   *   exportProject: () => Promise<unknown>,
   *   importProject: (payload: unknown) => Promise<unknown>,
   *   addTextLayer: (text: string, sceneId: number) => string,
   *   addImageLayer: (file: File, sceneId: number) => Promise<string>,
   *   removeLayer: (id: string) => Promise<unknown>,
   *   replaceVideoLayer: (id: string, file: File) => Promise<unknown>,
   *   [key: string]: any
   * }} EditorRuntime
   */
  let __joeMode = 'normal';
  try { __joeMode = sessionStorage.getItem('joe-view-mode-v1') || 'normal'; } catch (_) {}
  if (__joeMode !== 'edit') return;

  /** @type {EditorRuntime} */
  const S = /** @type {EditorRuntime} */ (/** @type {unknown} */ (window.Scene1));
  const sceneRegistry = window.JoeScenes;
  /** @param {string} id @returns {HTMLInputElement} */
  const inputById = id => /** @type {HTMLInputElement} */ (document.getElementById(id));
  /** @param {string} id @returns {HTMLSelectElement} */
  const selectById = id => /** @type {HTMLSelectElement} */ (document.getElementById(id));
  /** @param {string} id @returns {HTMLButtonElement} */
  const buttonById = id => /** @type {HTMLButtonElement} */ (document.getElementById(id));
  /** @param {string} id @returns {HTMLTextAreaElement} */
  const textareaById = id => /** @type {HTMLTextAreaElement} */ (document.getElementById(id));
  /** @param {string} id @returns {HTMLOutputElement} */
  const outputById = id => /** @type {HTMLOutputElement} */ (document.getElementById(id));
  /** @param {Event} event @returns {File|null} */
  const firstFileFromEvent = event => {
    const input = event.target instanceof HTMLInputElement ? event.target : null;
    return input?.files?.[0] || null;
  };
  const stage = document.getElementById('designStage');
  const sceneOneShell = document.getElementById('sceneOneShell');
  const panel = document.getElementById('propertiesPanel');
  const layerList = document.getElementById('layerList');
  const selectionBox = document.getElementById('selectionBox');
  const selectionLabel = document.getElementById('selectionLabel');
  const selectedName = document.getElementById('selectedName');
  const selectionCount = document.getElementById('selectionCount');
  const saveStatus = document.getElementById('saveStatus');
  const guides = document.getElementById('stageGuides');
  const textControls = document.getElementById('textControls');
  const imageControls = document.getElementById('imageControls');
  const imageInfo = document.getElementById('imageInfo');
  const imageWidth = inputById('imageWidth');
  const imageHeight = inputById('imageHeight');
  const restoreImageAspect = buttonById('restoreImageAspect');
  const restoreImageSize = buttonById('restoreImageSize');
  const deleteLayerBtn = buttonById('deleteLayer');
  const bindBtn = buttonById('bindLayers');
  const unbindBtn = buttonById('unbindLayers');
  const editorEl = document.getElementById('editor');
  const editorScrollShell = document.getElementById('editorScrollShell');
  const editorDragHandle = document.getElementById('editorDragHandle');
  const undoBtn = buttonById('undoEdit');
  const redoBtn = buttonById('redoEdit');
  const collapseBtn = buttonById('collapseEditor');
  const editorResizeHandle = document.getElementById('editorResizeHandle');
  const editorDragBorders = Array.from(document.querySelectorAll('[data-editor-drag-border]'));
  const previewLink = document.getElementById('previewLink');
  const currentLayerRank = document.getElementById('currentLayerRank');
  const displayGroup = selectById('displayGroup');
  const editorSceneLabel = document.getElementById('editorSceneLabel');
  const currentSceneHint=document.getElementById('currentSceneHint');
  const toggleSceneVisibility=document.getElementById('toggleSceneVisibility');
  const sceneVisibilityStatus=document.getElementById('sceneVisibilityStatus');
  const videoControls = document.getElementById('videoControls');
  const videoFit = selectById('videoFit');
  const videoScrub = inputById('videoScrub');
  const videoScrubOut = outputById('videoScrubOut');
  const videoOpacity = inputById('videoOpacity');
  const videoOpacityOut = outputById('videoOpacityOut');
  const videoSpeed = inputById('videoSpeed');
  const videoSpeedOut = outputById('videoSpeedOut');
  const replaceSelectedVideo = buttonById('replaceSelectedVideo');
  const videoSceneHint = document.getElementById('videoSceneHint');
  const videoFileInfo = document.getElementById('videoFileInfo');
  const mediaScaleControls = document.getElementById('mediaScaleControls');
  const mediaScaleRange = inputById('mediaScaleRange');
  const mediaScaleNumber = inputById('mediaScaleNumber');
  const mediaScaleOut = outputById('mediaScaleOut');
  const xrayControls = document.getElementById('xrayControls');
  const transitionControls = document.getElementById('transitionControls');
  const videoCrossfadeRow = document.getElementById('videoCrossfadeRow');
  const videoCrossfadeMs = inputById('videoCrossfadeMs');
  const videoCrossfadeMsOut = outputById('videoCrossfadeMsOut');
  const videoPauseInertiaRow = document.getElementById('videoPauseInertiaRow');
  const videoPauseInertiaMs = inputById('videoPauseInertiaMs');
  const videoPauseInertiaMsOut = outputById('videoPauseInertiaMsOut');
  const sceneShadeControls = document.getElementById('sceneShadeControls');
  const sceneShadeHint = document.getElementById('sceneShadeHint');
  const backgroundControls = document.getElementById('backgroundControls');
  const replaceBackgroundImage = buttonById('replaceBackgroundImage');
  const backgroundFileInfo = document.getElementById('backgroundFileInfo');
  const guidesControls = document.getElementById('guidesControls');
  const siteTitleEn = inputById('siteTitleEn');
  const siteTitleZh = inputById('siteTitleZh');

  const imageProps = {
    brightness: inputById('imageBrightness'),
    contrast: inputById('imageContrast'),
    saturation: inputById('imageSaturation'),
    hue: inputById('imageHue')
  };
  const imagePropsOut = {
    brightness: outputById('imageBrightnessOut'),
    contrast: outputById('imageContrastOut'),
    saturation: outputById('imageSaturationOut'),
    hue: outputById('imageHueOut')
  };

  const props = {
    x: inputById('propX'), y: inputById('propY'),
    scale: inputById('propScale'), rotation: inputById('propRotate'),
    opacity: inputById('propOpacity'), z: inputById('propZ')
  };

  const textProps = {
    contentEn: textareaById('textContentEn'),
    contentZh: textareaById('textContentZh'),
    fontFamily: selectById('textFontFamily'),
    boxWidth: inputById('textBoxWidth'),
    fontSize: inputById('textFontSize'),
    fontWeight: inputById('textFontWeight'),
    letterSpacing: inputById('textLetterSpacing'),
    lineHeight: inputById('textLineHeight'),
    color: inputById('textColor'),
    colorHex: inputById('textColorHex'),
    align: selectById('textAlign'),
    enterDelay: inputById('textEnterDelay'),
    visibleFor: inputById('textVisibleFor'),
    linkHref: inputById('textLinkHref'),
    linkTarget: selectById('textLinkTarget'),
    linkOffset: inputById('textLinkOffset')
  };

  const initial = Object.keys(S.layout.layers).find(id => Number(S.layout.layers[id]?.scene) === 1) || null;
  let primaryId = initial || null;
  let selectedIds = new Set(primaryId ? [primaryId] : []);
  let drag = null;
  /** @type {Array<{sourceId: string, state: import('../src/types').TextLayer}>|null} */
  let layerClipboard = null;
  let saveTimer = 0;
  const HISTORY_LIMIT = 20;
  /** @type {string[]} */
  let historyStack = [];
  let historyIndex = -1;
  let historyTimer = 0;
  let applyingHistory = false;
  let activeScene = 1;
  let sceneOneGroupView = 'all';
  const sceneGroupFilter = document.getElementById('sceneGroupFilter');
  const sceneTitleList = document.getElementById('sceneTitleList');
  let sceneSyncing = false;

  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const round = (v, n = 2) => Number(v.toFixed(n));
  const stateFor = (id = primaryId) => S.layout.layers[id];
  /** @param {string} id @returns {Layer|undefined} */
  const layerFor = id => S.layout.layers[id];
  /** @param {Layer|undefined|null} layer @returns {layer is import('../src/types').TextLayer} */
  const isTextLayer = layer => layer?.type === 'text';
  /** @param {Layer|undefined|null} layer @returns {layer is import('../src/types').ImageLayer} */
  const isImageLayer = layer => layer?.type === 'image';
  /** @param {Layer|undefined|null} layer @returns {layer is import('../src/types').VideoLayer} */
  const isVideoLayer = layer => layer?.type === 'video';
  /** @param {Layer|undefined|null} layer @returns {layer is import('../src/types').ImageLayer|import('../src/types').VideoLayer} */
  const isMediaLayer = layer => isImageLayer(layer) || isVideoLayer(layer);
  const elementFor = id => document.querySelector(`[data-layer-id="${CSS.escape(id)}"]`);
  const SCENE_IDS=(sceneRegistry?.manifest||[]).map(entry=>Number(entry.id)).filter(Number.isFinite).sort((a,b)=>a-b);
  const MIN_SCENE_ID=SCENE_IDS.length?Math.min(...SCENE_IDS):0;
  const MAX_SCENE_ID=SCENE_IDS.length?Math.max(...SCENE_IDS):9;
  const layerScene=id=>{const n=Number(stateFor(id)?.scene);return SCENE_IDS.includes(n)?n:MIN_SCENE_ID};
  const sceneStage = scene => S.stageForScene(Number(scene)) || (Number(scene) === 1 ? stage : null);
  const selectedArray = () => [...selectedIds].filter(id => S.layout.layers[id]);
  const isMultiSelectModifier = e => Boolean(e?.metaKey);

  const I18N = {
    en: {
      editorTitle:'Content & Layout Editor', dragToolbar:'drag toolbar', borderDragHint:'drag the 1px outer border', preview:'Preview', siteSettings:'Site settings', browserTab:'browser tab', titleEn:'Title · English', titleZh:'Title · Chinese', siteTitleNote:'The browser tab title follows the current website language.',
      editScene:'Edit scene', hideScene:'Hide current scene', showScene:'Show current scene', sceneVisible:'Visible', sceneHidden:'Hidden', sceneEditNote:'Only the current scene is shown in Edit Mode. Use the scene buttons above to switch scenes; page scrolling is disabled. Hidden scenes can still be opened here and restored.', sceneGroupView:'Scene 1 group view', allGroups:'Both', sceneTitles:'Scene navigation names', bilingual:'English + Chinese',
      video:'Video', videoFit:'Frame fit', videoFrame:'Video frame', videoOpacity:'Video opacity', videoSpeed:'Playback speed', replaceVideo:'Replace selected video', chooseVideo:'Choose video', resetVideo:'First frame', videoNote:'Edit mode keeps the video paused. Drag the frame slider to inspect a still frame; it never starts playback. Video opacity and playback speed are saved with the layer. Click the speed number to type an exact value.',
      layers:'Layers', addText:'+ Text', addImage:'+ Image', bindSelected:'Bind selected', unbind:'Unbind',
      bindingNote:'Hold Command (⌘) while clicking the canvas or layer names to multi-select. Bound layers keep their relative position: moving any member moves the whole bound group by the same X / Y offset, and the group also scrolls together from Scene 1 → 2. Scale, rotation and appearance remain independently editable.',
      transform:'Transform', displayGroup:'Display group', realityGroup:'Reality', digitalGroup:'Digital', scale:'Scale', rotate:'Rotate', opacity:'Opacity', zIndex:'Layer', sendBack:'Send back', bringFront:'Bring front', deleteLayer:'Delete selected layer',
      text:'Text', textEnterDelay:'Show after (ms)', textFadeIn:'Fade-in duration (ms)', spacesPreserved:'English + Chinese are stored together', content:'Content', contentEn:'English', contentZh:'Chinese', fontFamily:'Font', textBoxWidth:'Text box width', fontSize:'Font size', weight:'Weight', letterPx:'Letter px', lineHeight:'Line height', color:'Color', align:'Align', alignLeft:'Left', alignCenter:'Center', alignRight:'Right', linkJump:'Link / Jump', linkOptional:'optional', linkTarget:'Target', linkOpen:'Open', sameTab:'Same tab', newTab:'New tab', jumpOffset:'Jump offset px', linkNote:'Use #section-id for an internal jump, a full URL for a website, or mailto: for email. Links are disabled while Edit Mode is active.',
      mediaScale:'Media scale', mediaScaleNote:'Scale images or videos with the slider, or type an exact number directly.', image:'Image', imageWidth:'Width', imageHeight:'Height', restoreAspect:'Original ratio', restoreSize:'Original size', imageSizeNote:'New images use the uploaded file’s real width/height ratio. Width and Height can then be changed independently, or adjusted with the side handles, for intentional horizontal/vertical stretching.', brightness:'Brightness', contrast:'Contrast', saturation:'Saturation', hue:'Hue', rotateLeft:'↶ 90°', rotateRight:'↷ 90°', resetColor:'Reset color',
      imageNote:'Color adjustments are non-destructive and are stored with the layout. Lower brightness and saturation to make daytime assets sit naturally in the night scene.',
      xrayLens:'X-ray lens', normalPreview:'normal preview', lensRadius:'Lens radius', feather:'Feather', triggerDist:'Trigger dist.', expansionSpeed:'Click expansion (ms)', bodyInLens:'Body in lens', perspective:'Perspective', skeleton:'Skeleton', rainDensity:'Digital rain density', rainDigitSize:'Digit size',
      xrayNote:'Inside the lens, the normal background and character body are cut away so the perspective layers and digital rain stay clear. Rain density and digit size are adjustable independently.',
      sceneTransition:'Scene transition', travel:'Travel', foregroundSpeed:'Foreground speed', backgroundSpeed:'Background speed', bottomDarken:'Bottom darken', pageDwellRatio:'Page dwell ratio', videoCrossfade:'Video crossfade', videoPauseInertia:'Up-scroll pause delay',
      transitionNote:'Page dwell ratio adds a pinned scroll distance after the scene is fully in place. Only after that dwell is consumed does the scene transition begin; scrolling back reverses the transition and restores the saved position.',
      sceneEdgeDarken:'Scene edge darken', topDarken:'Top darken', sceneShadeNote:'Each scene stores its own top and bottom edge gradient strength independently.',
      background:'Main background', mainBackground:'Main background', viewportCover:'viewport cover', replaceBackground:'Replace current scene background', chooseImage:'Choose image', noBackground:'No background image', positionX:'Position X', positionY:'Position Y', zoom:'Zoom', reference:'Reference', editorOnly:'editor only', showReference:'Show “整合版效果”', centerGuides:'Center guides', showGuides:'Show center guides',
      saveReturn:'Save', discardReturn:"Cancel", exportJson:'Export JSON', importJson:'Import JSON', resetDefaults:'Reset to defaults',
      saveStatusDefault:'Editing uses a draft copy. Save commits the draft and returns home; Cancel restores the exact state from when Edit was opened and returns home.',
      keyboardHelp:'⌘ + click = multi-select · Double-click text = edit on canvas<br>Bound layers = move + scroll together · ⌘/Ctrl+Z = Undo · ⇧⌘Z / Ctrl+Y = Redo · 20 edit steps<br>Arrow keys = 1px · Shift + Arrow = 10px',
      hide:'Hide', show:'Show', lock:'Lock', unlock:'Unlock', none:'None', selected:'selected', layersWord:'layers', bound:'bound', selectAdd:'select / add', builtIn:'built-in', imageWord:'image',
      showHide:'Show / hide', lockUnlock:'Lock / unlock', collapse:'− Collapse', expand:'+ Expand', undo:'Undo', redo:'Redo',
      deleteConfirm:'Delete “{name}”?', history:'History {current}/{total}', newText:'New text',
      resetConfirm:'Reset all scene content and layout adjustments to the supplied defaults? Custom image layers will be removed from the scene; files already saved in uploads/ are not deleted automatically.',
      previewing:'Opening draft preview…', previewFailed:'Could not open preview — is server.py running?', saveFailed:'Save failed — is server.py running?', discardFailed:"Could not discard edits — is server.py running?", saving:'Committing layout02.json → layout01.json…', discarding:'Discarding draft and restoring the saved version…', savedReturning:'Saved. Returning home…', discardedReturning:'Changes discarded. Returning home…', preparingBackup:'Preparing project backup…', addingImage:'Adding image…', replacingBackground:'Replacing background…', replacingVideo:'Replacing video…',
      errAddImage:'Could not add image: {error}', errSave:'Could not save project data: {error}', errExport:'Could not export project: {error}', errImport:'Could not import project: {error}'
    },
    zh: {
      editorTitle:'内容与布局编辑器', dragToolbar:'拖动工具栏', borderDragHint:'拖动外侧 1px 边框移动编辑器', preview:'预览', siteSettings:'网站设置', browserTab:'网页页签', titleEn:'页签 · 英文', titleZh:'页签 · 中文', siteTitleNote:'浏览器页签会根据网站当前语言自动使用对应标题。',
      editScene:'编辑场景', hideScene:'隐藏当前幕', showScene:'显示当前幕', sceneVisible:'显示中', sceneHidden:'已隐藏', sceneEditNote:'编辑模式只显示当前幕。请使用上方场景按钮切换页面；页面滚动已禁用。被隐藏的幕仍可在这里打开并恢复。', sceneGroupView:'第1幕组别视图', allGroups:'同时显示', sceneTitles:'顶栏场景名称', bilingual:'英文 + 中文',
      video:'视频', videoFit:'画面填充', videoFrame:'视频帧进度', videoOpacity:'视频透明度', videoSpeed:'播放速度', replaceVideo:'更换当前视频', chooseVideo:'选择视频', resetVideo:'回到首帧', videoNote:'编辑模式下视频始终暂停。拖动“视频帧进度”只定位并显示对应静止画面，松手不会播放；视频透明度和播放速度都会随布局保存。速度右侧数字可直接点击输入。',
      layers:'图层', addText:'+ 文字', addImage:'+ 图片', bindSelected:'绑定所选图层', unbind:'解除绑定',
      bindingNote:'按住 Command（⌘）点击画布或图层名称可多选。绑定后的图层会保持相对位置：移动其中任意一个成员时，整组都会获得相同的 X / Y 位移；第一幕 → 第二幕滚动时也会一起移动。缩放、旋转和外观仍可单独编辑。',
      transform:'变换', displayGroup:'显示组', realityGroup:'现实组', digitalGroup:'数字组', scale:'缩放', rotate:'旋转', opacity:'透明度', zIndex:'图层', sendBack:'移到后层', bringFront:'移到前层', deleteLayer:'删除所选图层',
      text:'文字', textEnterDelay:'进入后延迟显示（毫秒）', textFadeIn:'浮现耗时（毫秒）', spacesPreserved:'中英文同时维护', content:'内容', contentEn:'英文', contentZh:'中文', fontFamily:'字体', textBoxWidth:'文本框宽度', fontSize:'字号', weight:'字重', letterPx:'字间距 px', lineHeight:'行高', color:'颜色', align:'对齐', alignLeft:'左对齐', alignCenter:'居中', alignRight:'右对齐', linkJump:'链接 / 跳转', linkOptional:'可选', linkTarget:'目标地址', linkOpen:'打开方式', sameTab:'当前页', newTab:'新标签页', jumpOffset:'跳转偏移 px', linkNote:'内部跳转填写 #section-id，网站填写完整 URL，邮箱填写 mailto:。编辑模式下所有链接均不会跳转。',
      mediaScale:'素材缩放', mediaScaleNote:'图片和视频都可以用滑杆放大 / 缩小，也可以直接手动输入精确倍率。', image:'图片', imageWidth:'宽度', imageHeight:'高度', restoreAspect:'恢复原比例', restoreSize:'恢复原尺寸', imageSizeNote:'新插入图片默认严格使用上传素材的真实宽高比例。之后可独立修改宽度和高度，或拖动四边手柄，实现有意的横向 / 纵向拉伸。', brightness:'亮度', contrast:'对比度', saturation:'饱和度', hue:'色相', rotateLeft:'↶ 90°', rotateRight:'↷ 90°', resetColor:'重置颜色',
      imageNote:'颜色调整为非破坏式并会随布局保存。夜景中建议适当降低亮度与饱和度，让白天素材自然融入画面。',
      xrayLens:'X 光透视镜', normalPreview:'正常预览', lensRadius:'透视半径', feather:'羽化', triggerDist:'触发距离', expansionSpeed:'点击扩散时长（毫秒）', bodyInLens:'镜内主体', perspective:'透视层', skeleton:'骨骼层', rainDensity:'数字雨密度', rainDigitSize:'雨滴大小',
      xrayNote:'透视光圈内会切掉正常背景和人物主体，让背景透视、数字雨与人物透视保持清晰。数字雨密度和雨滴大小可独立调节。',
      sceneTransition:'场景过渡', travel:'上移距离', foregroundSpeed:'前景速度', backgroundSpeed:'背景速度', bottomDarken:'底部变暗', pageDwellRatio:'页面暂留比例', videoCrossfade:'视频交叉过渡', videoPauseInertia:'上滚惯性暂停延迟',
      transitionNote:'当前幕完全到位后才开始计算过渡。继续向下滚动时元素和背景按参数移动；从下一幕向上返回时会按进度反向归位。',
      sceneEdgeDarken:'场景边缘渐黑', topDarken:'顶部变暗', sceneShadeNote:'每一幕都独立保存顶部与底部的黑色渐变强度。',
      background:'主背景', mainBackground:'主背景', viewportCover:'铺满视口', replaceBackground:'更换当前幕背景', chooseImage:'选择图片', noBackground:'未设置背景图片', positionX:'水平位置', positionY:'垂直位置', zoom:'缩放', reference:'参考图', editorOnly:'仅编辑器', showReference:'显示“整合版效果”', centerGuides:'中心辅助线', showGuides:'显示中心辅助线',
      saveReturn:'保存', discardReturn:'取消', exportJson:'导出 JSON', importJson:'导入 JSON', resetDefaults:'恢复默认设置',
      saveStatusDefault:'编辑时只修改草稿 layout02。点击“保存”后提交到 layout01 并返回首页；点击“取消”则恢复到刚刚进入编辑模式时的完整状态并返回首页。',
      keyboardHelp:'⌘ + 点击 = 多选 · 双击文字 = 直接在画布编辑<br>绑定图层 = 一起移动 + 一起滚动 · ⌘/Ctrl+Z = 撤销 · ⇧⌘Z / Ctrl+Y = 重做 · 保留 20 步<br>方向键 = 1px · Shift + 方向键 = 10px',
      hide:'隐藏', show:'显示', lock:'锁定', unlock:'解锁', none:'无', selected:'已选择', layersWord:'个图层', bound:'已绑定', selectAdd:'选择 / 添加', builtIn:'内置', imageWord:'图片',
      showHide:'显示 / 隐藏', lockUnlock:'锁定 / 解锁', collapse:'− 收起', expand:'+ 展开', undo:'撤销', redo:'重做',
      deleteConfirm:'删除“{name}”？', history:'历史 {current}/{total}', newText:'新文本',
      resetConfirm:'确定将所有场景的内容和布局恢复到默认状态吗？自定义图片图层会从场景中移除，但 uploads/ 中已保存的文件不会自动删除。',
      previewing:'正在打开草稿预览…', previewFailed:'无法打开草稿预览——请确认 server.py 正在运行', saveFailed:'保存失败——请确认 server.py 正在运行', discardFailed:'无法放弃修改——请确认 server.py 正在运行', saving:'正在提交 layout02.json → layout01.json…', discarding:'正在放弃草稿并恢复已保存版本…', savedReturning:'已保存，正在返回首页…', discardedReturning:'已放弃修改，正在返回首页…', preparingBackup:'正在准备项目备份…', addingImage:'正在添加图片…', replacingBackground:'正在更换背景…', replacingVideo:'正在更换视频…',
      errAddImage:'无法添加图片：{error}', errSave:'无法保存项目数据：{error}', errExport:'无法导出项目：{error}', errImport:'无法导入项目：{error}'
    }
  };

  const MESSAGE_ZH = {
    'Saved to local project':'已保存到本地项目', 'Elements bound for scrolling':'已绑定图层滚动', 'Elements unbound':'已解除图层绑定',
    'Text added':'已添加文字', 'Image added':'已添加图片', 'Layer deleted':'已删除图层', 'Text updated':'文字已更新', 'Text style updated':'文字样式已更新',
    'Text color updated':'文字颜色已更新', 'Text alignment updated':'文字对齐已更新', 'X-ray updated':'透视设置已更新', 'Digital rain updated':'数字雨设置已更新', 'Transition updated':'过渡设置已更新',
    'Image color updated':'图片颜色已更新', 'Image resized':'图片尺寸已更新', 'Image ratio restored':'已恢复图片原比例', 'Image size restored':'已恢复图片原尺寸', 'Image rotated':'图片已旋转', 'Image color reset':'图片颜色已重置', 'Background replaced':'当前幕背景已更换', 'Video replaced':'视频已更换', 'Video speed updated':'视频速度已更新', 'Project exported':'项目已导出', 'Project imported':'项目已导入', 'Layout reset':'布局已重置', 'Site title updated':'网页页签已更新', 'Scene hidden':'当前幕已隐藏', 'Scene shown':'当前幕已显示'
  };

  const CORE_NAMES_ZH = {
    eyebrow:'问候文字', title:'主标题', subtitle:'副标题', scene1Background:'主背景', backgroundPerspective:'背景透视', rock:'石头', characterMain:'人物主体', characterPerspective:'人物透视', characterBones:'人物骨骼', star:'收藏星标', scroll:'滚动提示', scene2Video:'第2幕视频', scene3Video:'第3幕视频', scene4Video:'第4幕视频',
  };

  function currentLang() { return window.SceneLanguage?.language === 'zh' ? 'zh' : 'en'; }
  function tr(key, vars = {}) {
    let value = I18N[currentLang()]?.[key] ?? I18N.en[key] ?? key;
    for (const [name, replacement] of Object.entries(vars)) value = value.replaceAll(`{${name}}`, String(replacement));
    return value;
  }
  function editorMessage(message) { return currentLang() === 'zh' ? (MESSAGE_ZH[message] || message) : message; }
  function displayLayerName(id, state) { return currentLang() === 'zh' && CORE_NAMES_ZH[id] ? CORE_NAMES_ZH[id] : state?.name || id; }

  function applyStaticTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      if (key === 'keyboardHelp') el.innerHTML = tr(key);
      else el.textContent = tr(key);
    });
    editorDragHandle.removeAttribute('title');
    previewLink.title = currentLang() === 'zh' ? '临时预览 layout02 草稿效果' : 'Temporarily preview the layout02 draft';
    collapseBtn.title = currentLang() === 'zh' ? '收起编辑器' : 'Collapse editor';
    updateHistoryButtons();
    collapseBtn.textContent = editorEl.classList.contains('is-collapsed') ? tr('expand') : tr('collapse');
    document.querySelectorAll('[data-scene-jump]').forEach(button => { const n=Number(button.dataset.sceneJump); button.textContent = currentLang()==='zh' ? `第${n}幕` : `Scene ${n}`; });
    renderLayerList();
    updateSelection();
    updateSceneUi();
  }

  function ensureSiteTitleState() {
    if (!S.layout.siteTitle || typeof S.layout.siteTitle !== 'object') {
      S.layout.siteTitle = { en: 'About Joe', zh: 'Joe 的作品集' };
    }
    if (!String(S.layout.siteTitle.en || '').trim()) S.layout.siteTitle.en = 'About Joe';
    if (!String(S.layout.siteTitle.zh || '').trim()) S.layout.siteTitle.zh = 'Joe 的作品集';
    return S.layout.siteTitle;
  }
  function syncSiteTitleControls() {
    const title = ensureSiteTitleState();
    if (siteTitleEn) siteTitleEn.value = title.en;
    if (siteTitleZh) siteTitleZh.value = title.zh;
  }

  function displaySceneNumber(scene=activeScene){return Number(scene)}
  function sceneTitle(scene, language = currentLang()) {
    const n = displaySceneNumber(scene);
    const value = S.layout.sceneTitles?.[n] || S.layout.sceneTitles?.[String(n)];
    return String(value?.[language] || (language === 'zh' ? `第${n}幕` : `Scene ${n}`));
  }
  function sceneName(scene = activeScene) { return sceneTitle(scene); }
  function syncSceneTitleControls() {
    if (!sceneTitleList) return;
    if (sceneTitleList.children.length !== SCENE_IDS.length * 2) {
      sceneTitleList.innerHTML = SCENE_IDS.map(scene => `<div class="scene-title-row"><span class="scene-title-number">${scene}</span><input type="text" data-scene-title="${scene}" data-scene-title-lang="en" aria-label="Scene ${scene} English"><input type="text" data-scene-title="${scene}" data-scene-title-lang="zh" aria-label="Scene ${scene} Chinese"></div>`).join('');
    }
    for (const input of sceneTitleList.querySelectorAll('[data-scene-title]')) {
      const scene = Number(input.dataset.sceneTitle);
      const lang = input.dataset.sceneTitleLang;
      const title = S.layout.sceneTitles?.[scene] || {};
      const next = String(title[lang] || '');
      if (document.activeElement !== input && input.value !== next) input.value = next;
    }
    document.querySelectorAll('[data-scene-jump]').forEach(button => { button.textContent = sceneTitle(Number(button.dataset.sceneJump)); });
  }

  function sceneLayers(scene = activeScene) {
    return Object.keys(S.layout.layers).filter(id => layerScene(id) === Number(scene));
  }

  function ensureSceneShadeState(scene = activeScene) {if(!S.layout.sceneShades||typeof S.layout.sceneShades!=='object')S.layout.sceneShades={};const key=Number(scene),current=S.layout.sceneShades[key]||S.layout.sceneShades[String(key)]||{};S.layout.sceneShades[key]={top:clamp(Number(current.top)||0,0,1),bottom:clamp(Number(current.bottom)||0,0,1)};return S.layout.sceneShades[key];}
  function ensureSceneTransitionState(scene=activeScene){if(!S.layout.sceneTransitions||typeof S.layout.sceneTransitions!=='object')S.layout.sceneTransitions={};const key=Number(scene),fallback=key===1?(S.layout.transition||{lift:360,foregroundSpeed:1,backgroundSpeed:.5,bottomShade:.88,dwellRatio:.10,crossfadeMs:300}):{lift:0,foregroundSpeed:1,backgroundSpeed:.5,bottomShade:0,dwellRatio:0,crossfadeMs:[2,3].includes(key)?300:(key===4?440:300)},current=S.layout.sceneTransitions[key]||S.layout.sceneTransitions[String(key)]||{};S.layout.sceneTransitions[key]={lift:clamp(Number(current.lift??fallback.lift)||0,0,2400),foregroundSpeed:clamp(Number(current.foregroundSpeed??fallback.foregroundSpeed)||0,0,4),backgroundSpeed:clamp(Number(current.backgroundSpeed??fallback.backgroundSpeed)||0,0,4),bottomShade:clamp(Number(current.bottomShade??fallback.bottomShade)||0,0,1),dwellRatio:[2,3,4,5].includes(key)?0:clamp(Number(current.dwellRatio??fallback.dwellRatio)||0,0,3),crossfadeMs:clamp(Number(current.crossfadeMs??fallback.crossfadeMs)||300,0,3000)};if(key===1)S.layout.transition={...S.layout.sceneTransitions[key]};return S.layout.sceneTransitions[key];}

  function sceneIsVisible(scene=activeScene){return S.layout.sceneVisibility?.[Number(scene)]!==false}
  function syncSceneVisibilityUi(){const visible=sceneIsVisible(activeScene);if(toggleSceneVisibility)toggleSceneVisibility.textContent=visible?tr('hideScene'):tr('showScene');if(sceneVisibilityStatus)sceneVisibilityStatus.textContent=visible?tr('sceneVisible'):tr('sceneHidden');document.querySelectorAll('[data-scene-jump]').forEach(button=>{const scene=Number(button.dataset.sceneJump);button.classList.toggle('is-scene-hidden',S.layout.sceneVisibility?.[scene]===false)})}

  function syncEditSceneIsolation(scene = activeScene) {
    const target = Number(scene);
    document.documentElement.classList.add('edit-scene-isolated');
    document.body.dataset.editorScene = String(target);
    for (const module of (sceneRegistry?.all() || [])) {
      const rootEl = module?.rootId ? document.getElementById(module.rootId) : null;
      if (!rootEl) continue;
      const active = Number(module.id) === target;
      rootEl.classList.toggle('editor-scene-active', active);
      rootEl.classList.toggle('editor-scene-inactive', !active);
      if (!active) rootEl.setAttribute('aria-hidden', 'true');
      else rootEl.removeAttribute('aria-hidden');
    }
    requestAnimationFrame(() => {
      if (Math.abs(window.scrollY) > 1) window.scrollTo(0, 0);
    });
  }

  function updateSceneUi() {
    if (editorSceneLabel) editorSceneLabel.textContent = currentLang()==='zh' ? `第${displaySceneNumber(activeScene)}幕` : `SCENE ${displaySceneNumber(activeScene)}`;
    if (currentSceneHint) currentSceneHint.textContent = sceneName(activeScene);
    document.querySelectorAll('[data-scene-jump]').forEach(button => button.classList.toggle('is-active', Number(button.dataset.sceneJump) === activeScene));
    const sceneOneOnly = activeScene === 1;
    const groupFilter = document.getElementById('sceneGroupFilter');
    if (groupFilter) groupFilter.hidden = !sceneOneOnly;
    document.querySelectorAll('[data-scene-group]').forEach(button => button.classList.toggle('is-active', sceneOneOnly && button.dataset.sceneGroup === sceneOneGroupView));
    if (xrayControls) xrayControls.hidden = !sceneOneOnly;
    if (transitionControls) transitionControls.hidden = false;
    if(sceneShadeControls)sceneShadeControls.hidden=false;
    if (sceneShadeHint) sceneShadeHint.textContent = sceneName(activeScene);
    if(backgroundControls)backgroundControls.hidden=!sceneOneOnly;
    if (guidesControls) guidesControls.hidden = !sceneOneOnly;
    const addTextButton = document.getElementById('addText');
    const addImageInput = document.getElementById('addImage');
    if(addTextButton)addTextButton.disabled=false;
    if(addImageInput)addImageInput.disabled=false;
    syncSceneVisibilityUi();
    syncEditSceneIsolation(activeScene);
    if(typeof syncBg==='function')syncBg();
    if(typeof syncSceneShades==='function')syncSceneShades();
    if(typeof syncTransition==='function')syncTransition();
    applySceneGroupView();
    syncSceneGroupFilterUi();
    syncSceneTitleControls();
  }

  function setActiveScene(scene, options = {}) {
    const raw=Number(scene);const next=Number.isFinite(raw)&&SCENE_IDS.includes(raw)?raw:MIN_SCENE_ID;
    if (sceneSyncing) return;
    const changed = next !== activeScene;
    activeScene = next;
    updateSceneUi();
    if (!changed) return;
    sceneSyncing = true;
    const keep = options.preserveSelection && selectedArray().some(id => layerScene(id) === activeScene);
    if (!keep) {
      const fallback = sceneLayers(activeScene).sort((a,b) => (stateFor(b)?.z || 0) - (stateFor(a)?.z || 0))[0] || null;
      selectedIds = new Set(fallback ? [fallback] : []);
      primaryId = fallback;
    }
    renderLayerList();
    updateSelection();
    sceneSyncing = false;
  }

  function sceneAtViewportPoint(clientX,clientY){
    let inside=null,best=null,bestDistance=Infinity;
    for(const module of(sceneRegistry?.all()||[])){const rootEl=module?.rootId?document.getElementById(module.rootId):null;if(!rootEl)continue;const r=rootEl.getBoundingClientRect();if(clientY>=r.top&&clientY<=r.bottom&&clientX>=r.left&&clientX<=r.right){inside=module.id;break}const cy=Math.max(r.top,Math.min(clientY,r.bottom)),d=Math.abs(clientY-cy);if(d<bestDistance){bestDistance=d;best=module.id}}
    return inside??best??activeScene;
  }

  function detectSceneInView() {
    const center = window.innerHeight / 2;
    const candidates = (sceneRegistry?.all() || []).map(module => [module.id, document.getElementById(module.rootId)]).filter(([, el]) => el);
    let best = activeScene;
    let bestDistance = Infinity;
    candidates.forEach(([scene, el]) => {
      const r = el.getBoundingClientRect();
      const distance = Math.abs((r.top + r.bottom) / 2 - center);
      if (distance < bestDistance) { bestDistance = distance; best = scene; }
    });
    setActiveScene(best);
  }

  function naturalSize(el) {
    if (!el) return { width: 1, height: 1 };
    return { width: el.offsetWidth || el.naturalWidth || 1, height: el.offsetHeight || el.naturalHeight || 1 };
  }

  /** @returns {string} */
  function historySnapshot() {
    return JSON.stringify(S.layout);
  }

  function updateHistoryButtons() {
    if (!undoBtn || !redoBtn) return;
    undoBtn.disabled = historyIndex <= 0;
    redoBtn.disabled = historyIndex < 0 || historyIndex >= historyStack.length - 1;
    undoBtn.textContent = historyIndex > 0 ? `↶ ${tr('undo')} ${historyIndex}` : `↶ ${tr('undo')}`;
    const redoCount = historyStack.length - 1 - historyIndex;
    redoBtn.textContent = redoCount > 0 ? `↷ ${tr('redo')} ${redoCount}` : `↷ ${tr('redo')}`;
  }

  function resetHistory() {
    clearTimeout(historyTimer);
    historyStack = [historySnapshot()];
    historyIndex = 0;
    updateHistoryButtons();
  }

  function captureHistoryNow() {
    if (applyingHistory) return;
    const snap = historySnapshot();
    if (historyIndex >= 0 && historyStack[historyIndex] === snap) return;
    historyStack = historyStack.slice(0, historyIndex + 1);
    historyStack.push(snap);
    // 21 snapshots = current state + up to 20 undo steps.
    if (historyStack.length > HISTORY_LIMIT + 1) historyStack.shift();
    historyIndex = historyStack.length - 1;
    updateHistoryButtons();
  }

  function scheduleHistoryCapture() {
    if (applyingHistory) return;
    clearTimeout(historyTimer);
    historyTimer = setTimeout(captureHistoryNow, 240);
  }

  /** @param {number} index */
  function applyHistory(index) {
    if (index < 0 || index >= historyStack.length || index === historyIndex) return;
    clearTimeout(historyTimer);
    applyingHistory = true;
    historyIndex = index;
    S.setLayout(JSON.parse(historyStack[historyIndex]), false);
    const valid = selectedArray().filter(id => S.layout.layers[id]);
    const fallback = Object.keys(S.layout.layers).find(id => layerScene(id) === activeScene) || S.layout.layers.characterMain && 'characterMain' || Object.keys(S.layout.layers)[0];
    setSelection(valid.length ? valid : (fallback ? [fallback] : []), valid[0] || fallback || null);
    applyingHistory = false;
    S.persistLayout();
    updateHistoryButtons();
    saveStatus.textContent = tr('history', { current: historyIndex + 1, total: historyStack.length });
  }

  function undo() { if (historyIndex > 0) applyHistory(historyIndex - 1); }
  function redo() { if (historyIndex < historyStack.length - 1) applyHistory(historyIndex + 1); }

  function autosave(message = 'Saved to local project') {
    scheduleHistoryCapture();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      S.persistLayout();
      saveStatus.textContent = `${editorMessage(message)} · ${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})}`;
      saveStatus.classList.add('is-ok');
      setTimeout(() => saveStatus.classList.remove('is-ok'), 1000);
    }, 120);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  }

  function layerIcon(s) {
    if (s.type === 'text') return 'T';
    if (s.type === 'image') return '▧';
    if (s.type === 'character') return '◎';
    if (s.type === 'video') return '▶';
    return '•';
  }

  // Bound layers remain independently selectable for appearance, but geometry edits
  // (move / scale / rotation) act on the whole group so relative position and size stay fixed.
  function movementIds(ids) {
    const expanded = new Set();
    ids.forEach(id => {
      if (!S.layout.layers[id]) return;
      const binding = S.bindingForLayer(id);
      if (binding) binding.members.forEach(member => { if (S.layout.layers[member]) expanded.add(member); });
      else expanded.add(id);
    });
    return [...expanded];
  }

  function setSelection(ids, preferredPrimary = null) {
    let valid = [...ids].filter(id => S.layout.layers[id]);
    if (valid.length) {
      const scene = layerScene(valid[0]);
      valid = valid.filter(id => layerScene(id) === scene);
      if (scene !== activeScene) setActiveScene(scene, { preserveSelection: true });
    }
    selectedIds = new Set(valid);
    primaryId = preferredPrimary && selectedIds.has(preferredPrimary) ? preferredPrimary : (valid[0] || null);
    renderLayerList();
    updateSelection();
  }

  function select(id, additive = false) {
    if (!S.layout.layers[id]) return;
    const scene = layerScene(id);
    if (scene !== activeScene) setActiveScene(scene, { preserveSelection: true });
    if (!additive) { setSelection([id], id); return; }
    const next = new Set([...selectedIds].filter(existing => layerScene(existing) === scene));
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelection(next, next.has(id) ? id : [...next][0]);
  }

  function renderLayerList() {
    const sceneIds = Object.keys(S.layout.layers).filter(id => layerScene(id) === activeScene && (activeScene !== 1 || sceneOneGroupView === 'all' || String(stateFor(id)?.displayGroup || 'reality') === sceneOneGroupView));
    const groupAllows = id => activeScene !== 1 || sceneOneGroupView === 'all' || String(stateFor(id)?.displayGroup || 'reality') === sceneOneGroupView;
    const validSelected = selectedArray().filter(id => layerScene(id) === activeScene && groupAllows(id));
    if (!validSelected.length) {
      const fallback = sceneIds.sort((a,b) => (stateFor(b)?.z || 0) - (stateFor(a)?.z || 0))[0] || null;
      selectedIds = new Set(fallback ? [fallback] : []);
      primaryId = fallback;
    }

    layerList.innerHTML = '';

    if (activeScene === 1) {
      const backgroundRow = document.createElement('div');
      backgroundRow.className = 'layer-row scene-background-row';
      backgroundRow.hidden = sceneOneGroupView === 'digital';
      backgroundRow.dataset.id = '__sceneBackground';
      backgroundRow.innerHTML = `
        <button class="visibility background-row-static" type="button" tabindex="-1" aria-hidden="true">▣</button>
        <button class="lock background-row-static" type="button" tabindex="-1" aria-hidden="true">·</button>
        <div class="layer-name" title="${escapeHtml(tr('mainBackground'))}"><span class="layer-kind">▧</span>${escapeHtml(tr('mainBackground'))}</div>
        <span class="layer-z">BG</span>`;
      backgroundRow.querySelector('.layer-name').addEventListener('click', () => {
        if (!backgroundControls || !editorScrollShell) return;
        const shellRect = editorScrollShell.getBoundingClientRect();
        const targetRect = backgroundControls.getBoundingClientRect();
        const nextLeft = editorScrollShell.scrollLeft + (targetRect.left - shellRect.left) - 16;
        editorScrollShell.scrollTo({ left: Math.max(0, nextLeft), behavior: 'smooth' });
        backgroundControls.classList.remove('editor-section-pulse');
        requestAnimationFrame(() => backgroundControls.classList.add('editor-section-pulse'));
        setTimeout(() => backgroundControls.classList.remove('editor-section-pulse'), 700);
      });
      layerList.appendChild(backgroundRow);
    }

    sceneIds
      .sort((a,b) => (stateFor(b)?.z || 0) - (stateFor(a)?.z || 0))
      .forEach(id => {
        const s = stateFor(id);
        const binding = S.bindingForLayer(id);
        const row = document.createElement('div');
        row.className = `layer-row${selectedIds.has(id) ? ' is-selected' : ''}${!s.visible ? ' is-hidden' : ''}${s.locked ? ' is-locked' : ''}${binding ? ' is-bound' : ''}`;
        row.dataset.id = id;
        const shownName = displayLayerName(id, s);
        row.innerHTML = `
          <button class="visibility" title="${escapeHtml(tr('showHide'))}">${s.visible ? '◉' : '○'}</button>
          <button class="lock" title="${escapeHtml(tr('lockUnlock'))}">${s.locked ? '🔒' : '·'}</button>
          <div class="layer-name" title="${escapeHtml(shownName)}"><span class="layer-kind">${layerIcon(s)}</span>${escapeHtml(shownName)}${binding ? '<span class="bound-mark"> ⛓</span>' : ''}</div>
          <span class="layer-z">${S.layerRank(id) ?? '-'}</span>`;
        row.querySelector('.layer-name').addEventListener('click', e => select(id, isMultiSelectModifier(e)));
        row.addEventListener('dblclick', e => {
          select(id, isMultiSelectModifier(e));
          if (s.type === 'text' && selectedArray().length === 1) setTimeout(() => beginInlineTextEdit(id, elementFor(id)), 0);
        });
        row.querySelector('.visibility').addEventListener('click', e => {
          e.stopPropagation(); s.visible = !s.visible; S.applyLayer(id); renderLayerList(); updateSelection(); autosave();
        });
        row.querySelector('.lock').addEventListener('click', e => {
          e.stopPropagation(); s.locked = !s.locked; S.applyLayer(id); renderLayerList(); updateSelection(); autosave();
        });
        layerList.appendChild(row);
      });
  }

  function applySceneGroupView() {
    document.querySelectorAll('[data-layer-id]').forEach(el => {
      const layer = el.dataset.layerId ? stateFor(el.dataset.layerId) : null;
      const hidden = activeScene === 1 && sceneOneGroupView !== 'all' && layer && String(layer.displayGroup || 'reality') !== sceneOneGroupView;
      el.classList.toggle('editor-group-filter-hidden', Boolean(hidden));
    });
    const shell = document.getElementById('sceneOneShell');
    shell?.classList.toggle('editor-group-view-digital', activeScene === 1 && sceneOneGroupView === 'digital');
    shell?.classList.toggle('editor-group-view-all', activeScene === 1 && sceneOneGroupView === 'all');
    renderLayerList();
  }

  function syncSceneGroupFilterUi() {
    const groupFilter = document.getElementById('sceneGroupFilter');
    if (groupFilter) groupFilter.hidden = activeScene !== 1;
    document.querySelectorAll('[data-scene-group]').forEach(button => {
      button.classList.toggle('is-active', activeScene === 1 && button.dataset.sceneGroup === sceneOneGroupView);
      const key = button.dataset.sceneGroup === 'reality' ? 'realityGroup' : button.dataset.sceneGroup === 'digital' ? 'digitalGroup' : 'allGroups';
      button.textContent = tr(key);
    });
    const title = groupFilter?.querySelector('[data-i18n="sceneGroupView"]');
    if (title) title.textContent = tr('sceneGroupView');
  }

  function rotateVector(x, y, deg) {
    const r = deg * Math.PI / 180;
    return { x: x * Math.cos(r) - y * Math.sin(r), y: x * Math.sin(r) + y * Math.cos(r) };
  }

  function visualCenter(s, size) {
    const local = rotateVector(size.width * s.scale / 2, size.height * s.scale / 2, s.rotation);
    return { x: s.x + local.x, y: s.y + local.y };
  }

  function positionFromCenter(center, size, scale, rotation) {
    const local = rotateVector(size.width * scale / 2, size.height * scale / 2, rotation);
    return { x: center.x - local.x, y: center.y - local.y };
  }

  function layerBounds(id, state = stateFor(id)) {
    const el = elementFor(id);
    if (!state || !el) return null;
    if (state.flow) {
      const stageEl = sceneStage(layerScene(id));
      if (!stageEl) return null;
      const r = el.getBoundingClientRect();
      const sr = stageEl.getBoundingClientRect();
      return { minX:r.left-sr.left, maxX:r.right-sr.left, minY:r.top-sr.top, maxY:r.bottom-sr.top, width:r.width, height:r.height };
    }
    const size = naturalSize(el);
    const localCorners = [
      {x:0,y:0}, {x:size.width * state.scale,y:0},
      {x:0,y:size.height * state.scale}, {x:size.width * state.scale,y:size.height * state.scale}
    ];
    const pts = localCorners.map(p => {
      const r = rotateVector(p.x, p.y, state.rotation);
      return { x: state.x + r.x, y: state.y + r.y };
    });
    return {
      minX: Math.min(...pts.map(p => p.x)), maxX: Math.max(...pts.map(p => p.x)),
      minY: Math.min(...pts.map(p => p.y)), maxY: Math.max(...pts.map(p => p.y))
    };
  }

  function selectionBounds(ids = selectedArray()) {
    const bounds = ids.map(id => {
      const s = stateFor(id);
      return s?.visible ? layerBounds(id, s) : null;
    }).filter(Boolean);
    if (!bounds.length) return null;
    const minX = Math.min(...bounds.map(b => b.minX));
    const maxX = Math.max(...bounds.map(b => b.maxX));
    const minY = Math.min(...bounds.map(b => b.minY));
    const maxY = Math.max(...bounds.map(b => b.maxY));
    return { minX, minY, maxX, maxY, width: maxX-minX, height:maxY-minY, cx:(minX+maxX)/2, cy:(minY+maxY)/2 };
  }

  function syncTextControls() {
    const ids = selectedArray();
    const s = ids.length === 1 ? stateFor(ids[0]) : null;
    const active = isTextLayer(s);
    textControls.hidden = !active;
    if (!active) return;
    const timingMax = 10000;
    textProps.enterDelay.max = String(timingMax);
    textProps.visibleFor.max = String(timingMax);
    textProps.enterDelay.step = timingMax <= 60000 ? '100' : '10';
    textProps.visibleFor.step = timingMax <= 60000 ? '100' : '10';
    const t = /** @type {import('../src/types').TextStyle} */ (s.textStyle || {});
    const el = /** @type {HTMLElement|null} */ (elementFor(ids[0]));
    const computed = el ? getComputedStyle(el) : null;
    const fallbackText = typeof s.text === 'string' ? s.text : '';
    const enText = s.texts?.en ?? fallbackText;
    const zhText = s.texts?.zh ?? enText;
    textProps.contentEn.value = enText;
    textProps.contentZh.value = zhText;
    textProps.fontFamily.value = t.fontFamily || 'inherit';
    const measuredWidth = Math.max(40, Math.round(el?.offsetWidth || el?.getBoundingClientRect?.().width || 300));
    textProps.boxWidth.value = String(Math.round(Number(s.boxWidth || measuredWidth)));
    textProps.fontSize.value = String(t.fontSize ?? (computed ? Math.round(parseFloat(computed.fontSize) || 64) : 64));
    textProps.fontWeight.value = String(t.fontWeight ?? (computed ? (parseInt(computed.fontWeight,10) || 400) : 700));
    textProps.letterSpacing.value = String(t.letterSpacing ?? (computed && computed.letterSpacing !== 'normal' ? (parseFloat(computed.letterSpacing)||0) : 0));
    textProps.lineHeight.value = String(t.lineHeight ?? (computed && computed.lineHeight !== 'normal' ? ((parseFloat(computed.lineHeight)||16)/(parseFloat(computed.fontSize)||16)) : 1.2));
    const resolvedColor = t.color || (computed?.color ? rgbToHex(computed.color) : '#ffffff');
    textProps.color.value = normaliseHex(resolvedColor);
    textProps.colorHex.value = normaliseHex(resolvedColor);
    textProps.align.value = t.align || computed?.textAlign || 'left';
    textProps.enterDelay.value = String(Math.round(Number(s.displayTiming?.enterDelayMs) || 0));
    textProps.visibleFor.value = String(Math.round(Number(s.displayTiming?.fadeInMs ?? s.displayTiming?.visibleForMs) || 0));
    const link = s.link || {};
    textProps.linkHref.value = link.href || '';
    textProps.linkTarget.value = link.target === '_blank' ? '_blank' : '_self';
    textProps.linkOffset.value = String(Number(link.offset || 0));
  }

  function ensureImageStyle(s) {
    if (!s.imageStyle) s.imageStyle = { brightness: 1, contrast: 1, saturation: 1, hue: 0 };
    return s.imageStyle;
  }

  function ensureSourceDimensions(id, s) {
    if (!isMediaLayer(s)) return;
    const el = /** @type {HTMLImageElement|HTMLVideoElement|null} */ (elementFor(id));
    const naturalWidth = s.type === 'video' ? el?.videoWidth : el?.naturalWidth;
    const naturalHeight = s.type === 'video' ? el?.videoHeight : el?.naturalHeight;
    if ((!s.sourceWidth || !s.sourceHeight) && naturalWidth > 0 && naturalHeight > 0) {
      s.sourceWidth = Number(naturalWidth);
      s.sourceHeight = Number(naturalHeight);
    }
  }

  function syncImageControls() {
    const ids = selectedArray();
    const s = ids.length === 1 ? stateFor(ids[0]) : null;
    const active = isImageLayer(s);
    imageControls.hidden = !active;
    if (!active) return;
    ensureSourceDimensions(ids[0], s);
    const dims = s.width && s.height ? `${Math.round(s.width)}×${Math.round(s.height)}` : '';
    const sourceDims = s.sourceWidth && s.sourceHeight ? `src ${Math.round(s.sourceWidth)}×${Math.round(s.sourceHeight)}` : '';
    imageInfo.textContent = [s.fileName || (s.core ? tr('builtIn') : tr('imageWord')), dims, sourceDims].filter(Boolean).join(' · ');
    imageWidth.value = String(Math.max(1, Math.round(Number(s.width) || 1)));
    imageHeight.value = String(Math.max(1, Math.round(Number(s.height) || 1)));
    const style = ensureImageStyle(s);
    imageProps.brightness.value = style.brightness ?? 1;
    imageProps.contrast.value = style.contrast ?? 1;
    imageProps.saturation.value = style.saturation ?? 1;
    imageProps.hue.value = style.hue ?? 0;
    imagePropsOut.brightness.textContent = `${Math.round(Number(style.brightness ?? 1) * 100)}%`;
    imagePropsOut.contrast.textContent = `${Math.round(Number(style.contrast ?? 1) * 100)}%`;
    imagePropsOut.saturation.textContent = `${Math.round(Number(style.saturation ?? 1) * 100)}%`;
    imagePropsOut.hue.textContent = `${Math.round(Number(style.hue ?? 0))}°`;
  }

  const editorVideoPrepared = new WeakSet();

  function formatVideoTime(seconds) {
    const safe = Math.max(0, Number(seconds) || 0);
    const mins = Math.floor(safe / 60);
    const secs = safe - mins * 60;
    return `${mins}:${secs.toFixed(3).padStart(6, '0')}`;
  }

  function pauseEditorVideo(video) {
    if (!video || video.tagName !== 'VIDEO') return;
    video.muted = true;
    video.defaultMuted = true;
    video.autoplay = false;
    video.removeAttribute('autoplay');
    video.removeAttribute('controls');
    video.pause();
  }

  function prepareEditorVideo(video, resetToFirstFrame = false) {
    if (!video || video.tagName !== 'VIDEO') return;
    pauseEditorVideo(video);
    const reset = () => {
      pauseEditorVideo(video);
      if (resetToFirstFrame || video.dataset.editorFrameInitialised !== '1') {
        try { video.currentTime = 0; } catch (_) {}
        video.dataset.editorFrameInitialised = '1';
      }
      syncVideoControls();
    };
    if (!editorVideoPrepared.has(video)) {
      editorVideoPrepared.add(video);
      video.addEventListener('play', () => pauseEditorVideo(video));
      video.addEventListener('loadedmetadata', reset);
      video.addEventListener('durationchange', () => { syncVideoControls(); syncTextControls(); });
      video.addEventListener('seeked', syncVideoControls);
    }
    if (video.readyState >= 1) reset();
  }

  function syncVideoControls() {
    const ids = selectedArray();
    const s = ids.length === 1 ? stateFor(ids[0]) : null;
    const active = isVideoLayer(s);
    videoControls.hidden = !active;
    if (!active) return;
    ensureSourceDimensions(ids[0], s);
    const video = /** @type {HTMLVideoElement|null} */ (elementFor(ids[0]));
    if (video?.tagName === 'VIDEO') pauseEditorVideo(video);
    videoFit.value = s.fit || 'cover';
    const duration = video && Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    const current = duration ? clamp(Number(video.currentTime) || 0, 0, duration) : 0;
    videoScrub.max = String(duration);
    videoScrub.value = String(current);
    videoScrub.disabled = duration <= 0;
    videoScrubOut.textContent = `${formatVideoTime(current)} / ${formatVideoTime(duration)}`;
    const opacity = clamp(Number(s.opacity ?? 1), 0, 1);
    videoOpacity.value = String(opacity);
    videoOpacityOut.textContent = `${Math.round(opacity * 100)}%`;
    const playbackRate = clamp(Number(s.playbackRate) || 1, 0.25, 3);
    if (videoSpeed) videoSpeed.value = String(playbackRate);
    if (videoSpeedOut) videoSpeedOut.textContent = `${playbackRate.toFixed(2)}×`;
    if (videoSceneHint) videoSceneHint.textContent = currentLang() === 'zh' ? `第${displaySceneNumber(layerScene(ids[0]))}幕` : `Scene ${displaySceneNumber(layerScene(ids[0]))}`;
    if (videoFileInfo) {
      const dims = s.sourceWidth && s.sourceHeight ? `${Math.round(s.sourceWidth)}×${Math.round(s.sourceHeight)}` : '';
      videoFileInfo.textContent = [s.fileName || (s.src?.startsWith('uploads/') ? tr('video') : tr('builtIn')), dims].filter(Boolean).join(' · ');
    }
  }

  function syncMediaScaleControls() {
    const ids=selectedArray();
    const s=ids.length===1?stateFor(ids[0]):null;
    const active=s&&(s.type==='image'||s.type==='video');
    if(mediaScaleControls)mediaScaleControls.hidden=!active;
    if(!active)return;
    const scale=clamp(Number(s.scale)||1,.02,8);
    if(mediaScaleRange)mediaScaleRange.value=String(clamp(scale,.1,4));
    if(mediaScaleNumber)mediaScaleNumber.value=String(round(scale,4));
    if(mediaScaleOut)mediaScaleOut.textContent=`${Math.round(scale*100)}%`;
  }

  function syncBindingControls() {
    const ids = selectedArray();
    selectionCount.textContent = ids.length > 1 ? `${ids.length} ${tr('selected')}` : tr('selectAdd');
    bindBtn.disabled = ids.length < 2;
    unbindBtn.disabled = !ids.some(id => Boolean(S.bindingForLayer(id)));
  }

  function syncProperties() {
    const ids = selectedArray();
    const s = ids.length === 1 ? stateFor(ids[0]) : null;
    panel.classList.toggle('is-disabled', !ids.length);
    if (!ids.length) {
      selectedName.textContent = tr('none');
      textControls.hidden = true;
      imageControls.hidden = true;
      videoControls.hidden = true;
      if(mediaScaleControls)mediaScaleControls.hidden=true;
      bindBtn.disabled = true;
      unbindBtn.disabled = true;
      selectionCount.textContent = tr('selectAdd');
      currentLayerRank.textContent = '—';
      return;
    }

    const bounds = selectionBounds(ids);
    selectedName.textContent = s ? displayLayerName(ids[0], s) : `${ids.length} ${tr('layersWord')}`;
    props.x.value = bounds ? round(bounds.minX, 2) : '';
    props.y.value = bounds ? round(bounds.minY, 2) : '';

    const multi = ids.length > 1;
    for (const key of ['scale','rotation','opacity','z']) props[key].disabled = multi;
    if (!multi) {
      props.scale.value = round(s.scale, 4);
      props.rotation.value = round(s.rotation, 2);
      props.opacity.value = round(s.opacity, 2);
      props.z.value = S.layerRank(ids[0]) ?? 1;
      props.z.min = '1';
      props.z.max = String(Math.max(1, S.layerCount(layerScene(ids[0]))));
    } else {
      props.scale.value = '';
      props.rotation.value = '';
      props.opacity.value = '';
      props.z.value = '';
    }

    const allVisible = ids.every(id => stateFor(id).visible);
    const allLocked = ids.every(id => stateFor(id).locked);
    document.getElementById('toggleVisible').textContent = allVisible ? tr('hide') : tr('show');
    document.getElementById('toggleLock').textContent = allLocked ? tr('unlock') : tr('lock');
    const rank = !multi ? (S.layerRank(ids[0]) ?? 1) : null;
    currentLayerRank.textContent = rank ?? '—';
    currentLayerRank.classList.toggle('is-multi', multi);
    if (displayGroup) {
      displayGroup.value = String(s?.displayGroup || 'reality');
      displayGroup.disabled = multi || Number(s?.scene) !== 1;
    }
    document.getElementById('sendBack').disabled = multi || rank >= S.layerCount(s ? layerScene(ids[0]) : activeScene);
    document.getElementById('bringFront').disabled = multi || rank <= 1;
    deleteLayerBtn.hidden=ids.length!==1;
    syncTextControls();
    syncImageControls();
    syncVideoControls();
    syncMediaScaleControls();
    syncBindingControls();
  }

  function updateSelection() {
    const ids = selectedArray();
    S.setEditorSelectionPriority?.(ids);
    const bounds = selectionBounds(ids);
    const blocked = !ids.length || ids.some(id => stateFor(id)?.locked);
    if (!bounds) {
      selectionBox.style.display = 'none';
      selectionBox.classList.remove('is-single-text', 'is-single-media');
      syncProperties();
      return;
    }
    const targetStage = ids.length ? sceneStage(layerScene(ids[0])) : null;
    if (targetStage && selectionBox.parentElement !== targetStage) targetStage.appendChild(selectionBox);
    selectionBox.style.display = blocked ? 'none' : 'block';
    selectionBox.classList.toggle('is-single-text', ids.length === 1 && stateFor(ids[0])?.type === 'text');
    selectionBox.classList.toggle('is-single-media', ids.length === 1 && ['image','video'].includes(stateFor(ids[0])?.type));
    selectionBox.style.width = `${Math.max(1,bounds.width)}px`;
    selectionBox.style.height = `${Math.max(1,bounds.height)}px`;
    selectionBox.style.transform = `translate3d(${bounds.minX}px, ${bounds.minY}px, 0)`;
    const binding = ids.length ? S.bindingForLayer(ids[0]) : null;
    selectionLabel.textContent = ids.length === 1 ? displayLayerName(ids[0], stateFor(ids[0])) : `${ids.length} ${tr('layersWord')}${binding && binding.members.length === ids.length ? ` · ${tr('bound')}` : ''}`;
    syncProperties();
  }

  let inlineTextEdit = null;

  function selectAllEditableText(el) {
    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function finishInlineTextEdit(commit = true) {
    if (!inlineTextEdit) return;
    const { id, el, startText, onInput, onKeydown, onBlur } = inlineTextEdit;
    const s = stateFor(id);
    el.removeEventListener('input', onInput);
    el.removeEventListener('keydown', onKeydown);
    el.removeEventListener('blur', onBlur);
    el.removeAttribute('contenteditable');
    el.classList.remove('is-inline-text-editing');
    inlineTextEdit = null;
    if (s?.type === 'text') {
      if (!commit) { if (s.localized) { if (!s.texts) s.texts={}; s.texts[currentLang()] = startText; if(currentLang()==='en') s.text=startText; } else s.text = startText; }
      if (!s.core) s.name = (String(s.text || '').trim().split(/\s+/).slice(0, 5).join(' ') || 'Text').slice(0, 32);
      S.applyLayer(id);
      renderLayerList();
      updateSelection();
      autosave(commit ? 'Text updated' : 'Saved to local project');
    }
  }

  function beginInlineTextEdit(id, el = elementFor(id)) {
    const s = stateFor(id);
    if (!s || s.type !== 'text' || s.locked || !el) return;
    if (inlineTextEdit?.id === id) return;
    if (inlineTextEdit) finishInlineTextEdit(true);
    select(id, false);
    const startText = s.localized ? (s.texts?.[currentLang()] ?? s.texts?.en ?? s.text ?? '') : (s.text ?? '');
    el.setAttribute('contenteditable', 'true');
    el.setAttribute('spellcheck', 'false');
    el.classList.add('is-inline-text-editing');
    selectionBox.style.display = 'none';

    const onInput = () => {
      const next = el.innerText.replace(/\r/g, '');
      if (s.localized) {
        if (!s.texts) s.texts = { en: s.text || '', zh: s.text || '' };
        s.texts[currentLang()] = next;
        if (currentLang() === 'en') s.text = next;
      } else s.text = next;
      if (!s.core) s.name = (next.trim().split(/\s+/).slice(0, 5).join(' ') || 'Text').slice(0, 32);
      if (currentLang() === 'zh') textProps.contentZh.value = next; else textProps.contentEn.value = next;
      renderLayerList();
      autosave('Text updated');
    };
    const onKeydown = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        finishInlineTextEdit(false);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        finishInlineTextEdit(true);
      }
    };
    const onBlur = () => finishInlineTextEdit(true);
    inlineTextEdit = { id, el, startText, onInput, onKeydown, onBlur };
    el.addEventListener('input', onInput);
    el.addEventListener('keydown', onKeydown);
    el.addEventListener('blur', onBlur);
    requestAnimationFrame(() => { el.focus(); selectAllEditableText(el); });
  }

  [...new Set((sceneRegistry?.all() || []).map(module => S.stageForScene(module.id)).filter(Boolean))].forEach(sceneCanvas => {
    sceneCanvas.addEventListener('pointerdown', e => {
      const el = e.target.closest?.('[data-layer-id]');
      if (!el || el.closest('#selectionBox') || el.classList.contains('is-inline-text-editing')) return;
      const id = el.dataset.layerId;
      const s = stateFor(id);
      if (!id || !s || s.locked) return;
      select(id, isMultiSelectModifier(e));
      e.stopPropagation();
    });

    sceneCanvas.addEventListener('dblclick', e => {
      const el = e.target.closest?.('[data-layer-id]');
      if (!el) return;
      const id = el.dataset.layerId;
      if (stateFor(id)?.type !== 'text') return;
      e.preventDefault();
      e.stopPropagation();
      beginInlineTextEdit(id, el);
    });
    sceneCanvas.addEventListener('click', e => {
      if (e.target.closest?.('[data-layer-id]') && e.target.closest?.('a,button')) e.preventDefault();
    }, true);
  });

  document.addEventListener('click', e => {
    const link = e.target.closest?.('a');
    if (!link || link.closest('#editor')) return;
    e.preventDefault();
  }, true);

  selectionBox.addEventListener('dblclick', e => {
    const ids = selectedArray();
    if (ids.length !== 1 || stateFor(ids[0])?.type !== 'text') return;
    e.preventDefault();
    e.stopPropagation();
    beginInlineTextEdit(ids[0], elementFor(ids[0]));
  });

  function startPointerAction(e) {
    const requestedAction = e.target.dataset.action;
    if (!requestedAction) return;
    const ids = selectedArray();
    if (!ids.length) return;
    const singleText = ids.length === 1 && stateFor(ids[0])?.type === 'text';
    const singleMedia = ids.length === 1 && ['image','video'].includes(stateFor(ids[0])?.type);
    let action = requestedAction;
    if (singleText && (requestedAction === 'scale' || requestedAction === 'edge-resize')) action = 'text-resize';
    if (singleMedia && requestedAction === 'edge-resize') action = 'media-resize';
    if (requestedAction === 'edge-resize' && !singleText && !singleMedia) return;
    const actionIds = ['move','scale','rotate'].includes(action) ? movementIds(ids) : ids;
    // A locked member freezes the bound group's position rather than allowing
    // the group relationship to be broken by moving only some members.
    if (actionIds.some(id => stateFor(id).locked)) return;
    e.preventDefault();
    e.stopPropagation();
    e.target.setPointerCapture?.(e.pointerId);

    const scene = S.viewportToScene(e.clientX, e.clientY, ids.length ? layerScene(ids[0]) : activeScene);
    const bounds = selectionBounds(ids);
    if (!bounds) return;
    const center = { x: bounds.cx, y: bounds.cy };
    const items = actionIds.map(id => {
      const s = stateFor(id);
      const size = naturalSize(elementFor(id));
      return {
        id,
        start: { ...s },
        size,
        startWidth: Math.max(1, Number(s.boxWidth || s.width || size.width || 300)),
        startHeight: Math.max(1, Number(s.height || size.height || 300)),
        center: s.flow ? (()=>{ const b=layerBounds(id,s); return {x:b.cx ?? (b.minX+b.maxX)/2,y:b.cy ?? (b.minY+b.maxY)/2}; })() : visualCenter(s, size)
      };
    });

    drag = {
      action,
      sourceScene: ids.length ? layerScene(ids[0]) : activeScene,
      requestedAction,
      edge: e.target.dataset.edge || e.target.dataset.corner || 'e',
      pointerId: e.pointerId,
      startScene: scene,
      center,
      items,
      startAngle: Math.atan2(scene.y - center.y, scene.x - center.x),
      startDistance: Math.hypot(scene.x - center.x, scene.y - center.y) || 1
    };
  }

  selectionBox.addEventListener('pointerdown', startPointerAction);

  window.addEventListener('pointermove', e => {
    if (!drag) return;
    const p = S.viewportToScene(e.clientX, e.clientY, drag.sourceScene ?? (drag.items.length ? layerScene(drag.items[0].id) : activeScene));
    if (drag.action === 'move') {
      const dx = p.x - drag.startScene.x;
      const dy = p.y - drag.startScene.y;
      drag.items.forEach(item => {
        const s = stateFor(item.id);
        s.x = round(item.start.x + dx, 2);
        s.y = round(item.start.y + dy, 2);
        S.applyLayer(item.id);
      });
    } else if (drag.action === 'text-resize') {
      const item = drag.items[0];
      const s = stateFor(item.id);
      if (!s) return;
      const dx = p.x - drag.startScene.x;
      const dy = p.y - drag.startScene.y;
      const localDelta = rotateVector(dx, dy, -Number(item.start.rotation || 0));
      const scale = Math.max(0.02, Number(item.start.scale || 1));
      const localDx = localDelta.x / scale;
      const fromLeft = String(drag.edge || '').includes('w');
      const width = clamp(item.startWidth + (fromLeft ? -localDx : localDx), 40, 3000);
      s.boxWidth = round(width, 2);
      // Dragging the left edge changes the box origin so the opposite edge stays in place.
      if (fromLeft) {
        const deltaWidth = item.startWidth - width;
        const shift = rotateVector(deltaWidth * scale, 0, Number(item.start.rotation || 0));
        s.x = round(Number(item.start.x || 0) + shift.x, 2);
        s.y = round(Number(item.start.y || 0) + shift.y, 2);
      } else {
        s.x = item.start.x;
        s.y = item.start.y;
      }
      // Font size/scale are deliberately untouched: this is text reflow, not scaling.
      S.applyLayer(item.id);
      textProps.boxWidth.value = Math.round(width);
    } else if (drag.action === 'media-resize') {
      const item = drag.items[0];
      const s = stateFor(item.id);
      if (!s || !['image','video'].includes(s.type)) return;
      const dx = p.x - drag.startScene.x;
      const dy = p.y - drag.startScene.y;
      const rotation = Number(item.start.rotation || 0);
      const localDelta = rotateVector(dx, dy, -rotation);
      const scale = Math.max(0.02, Number(item.start.scale || 1));
      const edge = String(drag.edge || 'e');
      let width = Math.max(1, Number(item.startWidth || 1));
      let height = Math.max(1, Number(item.startHeight || 1));
      let shiftX = 0;
      let shiftY = 0;

      if (edge === 'e' || edge === 'w') {
        const localDx = localDelta.x / scale;
        width = clamp(item.startWidth + (edge === 'w' ? -localDx : localDx), 1, 20000);
        if (edge === 'w') shiftX = (item.startWidth - width) * scale;
      }
      if (edge === 's' || edge === 'n') {
        const localDy = localDelta.y / scale;
        height = clamp(item.startHeight + (edge === 'n' ? -localDy : localDy), 1, 20000);
        if (edge === 'n') shiftY = (item.startHeight - height) * scale;
      }

      s.width = round(width, 2);
      s.height = round(height, 2);
      if (shiftX || shiftY) {
        const shift = rotateVector(shiftX, shiftY, rotation);
        s.x = round(Number(item.start.x || 0) + shift.x, 2);
        s.y = round(Number(item.start.y || 0) + shift.y, 2);
      } else {
        s.x = item.start.x;
        s.y = item.start.y;
      }
      S.applyLayer(item.id);
      if (s.type === 'image') syncImageControls(); else syncVideoControls();
    } else if (drag.action === 'scale') {
      const dist = Math.hypot(p.x - drag.center.x, p.y - drag.center.y) || 1;
      const factor = clamp(dist / drag.startDistance, .02, 50);
      drag.items.forEach(item => {
        const s = stateFor(item.id);
        const nextScale = round(clamp(item.start.scale * factor, .02, 8), 4);
        const nextCenter = {
          x: drag.center.x + (item.center.x - drag.center.x) * factor,
          y: drag.center.y + (item.center.y - drag.center.y) * factor
        };
        s.scale = nextScale;
        if (!s.flow) {
          const pos = positionFromCenter(nextCenter, item.size, nextScale, item.start.rotation);
          s.x = round(pos.x, 2);
          s.y = round(pos.y, 2);
        }
        S.applyLayer(item.id);
      });
    } else if (drag.action === 'rotate') {
      const angle = Math.atan2(p.y - drag.center.y, p.x - drag.center.x);
      const deltaDeg = (angle - drag.startAngle) * 180 / Math.PI;
      drag.items.forEach(item => {
        const s = stateFor(item.id);
        const rel = { x: item.center.x - drag.center.x, y: item.center.y - drag.center.y };
        const rotated = rotateVector(rel.x, rel.y, deltaDeg);
        const nextCenter = { x: drag.center.x + rotated.x, y: drag.center.y + rotated.y };
        const nextRotation = round(item.start.rotation + deltaDeg, 2);
        s.rotation = nextRotation;
        if (!s.flow) {
          const pos = positionFromCenter(nextCenter, item.size, item.start.scale, nextRotation);
          s.x = round(pos.x, 2);
          s.y = round(pos.y, 2);
        }
        S.applyLayer(item.id);
      });
    }
    updateSelection();
  }, { passive: true });

  window.addEventListener('pointerup', e => {
    if (!drag) return;
    const finished=drag;drag=null;
    if(finished.action==='move'){
      const targetScene=sceneAtViewportPoint(e.clientX,e.clientY);
      if(Number.isFinite(Number(targetScene))&&targetScene!==finished.sourceScene){
        const ids=finished.items.map(item=>item.id);
        const placements={};
        ids.forEach(id=>{const el=elementFor(id);if(!el)return;const rect=el.getBoundingClientRect();placements[id]={x:rect.left,y:rect.top};});
        S.moveLayersToScene?.(ids,targetScene,placements);setActiveScene(targetScene,{preserveSelection:true});setSelection(ids,ids[0]);
      }
    }
    renderLayerList();
    autosave();
  }, { passive: true });

  function translateSelection(dx, dy) {
    const ids = movementIds(selectedArray());
    if (!ids.length || ids.some(id => stateFor(id).locked)) return false;
    ids.forEach(id => {
      const s = stateFor(id);
      s.x = round(s.x + dx, 2);
      s.y = round(s.y + dy, 2);
      S.applyLayer(id);
    });
    updateSelection();
    return true;
  }

  Object.entries(props).forEach(([key, input]) => {
    input.addEventListener('input', () => {
      const ids = selectedArray();
      if (!ids.length) return;
      const v0 = Number(input.value);
      if (!Number.isFinite(v0)) return;

      if (ids.length > 1) {
        if (key !== 'x' && key !== 'y') return;
        const bounds = selectionBounds(ids);
        if (!bounds) return;
        translateSelection(key === 'x' ? v0 - bounds.minX : 0, key === 'y' ? v0 - bounds.minY : 0);
        renderLayerList(); autosave();
        return;
      }

      const s = stateFor(ids[0]);
      let v = v0;
      if (key === 'scale') v = clamp(v, .02, 8);
      if (key === 'opacity') v = clamp(v, 0, 1);
      if (key === 'x' || key === 'y') {
        const bounds = selectionBounds(ids);
        translateSelection(key === 'x' ? v - bounds.minX : 0, key === 'y' ? v - bounds.minY : 0);
      } else if (key === 'z') {
        S.moveLayerToRank(ids[0], Math.round(v));
        S.applyLayout();
      } else if (key === 'scale') {
        const binding = S.bindingForLayer(ids[0]);
        const oldScale = Math.max(.000001, Number(s.scale) || 1);
        const factor = v / oldScale;
        const anchorX = Number(s.x) || 0, anchorY = Number(s.y) || 0;
        const members = binding ? binding.members.filter(id => stateFor(id)) : [ids[0]];
        members.forEach(id => {
          const member = stateFor(id);
          if (id === ids[0]) member.scale = v;
          else {
            member.x = round(anchorX + (Number(member.x || 0) - anchorX) * factor, 2);
            member.y = round(anchorY + (Number(member.y || 0) - anchorY) * factor, 2);
            member.scale = round(clamp((Number(member.scale) || 1) * factor, .02, 8), 4);
          }
          S.applyLayer(id);
        });
      } else if (key === 'rotation') {
        const binding = S.bindingForLayer(ids[0]);
        const oldRotation = Number(s.rotation) || 0;
        const delta = v - oldRotation;
        const size = naturalSize(elementFor(ids[0]));
        const pivot = visualCenter(s, size);
        const members = binding ? binding.members.filter(id => stateFor(id)) : [ids[0]];
        members.forEach(id => {
          const member = stateFor(id);
          if (id === ids[0]) { member.rotation = v; S.applyLayer(id); return; }
          const mSize = naturalSize(elementFor(id));
          const mCenter = visualCenter(member, mSize);
          const rel = rotateVector(mCenter.x - pivot.x, mCenter.y - pivot.y, delta);
          const nextRotation = round((Number(member.rotation) || 0) + delta, 2);
          const pos = positionFromCenter({x:pivot.x+rel.x,y:pivot.y+rel.y}, mSize, member.scale, nextRotation);
          member.rotation = nextRotation; member.x = round(pos.x,2); member.y = round(pos.y,2);
          S.applyLayer(id);
        });
      } else {
        s[key] = v;
        S.applyLayer(ids[0]);
      }
      updateSelection(); renderLayerList(); autosave();
    });
  });

  document.getElementById('bringFront').addEventListener('click', () => {
    const ids = selectedArray();
    if (ids.length !== 1) return;
    if (S.moveLayerStep(ids[0], -1)) {
      S.applyLayout();
      renderLayerList(); updateSelection(); autosave('Layer order updated');
    }
  });

  document.getElementById('sendBack').addEventListener('click', () => {
    const ids = selectedArray();
    if (ids.length !== 1) return;
    if (S.moveLayerStep(ids[0], 1)) {
      S.applyLayout();
      renderLayerList(); updateSelection(); autosave('Layer order updated');
    }
  });

  document.getElementById('toggleVisible').addEventListener('click', () => {
    const ids = selectedArray(); if (!ids.length) return;
    const next = !ids.every(id => stateFor(id).visible);
    ids.forEach(id => { stateFor(id).visible = next; S.applyLayer(id); });
    renderLayerList(); updateSelection(); autosave();
  });

  document.getElementById('toggleLock').addEventListener('click', () => {
    const ids = selectedArray(); if (!ids.length) return;
    const next = !ids.every(id => stateFor(id).locked);
    ids.forEach(id => { stateFor(id).locked = next; S.applyLayer(id); });
    renderLayerList(); updateSelection(); autosave();
  });

  bindBtn.addEventListener('click', () => {
    const ids = selectedArray();
    if (ids.length < 2) return;
    S.bindLayers(ids);
    S.persistLayout();
    setSelection(ids, primaryId);
    autosave('Elements bound for scrolling');
  });

  unbindBtn.addEventListener('click', () => {
    const ids = selectedArray();
    if (!ids.length) return;
    S.unbindLayers(ids);
    S.persistLayout();
    setSelection(ids, primaryId);
    autosave('Elements unbound');
  });

  document.getElementById('addText').addEventListener('click', () => {
    const id = S.addTextLayer(tr('newText'), activeScene);
    S.persistLayout();
    setSelection([id], id);
    setTimeout(() => { textProps.contentEn.focus(); textProps.contentEn.select(); }, 0);
    autosave('Text added');
  });

  document.getElementById('addImage').addEventListener('change', async e => {
    const file = firstFileFromEvent(e);
    if (!file) return;
    saveStatus.textContent = tr('addingImage');
    try {
      const id = await S.addImageLayer(file, activeScene);
      S.persistLayout();
      setSelection([id], id);
      autosave('Image added');
    } catch (err) {
      alert(tr('errAddImage', { error: err.message }));
    }
    if (e.target instanceof HTMLInputElement) e.target.value = '';
  });

  deleteLayerBtn.addEventListener('click', async () => {
    const ids = selectedArray();
    if (ids.length !== 1) return;
    const s = stateFor(ids[0]);
    if(!s)return;
    if (!confirm(tr('deleteConfirm', { name: displayLayerName(ids[0], s) }))) return;
    const deletedId = ids[0];
    await S.removeLayer(deletedId);
    S.persistLayout();
    const fallback = Object.keys(S.layout.layers).find(id => layerScene(id) === activeScene) || null;
    setSelection(fallback ? [fallback] : [], fallback);
    autosave('Layer deleted');
  });

  function ensureTextStyle(s) {
    if (!s.textStyle) s.textStyle = { fontSize: null, fontWeight: null, letterSpacing: null, lineHeight: null, color: null, align: null, fontFamily: 'inherit' };
    return s.textStyle;
  }

  function ensureBilingualText(s) {
    if (!s.texts || typeof s.texts !== 'object') s.texts = {};
    const fallback = typeof s.text === 'string' ? s.text : '';
    if (s.texts.en === undefined) s.texts.en = fallback;
    if (s.texts.zh === undefined) s.texts.zh = s.texts.en;
    s.localized = true;
    return s.texts;
  }

  function updateBilingualText(language, value) {
    const ids = selectedArray();
    const s = ids.length === 1 ? stateFor(ids[0]) : null;
    if (!isTextLayer(s)) return;
    const texts = ensureBilingualText(s);
    texts[language] = value;
    s.text = texts.en || '';
    if (!s.core) s.name = ((texts.en || texts.zh || '').trim().split(/\s+/).slice(0, 5).join(' ') || 'Text').slice(0, 32);
    S.applyLayer(ids[0]);
    renderLayerList(); updateSelection(); autosave('Text updated');
  }
  textProps.contentEn.addEventListener('input', () => updateBilingualText('en', textProps.contentEn.value));
  textProps.contentZh.addEventListener('input', () => updateBilingualText('zh', textProps.contentZh.value));
  [textProps.contentEn, textProps.contentZh].forEach(input => input.addEventListener('keydown', e => e.stopPropagation()));
  displayGroup?.addEventListener('change', () => {
    const ids = selectedArray();
    if (ids.length !== 1 || Number(stateFor(ids[0])?.scene) !== 1) return;
    stateFor(ids[0]).displayGroup = displayGroup.value;
    S.applyLayer(ids[0]);
    updateSelection();
    autosave('Display group updated');
  });

  textProps.fontFamily.addEventListener('change', () => {
    const ids = selectedArray();
    const s = ids.length === 1 ? stateFor(ids[0]) : null;
    if (!isTextLayer(s)) return;
    ensureTextStyle(s).fontFamily = textProps.fontFamily.value || 'inherit';
    S.applyLayer(ids[0]); updateSelection(); autosave('Text style updated');
  });

  textProps.boxWidth.addEventListener('input', () => {
    const ids = selectedArray();
    const s = ids.length === 1 ? stateFor(ids[0]) : null;
    if (!isTextLayer(s)) return;
    const width = Number(textProps.boxWidth.value);
    if (!Number.isFinite(width)) return;
    s.boxWidth = round(clamp(width, 40, 3000), 2);
    S.applyLayer(ids[0]);
    updateSelection();
    autosave('Text box resized');
  });
  textProps.boxWidth.addEventListener('keydown', e => e.stopPropagation());

  [['fontSize','fontSize'],['fontWeight','fontWeight'],['letterSpacing','letterSpacing'],['lineHeight','lineHeight']].forEach(([control, key]) => {
    textProps[control].addEventListener('input', () => {
      const ids = selectedArray();
      const s = ids.length === 1 ? stateFor(ids[0]) : null;
      if (!isTextLayer(s)) return;
      const v = Number(textProps[control].value); if (!Number.isFinite(v)) return;
      ensureTextStyle(s)[key] = v;
      S.applyLayer(ids[0]); updateSelection(); autosave('Text style updated');
    });
  });

  function rgbToHex(value) {
    const m = String(value || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (!m) return '#ffffff';
    return '#' + [m[1],m[2],m[3]].map(v => Math.max(0,Math.min(255,Number(v))).toString(16).padStart(2,'0')).join('');
  }

  function normaliseHex(value) {
    const v = String(value || '').trim();
    if (/^#[0-9a-f]{6}$/i.test(v)) return v;
    if (/^#[0-9a-f]{3}$/i.test(v)) return '#' + v.slice(1).split('').map(x => x + x).join('');
    return '#ffffff';
  }

  function setTextColor(value) {
    const ids = selectedArray();
    const s = ids.length === 1 ? stateFor(ids[0]) : null;
    if (!isTextLayer(s)) return;
    const hex = normaliseHex(value);
    ensureTextStyle(s).color = hex;
    textProps.color.value = hex;
    textProps.colorHex.value = hex;
    S.applyLayer(ids[0]); autosave('Text color updated');
  }
  textProps.color.addEventListener('input', () => setTextColor(textProps.color.value));
  textProps.colorHex.addEventListener('change', () => setTextColor(textProps.colorHex.value));
  textProps.align.addEventListener('change', () => {
    const ids = selectedArray();
    const s = ids.length === 1 ? stateFor(ids[0]) : null;
    if (!isTextLayer(s)) return;
    ensureTextStyle(s).align = textProps.align.value;
    S.applyLayer(ids[0]); updateSelection(); autosave('Text alignment updated');
  });
  [[textProps.enterDelay, 'enterDelayMs'], [textProps.visibleFor, 'fadeInMs']].forEach(([input, key]) => input.addEventListener('input', () => {
    const ids = selectedArray();
    const s = ids.length === 1 ? stateFor(ids[0]) : null;
    if (!isTextLayer(s)) return;
    if (!s.displayTiming) s.displayTiming = { enterDelayMs: 0, fadeInMs: 0 };
    const value = Number(input.value);
    if (!Number.isFinite(value)) return;
    const max = 10000;
    s.displayTiming[key] = clamp(Math.round(value), 0, max);
    S.applyLayer(ids[0]); updateSelection(); autosave('Text timing updated');
  }));


  function updateTextLink() {
    const ids = selectedArray();
    const s = ids.length === 1 ? stateFor(ids[0]) : null;
    if (!isTextLayer(s)) return;
    const href = textProps.linkHref.value.trim();
    const link = href ? { href, target: textProps.linkTarget.value === '_blank' ? '_blank' : '_self', offset: Number(textProps.linkOffset.value || 0) } : null;
    const anchor = elementFor(ids[0])?.closest('a');
    const linkedIds = anchor ? [...anchor.querySelectorAll('[data-layer-id]')].map(el => el.dataset.layerId).filter(id => stateFor(id)?.type === 'text') : ids;
    linkedIds.forEach(id => {
      const state = stateFor(id);
      if (!state) return;
      state.link = link ? { ...link } : null;
      S.applyLayer(id);
    });
    autosave('Link updated');
  }
  textProps.linkHref.addEventListener('input', updateTextLink);
  textProps.linkTarget.addEventListener('change', updateTextLink);
  textProps.linkOffset.addEventListener('input', updateTextLink);
  [textProps.linkHref, textProps.linkOffset].forEach(input => input.addEventListener('keydown', e => e.stopPropagation()));

  function updateSelectedImageDimension(key, rawValue) {
    const ids = selectedArray();
    const s = ids.length === 1 ? stateFor(ids[0]) : null;
    if (!isImageLayer(s)) return;
    const value = clamp(Number(rawValue) || 1, 1, 20000);
    const oldValue = Math.max(1, Number(s[key]) || 1);
    const factor = value / oldValue;
    const anchorX = Number(s.x) || 0, anchorY = Number(s.y) || 0;
    const binding = S.bindingForLayer(ids[0]);
    const members = binding ? binding.members.filter(id => stateFor(id)?.type === 'image') : [ids[0]];
    members.forEach(id => {
      const member = stateFor(id);
      if (id === ids[0]) member[key] = round(value, 2);
      else if (key === 'width') {
        member.x = round(anchorX + (Number(member.x || 0) - anchorX) * factor, 2);
        member.width = round(Math.max(1, Number(member.width || 1) * factor), 2);
      } else {
        member.y = round(anchorY + (Number(member.y || 0) - anchorY) * factor, 2);
        member.height = round(Math.max(1, Number(member.height || 1) * factor), 2);
      }
      S.applyLayer(id);
    });
    updateSelection();
    syncImageControls();
    autosave('Image resized');
  }
  imageWidth?.addEventListener('input', () => updateSelectedImageDimension('width', imageWidth.value));
  imageHeight?.addEventListener('input', () => updateSelectedImageDimension('height', imageHeight.value));
  [imageWidth, imageHeight].forEach(input => input?.addEventListener('keydown', e => e.stopPropagation()));

  restoreImageAspect?.addEventListener('click', () => {
    const ids = selectedArray();
    const s = ids.length === 1 ? stateFor(ids[0]) : null;
    if (!isImageLayer(s)) return;
    ensureSourceDimensions(ids[0], s);
    const sw = Number(s.sourceWidth || 0), sh = Number(s.sourceHeight || 0);
    if (!(sw > 0 && sh > 0)) return;
    const currentWidth = Math.max(1, Number(s.width || sw));
    s.width = round(currentWidth, 2);
    s.height = round(currentWidth * sh / sw, 2);
    S.applyLayer(ids[0]);
    updateSelection();
    syncImageControls();
    autosave('Image ratio restored');
  });

  restoreImageSize?.addEventListener('click', () => {
    const ids = selectedArray();
    const s = ids.length === 1 ? stateFor(ids[0]) : null;
    if (!isImageLayer(s)) return;
    ensureSourceDimensions(ids[0], s);
    const sw = Number(s.sourceWidth || 0), sh = Number(s.sourceHeight || 0);
    if (!(sw > 0 && sh > 0)) return;
    s.width = round(sw, 2);
    s.height = round(sh, 2);
    S.applyLayer(ids[0]);
    updateSelection();
    syncImageControls();
    autosave('Image size restored');
  });

  Object.entries(imageProps).forEach(([key, input]) => {
    input.addEventListener('input', () => {
      const ids = selectedArray();
      const s = ids.length === 1 ? stateFor(ids[0]) : null;
      if (s?.type !== 'image') return;
      ensureImageStyle(s)[key] = Number(input.value);
      S.applyLayer(ids[0]);
      syncImageControls();
      autosave('Image color updated');
    });
  });

  function rotateSelectedImage(delta) {
    const ids = selectedArray();
    const s = ids.length === 1 ? stateFor(ids[0]) : null;
    if (!isImageLayer(s)) return;
    const size = naturalSize(elementFor(ids[0]));
    const center = visualCenter(s, size);
    const nextRotation = round((Number(s.rotation) || 0) + delta, 2);
    const pos = positionFromCenter(center, size, s.scale, nextRotation);
    s.rotation = nextRotation;
    s.x = round(pos.x, 2);
    s.y = round(pos.y, 2);
    S.applyLayer(ids[0]);
    updateSelection();
    autosave('Image rotated');
  }
  document.getElementById('rotateImageLeft').addEventListener('click', () => rotateSelectedImage(-90));
  document.getElementById('rotateImageRight').addEventListener('click', () => rotateSelectedImage(90));
  document.getElementById('resetImageColor').addEventListener('click', () => {
    const ids = selectedArray();
    const s = ids.length === 1 ? stateFor(ids[0]) : null;
      if (!isImageLayer(s)) return;
    s.imageStyle = { brightness: 1, contrast: 1, saturation: 1, hue: 0 };
    S.applyLayer(ids[0]);
    syncImageControls();
    autosave('Image color reset');
  });

  replaceSelectedVideo?.addEventListener('change', async event => {
    const file = firstFileFromEvent(event);
    if (!file) return;
    const ids = selectedArray();
    const id = ids.length === 1 && stateFor(ids[0])?.type === 'video' ? ids[0] : null;
    if (!id) { if (event.target instanceof HTMLInputElement) event.target.value = ''; return; }
    saveStatus.textContent = tr('replacingVideo');
    try {
      await S.replaceVideoLayer(id, file);
      S.persistLayout();
      setSelection([id], id);
      syncVideoControls();
      autosave('Video replaced');
    } catch (error) {
      saveStatus.textContent = currentLang() === 'zh' ? `无法更换视频：${error.message}` : `Could not replace video: ${error.message}`;
    } finally {
      if (event.target instanceof HTMLInputElement) event.target.value = '';
    }
  });

  function setSelectedMediaScale(value) {
    const ids=selectedArray();
    const s=ids.length===1?stateFor(ids[0]):null;
    if(!isMediaLayer(s))return;
    const next=clamp(Number(value)||1,.02,8);
    const oldScale=Math.max(.000001,Number(s.scale)||1),factor=next/oldScale;
    const anchorX=Number(s.x)||0,anchorY=Number(s.y)||0;
    const binding=S.bindingForLayer(ids[0]);
    const members=binding?binding.members.filter(id=>stateFor(id)):[ids[0]];
    members.forEach(id=>{const member=stateFor(id);if(id===ids[0])member.scale=next;else{member.x=round(anchorX+(Number(member.x||0)-anchorX)*factor,2);member.y=round(anchorY+(Number(member.y||0)-anchorY)*factor,2);member.scale=round(clamp((Number(member.scale)||1)*factor,.02,8),4)}S.applyLayer(id)});
    props.scale.value=round(next,4);
    if(mediaScaleRange)mediaScaleRange.value=String(clamp(next,.1,4));
    if(mediaScaleNumber)mediaScaleNumber.value=String(round(next,4));
    if(mediaScaleOut)mediaScaleOut.textContent=`${Math.round(next*100)}%`;
    updateSelection();
    autosave('Media scale updated');
  }
  mediaScaleRange?.addEventListener('input',()=>setSelectedMediaScale(mediaScaleRange.value));
  mediaScaleNumber?.addEventListener('input',()=>{
    if(mediaScaleNumber.value===''||!Number.isFinite(Number(mediaScaleNumber.value)))return;
    setSelectedMediaScale(mediaScaleNumber.value);
  });

  videoFit.addEventListener('change', () => {
    const ids = selectedArray();
    const s = ids.length === 1 ? stateFor(ids[0]) : null;
    if (!isVideoLayer(s)) return;
    s.fit = /** @type {'cover'|'contain'|'fill'} */ (videoFit.value);
    S.applyLayer(ids[0]);
    autosave('Video fit updated');
  });
  videoScrub?.addEventListener('input', () => {
    const ids = selectedArray();
    const id = ids.length === 1 && stateFor(ids[0])?.type === 'video' ? ids[0] : null;
    const video = id ? elementFor(id) : null;
    if (!video || video.tagName !== 'VIDEO') return;
    pauseEditorVideo(video);
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    if (!duration) return;
    const next = clamp(Number(videoScrub.value) || 0, 0, duration);
    try { video.currentTime = next; } catch (_) {}
    videoScrubOut.textContent = `${formatVideoTime(next)} / ${formatVideoTime(duration)}`;
  });
  videoOpacity?.addEventListener('input', () => {
    const ids = selectedArray();
    const s = ids.length === 1 ? stateFor(ids[0]) : null;
    if (!isVideoLayer(s)) return;
    s.opacity = clamp(Number(videoOpacity.value) || 0, 0, 1);
    props.opacity.value = round(s.opacity, 2);
    S.applyLayer(ids[0]);
    videoOpacityOut.textContent = `${Math.round(s.opacity * 100)}%`;
    autosave('Video opacity updated');
  });
  videoSpeed?.addEventListener('input', () => {
    const ids = selectedArray();
    const s = ids.length === 1 ? stateFor(ids[0]) : null;
    if (!isVideoLayer(s)) return;
    const scene = layerScene(ids[0]);
    // The cinematic speed control is intentionally scoped to Scenes 2–4.
    // Other video layers retain their stored rate unchanged.
    if (![2, 3, 4].includes(scene)) {
      videoSpeed.value = String(clamp(Number(s.playbackRate) || 1, 0.25, 3));
      return;
    }
    s.playbackRate = clamp(Number(videoSpeed.value) || 1, 0.25, 3);
    S.applyLayer(ids[0]);
    if (videoSpeedOut) videoSpeedOut.textContent = `${s.playbackRate.toFixed(2)}×`;
    autosave('Video speed updated');
  });
  document.getElementById('resetSelectedVideo')?.addEventListener('click', () => {
    const ids = selectedArray();
    const id = ids.length === 1 && stateFor(ids[0])?.type === 'video' ? ids[0] : null;
    const video = id ? elementFor(id) : null;
    if (!video || video.tagName !== 'VIDEO') return;
    pauseEditorVideo(video);
    try { video.currentTime = 0; } catch (_) {}
    videoScrub.value = '0';
    syncVideoControls();
  });

  const sceneTopShade = inputById('sceneTopShade');
  const sceneTopShadeOut = outputById('sceneTopShadeOut');
  const sceneBottomShade = inputById('sceneBottomShade');
  const sceneBottomShadeOut = outputById('sceneBottomShadeOut');
  function syncSceneShades() {
    const shade = ensureSceneShadeState(activeScene);
    if (sceneShadeHint) sceneShadeHint.textContent = sceneName(activeScene);
    sceneTopShade.value = shade.top;
    sceneBottomShade.value = shade.bottom;
    sceneTopShadeOut.textContent = `${Math.round(Number(shade.top) * 100)}%`;
    sceneBottomShadeOut.textContent = `${Math.round(Number(shade.bottom) * 100)}%`;
  }
  [[sceneTopShade, 'top'], [sceneBottomShade, 'bottom']].forEach(([input, edge]) => input.addEventListener('input', () => {
    const shade = ensureSceneShadeState(activeScene);
    shade[edge] = clamp(Number(input.value), 0, 1);
    if (activeScene === 1 && edge === 'bottom') S.layout.transition.bottomShade = shade.bottom;
    S.applyLayout();
    syncSceneShades();
    autosave('Transition updated');
  }));

  const bgX = inputById('bgX'), bgY = inputById('bgY'), bgZoom = inputById('bgZoom');
  const bgXOut = outputById('bgXOut'), bgYOut = outputById('bgYOut'), bgZoomOut = outputById('bgZoomOut');
  function syncBg(){const bg=S.backgroundForScene(activeScene)||{};bgX.value=bg.x??50;bgY.value=bg.y??50;bgZoom.value=bg.zoom??1;bgXOut.textContent=`${Number(bg.x??50).toFixed(0)}%`;bgYOut.textContent=`${Number(bg.y??50).toFixed(0)}%`;bgZoomOut.textContent=`${Number(bg.zoom??1).toFixed(2)}×`;if(backgroundFileInfo){const dims=bg.sourceWidth&&bg.sourceHeight?`${Math.round(bg.sourceWidth)}×${Math.round(bg.sourceHeight)}`:'',sourceLabel=bg.src?(bg.fileName||(bg.src?.startsWith('uploads/')?tr('imageWord'):tr('builtIn'))):tr('noBackground');backgroundFileInfo.textContent=[sourceLabel,dims].filter(Boolean).join(' · ')}}
  replaceBackgroundImage?.addEventListener('change', async event => {
    const file = firstFileFromEvent(event);
    if (!file) return;
    saveStatus.textContent = tr('replacingBackground');
    try {
      await S.replaceBackground(file,activeScene);
      S.persistLayout();
      syncBg();
      autosave('Background replaced');
    } catch (error) {
      saveStatus.textContent = currentLang() === 'zh' ? `无法更换背景：${error.message}` : `Could not replace background: ${error.message}`;
    } finally {
      if (event.target instanceof HTMLInputElement) event.target.value = '';
    }
  });

  [[bgX,'x'],[bgY,'y'],[bgZoom,'zoom']].forEach(([input,key]) => input.addEventListener('input', () => {
    const bg=S.backgroundForScene(activeScene);bg[key]=Number(input.value);if(activeScene===1)S.layout.background={...bg};S.applyLayout();syncBg();autosave();
  }));

  const guidesToggle=inputById('guidesToggle');
  function syncGuides(){if(guides)guides.style.display=guidesToggle?.checked?'block':'none';}
  guidesToggle?.addEventListener('change',syncGuides);
  syncGuides();


  const xr = {
    radius: inputById('xrayRadius'),
    feather: inputById('xrayFeather'),
    activationDistance: inputById('xrayActivationDistance'),
    expansionDuration: inputById('xrayExpansionDuration'),
    mainOpacity: inputById('xrayMainOpacity'),
    perspectiveOpacity: inputById('xrayPerspectiveOpacity'),
    bonesOpacity: inputById('xrayBonesOpacity')
  };
  const xrOut = {
    radius: outputById('xrayRadiusOut'),
    feather: outputById('xrayFeatherOut'),
    activationDistance: outputById('xrayActivationDistanceOut'),
    expansionDuration: outputById('xrayExpansionDurationOut'),
    mainOpacity: outputById('xrayMainOpacityOut'),
    perspectiveOpacity: outputById('xrayPerspectiveOpacityOut'),
    bonesOpacity: outputById('xrayBonesOpacityOut')
  };
  const rainDensity = inputById('digitalRainDensity');
  const rainDensityOut = outputById('digitalRainDensityOut');
  const rainDigitSize = inputById('digitalRainDigitSize');
  const rainDigitSizeOut = outputById('digitalRainDigitSizeOut');
  function syncXray() {
    const x = S.layout.xray || {};
    xr.radius.value = x.radius; xr.feather.value = x.feather; xr.activationDistance.value = x.activationDistance ?? (Number(x.radius) * 0.5);
    xr.mainOpacity.value = 0; xr.perspectiveOpacity.value = x.perspectiveOpacity; xr.bonesOpacity.value = x.bonesOpacity; xr.expansionDuration.value = x.expansionDurationMs ?? 1050;
    xrOut.radius.textContent = `${x.radius}px`;
    xrOut.feather.textContent = `${x.feather}px`;
    xrOut.activationDistance.textContent = `${Number(x.activationDistance ?? (Number(x.radius) * 0.5)).toFixed(0)}px`;
    xrOut.expansionDuration.textContent = `${Math.round(Number(x.expansionDurationMs ?? 1050))}ms`;
    xrOut.mainOpacity.textContent = '0%';
    xrOut.perspectiveOpacity.textContent = `${Math.round(Number(x.perspectiveOpacity) * 100)}%`;
    xrOut.bonesOpacity.textContent = `${Math.round(Number(x.bonesOpacity) * 100)}%`;
    const rain = S.layout.digitalRain || (S.layout.digitalRain = { density: 1.60, digitSize: 1.10 });
    if (rainDensity) rainDensity.value = Number(rain.density ?? 1.60);
    if (rainDigitSize) rainDigitSize.value = Number(rain.digitSize ?? 1.10);
    if (rainDensityOut) rainDensityOut.textContent = `${Number(rain.density ?? 1.60).toFixed(2)}×`;
    if (rainDigitSizeOut) rainDigitSizeOut.textContent = `${Number(rain.digitSize ?? 1.10).toFixed(2)}×`;
  }
  [['radius','radius'],['feather','feather'],['activationDistance','activationDistance'],['expansionDuration','expansionDurationMs'],['perspectiveOpacity','perspectiveOpacity'],['bonesOpacity','bonesOpacity']].forEach(([inputKey,stateKey]) => {
    xr[inputKey].addEventListener('input', () => {
      S.layout.xray[stateKey] = Number(xr[inputKey].value);
      S.applyLayout();
      syncXray();
      autosave('X-ray updated');
    });
  });
  [[rainDensity,'density'],[rainDigitSize,'digitSize']].forEach(([input,key]) => input?.addEventListener('input', () => {
    if (!S.layout.digitalRain) S.layout.digitalRain = { density: 1.60, digitSize: 1.10 };
    S.layout.digitalRain[key] = Number(input.value);
    syncXray();
    autosave('Digital rain updated');
  }));

  const transitionLift = inputById('transitionLift');
  const transitionLiftOut = outputById('transitionLiftOut');
  const foregroundSpeed = inputById('foregroundSpeed');
  const foregroundSpeedOut = outputById('foregroundSpeedOut');
  const backgroundSpeed = inputById('backgroundSpeed');
  const backgroundSpeedOut = outputById('backgroundSpeedOut');
  const bottomShade = inputById('bottomShade');
  const bottomShadeOut = outputById('bottomShadeOut');
  const pageDwellRatio=inputById('pageDwellRatio');
  const pageDwellRatioOut=outputById('pageDwellRatioOut');
  function ensureCinematicSettingsState(){
    if(!S.layout.cinematicSettings||typeof S.layout.cinematicSettings!=='object')S.layout.cinematicSettings={};
    S.layout.cinematicSettings.pauseInertiaMs=clamp(Number(S.layout.cinematicSettings.pauseInertiaMs??180)||0,0,1200);
    return S.layout.cinematicSettings;
  }
  function syncTransition() {
    const t=ensureSceneTransitionState(activeScene),cinematic=ensureCinematicSettingsState();
    transitionLift.value=t.lift??0;foregroundSpeed.value=t.foregroundSpeed??1;backgroundSpeed.value=t.backgroundSpeed??0.5;bottomShade.value=t.bottomShade??0;pageDwellRatio.value=t.dwellRatio??0;
    if(videoCrossfadeMs)videoCrossfadeMs.value=t.crossfadeMs??300;
    if(videoPauseInertiaMs)videoPauseInertiaMs.value=cinematic.pauseInertiaMs??180;
    transitionLiftOut.textContent=`${Number(t.lift??0).toFixed(0)}px`;foregroundSpeedOut.textContent=`${Number(t.foregroundSpeed??1).toFixed(2)}×`;backgroundSpeedOut.textContent=`${Number(t.backgroundSpeed??0.5).toFixed(2)}×`;bottomShadeOut.textContent=`${Math.round(Number(t.bottomShade??0)*100)}%`;pageDwellRatioOut.textContent=`${Math.round(Number(t.dwellRatio??0)*100)}%`;
    if(videoCrossfadeMsOut)videoCrossfadeMsOut.textContent=`${Math.round(Number(t.crossfadeMs??300))}ms`;
    if(videoPauseInertiaMsOut)videoPauseInertiaMsOut.textContent=`${Math.round(Number(cinematic.pauseInertiaMs??180))}ms`;
    const dwellRow=pageDwellRatio.closest('.range-row');if(dwellRow)dwellRow.hidden=[2,3,4,5].includes(Number(activeScene));
    if(videoCrossfadeRow)videoCrossfadeRow.hidden=![2,3].includes(Number(activeScene));
    // v46 navigation-driven browsing has no wheel/trackpad pause gesture.
    if(videoPauseInertiaRow)videoPauseInertiaRow.hidden=true;
    const hint=document.querySelector('#transitionControls .section-title .hint');if(hint){const next=Math.min(MAX_SCENE_ID,activeScene+1);hint.textContent=activeScene<MAX_SCENE_ID?`${sceneName(activeScene)} → ${sceneName(next)}`:sceneName(activeScene)}
  }
  [[transitionLift,'lift'],[foregroundSpeed,'foregroundSpeed'],[backgroundSpeed,'backgroundSpeed'],[bottomShade,'bottomShade'],[pageDwellRatio,'dwellRatio']].forEach(([input,key])=>{input.addEventListener('input',()=>{const t=ensureSceneTransitionState(activeScene);t[key]=Number(input.value);if(activeScene===1)S.layout.transition={...t};S.applyLayout();syncTransition();autosave('Transition updated');});});
  videoCrossfadeMs?.addEventListener('input',()=>{if(![2,3].includes(Number(activeScene)))return;const t=ensureSceneTransitionState(activeScene);t.crossfadeMs=clamp(Number(videoCrossfadeMs.value)||0,0,3000);S.applyLayout();syncTransition();autosave('Transition updated');});
  videoPauseInertiaMs?.addEventListener('input',()=>{const cinematic=ensureCinematicSettingsState();cinematic.pauseInertiaMs=clamp(Number(videoPauseInertiaMs.value)||0,0,1200);syncTransition();autosave('Cinematic interaction updated');});

  function makeRangeOutputEditable(slider, output, mode = 'raw') {
    if (!slider || !output) return;
    output.setAttribute('contenteditable', 'true');
    output.setAttribute('role', 'textbox');
    output.setAttribute('inputmode', 'decimal');
    output.setAttribute('tabindex', '0');
    output.classList.add('editable-range-output');
    let beforeEdit = '';

    const parseDisplayValue = raw => {
      const numeric = Number.parseFloat(String(raw).replace(',', '.'));
      if (!Number.isFinite(numeric)) return null;
      if (mode === 'percent-multiplier') return numeric / 100;
      return numeric;
    };
    const restore = () => slider.dispatchEvent(new Event('input', { bubbles: true }));
    const commit = () => {
      const parsed = parseDisplayValue(output.textContent);
      if (parsed === null) { restore(); return; }
      const min = slider.min === '' ? -Infinity : Number(slider.min);
      const max = slider.max === '' ? Infinity : Number(slider.max);
      const value = Math.min(max, Math.max(min, parsed));
      slider.value = String(value);
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    };
    output.addEventListener('focus', () => {
      beforeEdit = output.textContent;
      requestAnimationFrame(() => selectAllEditableText(output));
    });
    output.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); output.blur(); }
      else if (e.key === 'Escape') { e.preventDefault(); output.textContent = beforeEdit; output.blur(); }
    });
    output.addEventListener('blur', commit);
  }

  [siteTitleEn, siteTitleZh].forEach((input, index) => input?.addEventListener('input', () => {
    const title = ensureSiteTitleState();
    title[index === 0 ? 'en' : 'zh'] = input.value;
    S.applyLayout();
    autosave('Site title updated');
  }));

  [
    [imageProps.brightness, imagePropsOut.brightness, 'percent-multiplier'],
    [imageProps.contrast, imagePropsOut.contrast, 'percent-multiplier'],
    [imageProps.saturation, imagePropsOut.saturation, 'percent-multiplier'],
    [imageProps.hue, imagePropsOut.hue, 'raw'],
    [bgX, bgXOut, 'raw'], [bgY, bgYOut, 'raw'], [bgZoom, bgZoomOut, 'raw'],
    [xr.radius, xrOut.radius, 'raw'], [xr.feather, xrOut.feather, 'raw'], [xr.activationDistance, xrOut.activationDistance, 'raw'],
    [xr.mainOpacity, xrOut.mainOpacity, 'percent-multiplier'], [xr.perspectiveOpacity, xrOut.perspectiveOpacity, 'percent-multiplier'], [xr.bonesOpacity, xrOut.bonesOpacity, 'percent-multiplier'],
    [rainDensity, rainDensityOut, 'raw'], [rainDigitSize, rainDigitSizeOut, 'raw'],
    [transitionLift, transitionLiftOut, 'raw'], [foregroundSpeed, foregroundSpeedOut, 'raw'], [backgroundSpeed, backgroundSpeedOut, 'raw'], [bottomShade, bottomShadeOut, 'percent-multiplier'], [pageDwellRatio, pageDwellRatioOut, 'percent-multiplier'],
    [sceneTopShade, sceneTopShadeOut, 'percent-multiplier'], [sceneBottomShade, sceneBottomShadeOut, 'percent-multiplier'],
    [videoOpacity, videoOpacityOut, 'percent-multiplier'],
    [videoSpeed, videoSpeedOut, 'raw'],
    [videoCrossfadeMs, videoCrossfadeMsOut, 'raw'],
    [videoPauseInertiaMs, videoPauseInertiaMsOut, 'raw']
  ].forEach(([slider, output, mode]) => makeRangeOutputEditable(slider, output, mode));

  toggleSceneVisibility?.addEventListener('click',()=>{const nextVisible=!sceneIsVisible(activeScene);S.setSceneVisible(activeScene,nextVisible);S.persistLayout();syncSceneVisibilityUi();autosave(nextVisible?'Scene shown':'Scene hidden')});

  document.querySelectorAll('[data-scene-jump]').forEach(button => {
    button.addEventListener('click', () => {
      const scene = Number(button.dataset.sceneJump);
      setActiveScene(scene);
      syncEditSceneIsolation(scene);
      const groupFilter = document.getElementById('sceneGroupFilter');
      if (groupFilter) groupFilter.hidden = scene !== 1;
    });
  });

  document.querySelectorAll('[data-scene-group]').forEach(button => {
    button.addEventListener('click', () => {
      if (activeScene !== 1) return;
      sceneOneGroupView = button.dataset.sceneGroup || 'all';
      updateSceneUi();
    });
  });
  document.addEventListener('click', event => {
    const button = event.target instanceof Element ? event.target.closest('[data-scene-group]') : null;
    if (!button || activeScene !== 1) return;
    sceneOneGroupView = button.dataset.sceneGroup || 'all';
    updateSceneUi();
  });

  sceneTitleList?.addEventListener('input', event => {
    const input = event.target instanceof HTMLInputElement ? event.target : null;
    if (!input) return;
    const scene = Number(input.dataset.sceneTitle);
    const lang = input.dataset.sceneTitleLang === 'zh' ? 'zh' : 'en';
    if (!Number.isFinite(scene)) return;
    if (!S.layout.sceneTitles) S.layout.sceneTitles = {};
    const current = S.layout.sceneTitles[scene] || { en: sceneTitle(scene, 'en'), zh: sceneTitle(scene, 'zh') };
    current[lang] = input.value;
    S.layout.sceneTitles[scene] = current;
    S.applyLayout();
    autosave('Scene title updated');
  });

  // Edit Mode is scene-isolated: wheel/touch gestures may scroll the toolbar,
  // but never the underlying portfolio document.
  const stopEditorPageScroll = event => {
    if (editorEl?.contains(event.target)) return;
    event.preventDefault();
  };
  window.addEventListener('wheel', stopEditorPageScroll, { passive: false, capture: true });
  window.addEventListener('touchmove', stopEditorPageScroll, { passive: false, capture: true });

  // In Edit Mode every video is a still-frame source: initialise at frame 0 and
  // keep it paused. The frame slider is the only way to move through time.
  document.querySelectorAll('video[data-layer-id]').forEach(video => prepareEditorVideo(video, true));

  // --- Floating horizontal editor toolbar ---
  const EDITOR_UI_KEY = 'joe-scene1-editor-ui-v2';
  const LEGACY_EDITOR_UI_KEY = 'joe-scene1-editor-ui-v1';
  let editorDrag = null;
  let editorResize = null;
  let editorExpandedSize = null;
  const editorModules = [...editorEl.querySelectorAll('.editor-header, .editor-section, .editor-footer')];
  const stableModuleIds = [
    'editorDragHandle',
    'sceneNavigationControls',
    'siteSettingsControls',
    'layersControls',
    'propertiesPanel',
    'mediaScaleControls',
    'textControls',
    'imageControls',
    'videoControls',
    'xrayControls',
    'transitionControls',
    'sceneShadeControls',
    'backgroundControls',
    'guidesControls',
    'editorActionsControls',
    'editorFooterControls'
  ];
  let moduleWidthMemory = {};
  editorModules.forEach((module, index) => {
    // Stable IDs are the persistence key. They do not depend on which Scene is
    // currently visible, DOM measurement order, or whether a module is hidden.
    const stableId = module.id || stableModuleIds[index] || `editor-module-${index}`;
    if (!module.id) module.id = stableId;
    module.dataset.editorModuleKey = stableId;
    module.dataset.legacyEditorModuleKey = `module-${index}`;
    if (!module.querySelector(':scope > .editor-section-resizer')) {
      const handle = document.createElement('div');
      handle.className = 'editor-section-resizer';
      handle.setAttribute('aria-hidden', 'true');
      module.appendChild(handle);
    }
  });
  let moduleResize = null;
  let columnResize = null;
  const finishColumnResize = () => {
    if (!columnResize) return;
    columnResize = null;
    saveEditorUi();
  };
  const editorColumns = {
    manager: document.getElementById('editorManagerColumn'),
    layers: document.getElementById('editorLayersColumn'),
    inspector: document.getElementById('editorInspectorColumn')
  };
  const columnResizers = [...editorEl.querySelectorAll('[data-editor-column-resizer]')];
  function applyColumnWidths() {
    const managerWidth = Number(editorColumns.manager?.dataset.columnWidth) || 224;
    const layersWidth = Number(editorColumns.layers?.dataset.columnWidth) || 304;
    if (editorColumns.manager) editorColumns.manager.style.width = `${managerWidth}px`;
    if (editorColumns.layers) { editorColumns.layers.style.left = `${managerWidth}px`; editorColumns.layers.style.width = `${layersWidth}px`; }
    const inspectorWidth = Number(editorColumns.inspector?.dataset.columnWidth) || 560;
    if (editorColumns.inspector) { editorColumns.inspector.style.left = `${managerWidth + layersWidth}px`; editorColumns.inspector.style.width = `${inspectorWidth}px`; }
    const first = editorEl.querySelector('.editor-column-resizer-layers');
    const second = editorEl.querySelector('.editor-column-resizer-inspector');
    const third = editorEl.querySelector('.editor-column-resizer-inspector-width');
    if (first) first.style.left = `${managerWidth - 4}px`;
    if (second) second.style.left = `${managerWidth + layersWidth - 4}px`;
    if (third) third.style.left = `${managerWidth + layersWidth + inspectorWidth - 4}px`;
  }
  applyColumnWidths();
  columnResizers.forEach(handle => handle.addEventListener('pointerdown', e => {
    const kind = handle.dataset.editorColumnResizer;
    const managerWidth = Number(editorColumns.manager?.dataset.columnWidth) || 224;
    const layersWidth = Number(editorColumns.layers?.dataset.columnWidth) || 304;
    const inspectorWidth = Number(editorColumns.inspector?.dataset.columnWidth) || 560;
    columnResize = { kind, pointerId: e.pointerId, startX: e.clientX, managerWidth, layersWidth, inspectorWidth };
    handle.setPointerCapture?.(e.pointerId);
    e.preventDefault(); e.stopPropagation();
  }));
  // Delegated capture path keeps column dragging reliable when a browser
  // retargets events from the scrollable column edge.
  editorEl.addEventListener('pointerdown', e => {
    const handle = e.target.closest?.('[data-editor-column-resizer]');
    if (!handle || columnResize) return;
    const managerWidth = Number(editorColumns.manager?.dataset.columnWidth) || 224;
    const layersWidth = Number(editorColumns.layers?.dataset.columnWidth) || 304;
    const inspectorWidth = Number(editorColumns.inspector?.dataset.columnWidth) || 560;
    columnResize = { kind: handle.dataset.editorColumnResizer, pointerId: e.pointerId, startX: e.clientX, managerWidth, layersWidth, inspectorWidth };
    handle.setPointerCapture?.(e.pointerId);
    e.preventDefault(); e.stopPropagation();
  }, true);
  columnResizers.forEach(handle => handle.addEventListener('mousedown', e => {
    if (columnResize) return;
    const kind = handle.dataset.editorColumnResizer;
    const managerWidth = Number(editorColumns.manager?.dataset.columnWidth) || 224;
    const layersWidth = Number(editorColumns.layers?.dataset.columnWidth) || 304;
    const inspectorWidth = Number(editorColumns.inspector?.dataset.columnWidth) || 560;
    columnResize = { kind, pointerId: null, startX: e.clientX, managerWidth, layersWidth, inspectorWidth };
    e.preventDefault(); e.stopPropagation();
  }));
  columnResizers.forEach(handle => {
    handle.addEventListener('pointerup', finishColumnResize);
    handle.addEventListener('pointercancel', finishColumnResize);
    handle.addEventListener('lostpointercapture', finishColumnResize);
  });

  function validModuleWidth(value) {
    const width = Number(value);
    return Number.isFinite(width) && width >= 170;
  }

  function rememberVisibleModuleWidths() {
    editorModules.forEach(module => {
      // Hidden Scene-specific modules return 0px. Never allow that transient
      // measurement to overwrite the remembered width for that module.
      if (module.hidden || getComputedStyle(module).display === 'none') return;
      const width = Math.round(module.getBoundingClientRect().width);
      if (!validModuleWidth(width)) return;
      moduleWidthMemory[module.dataset.editorModuleKey] = clamp(width, 170, 720);
    });
  }

  function applyModuleWidths(widths = moduleWidthMemory) {
    editorModules.forEach(module => {
      const width = Number(widths[module.dataset.editorModuleKey]);
      if (!validModuleWidth(width)) return;
      const clamped = clamp(width, 170, 720);
      module.style.width = `${clamped}px`;
      module.style.flexBasis = `${clamped}px`;
    });
  }

  function currentModuleWidths() {
    rememberVisibleModuleWidths();
    return { ...moduleWidthMemory };
  }

  function migrateModuleWidths(ui = {}, legacyUi = {}) {
    const source = { ...(legacyUi.sectionWidths || {}), ...(ui.sectionWidths || {}) };
    const migrated = {};
    editorModules.forEach(module => {
      const stableKey = module.dataset.editorModuleKey;
      const legacyKey = module.dataset.legacyEditorModuleKey;
      const direct = source[stableKey];
      const legacy = source[legacyKey];
      const candidate = validModuleWidth(direct) ? direct : legacy;
      if (validModuleWidth(candidate)) migrated[stableKey] = clamp(Number(candidate), 170, 720);
    });
    return migrated;
  }

  function loadEditorUi() {
    try {
      const ui = JSON.parse(localStorage.getItem(EDITOR_UI_KEY) || '{}');
      const legacyUi = JSON.parse(localStorage.getItem(LEGACY_EDITOR_UI_KEY) || '{}');
      moduleWidthMemory = migrateModuleWidths(ui, legacyUi);
      applyModuleWidths(moduleWidthMemory);
      if (Number.isFinite(ui.managerColumnWidth) && editorColumns.manager) editorColumns.manager.dataset.columnWidth = String(clamp(ui.managerColumnWidth, 190, 360));
      if (Number.isFinite(ui.layersColumnWidth) && editorColumns.layers) editorColumns.layers.dataset.columnWidth = String(clamp(ui.layersColumnWidth, 240, 460));
      if (Number.isFinite(ui.inspectorColumnWidth) && editorColumns.inspector) editorColumns.inspector.dataset.columnWidth = String(clamp(ui.inspectorColumnWidth, 320, 760));
      applyColumnWidths();
      if (Number.isFinite(ui.width) && Number.isFinite(ui.height)) {
        editorExpandedSize = {
          width: clamp(ui.width, 360, Math.max(360, innerWidth - 16)),
          height: clamp(ui.height, 180, Math.max(180, innerHeight - 16))
        };
        editorEl.style.width = `${editorExpandedSize.width}px`;
        editorEl.style.height = `${editorExpandedSize.height}px`;
      }
      if (Number.isFinite(ui.x) && Number.isFinite(ui.y)) {
        const maxX = Math.max(0, innerWidth - Math.min(editorEl.offsetWidth || 218, innerWidth));
        const maxY = Math.max(0, innerHeight - 80);
        editorEl.style.left = `${clamp(ui.x, 0, maxX)}px`;
        editorEl.style.top = `${clamp(ui.y, 0, maxY)}px`;
      }
      if (ui.collapsed) editorEl.classList.add('is-collapsed');
      collapseBtn.textContent = editorEl.classList.contains('is-collapsed') ? tr('expand') : tr('collapse');
    } catch (_) {}
  }
  function saveEditorUi() {
    const rect = editorEl.getBoundingClientRect();
    const collapsed = editorEl.classList.contains('is-collapsed');
    if (!collapsed) editorExpandedSize = { width: rect.width, height: rect.height };
    const size = editorExpandedSize || { width: Math.max(360, rect.width), height: Math.max(180, rect.height) };
    try { localStorage.setItem(EDITOR_UI_KEY, JSON.stringify({ x: rect.left, y: rect.top, width: size.width, height: size.height, collapsed, sectionWidths: currentModuleWidths(), managerColumnWidth: Number(editorColumns.manager?.dataset.columnWidth) || 224, layersColumnWidth: Number(editorColumns.layers?.dataset.columnWidth) || 304, inspectorColumnWidth: Number(editorColumns.inspector?.dataset.columnWidth) || 560 })); } catch (_) {}
  }
  function startEditorDrag(e) {
    const borderDrag = Boolean(e.target.matches?.('[data-editor-drag-border]'));
    const collapsedHeaderDrag = editorEl.classList.contains('is-collapsed')
      && editorDragHandle?.contains(e.target)
      && !e.target.closest('button, a, input, select, textarea, label');
    if (!borderDrag && !collapsedHeaderDrag) return;
    const rect = editorEl.getBoundingClientRect();
    editorDrag = { pointerId: e.pointerId, dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    e.target.setPointerCapture?.(e.pointerId);
    e.preventDefault();
    e.stopPropagation();
  }
  editorDragBorders.forEach(border => border.addEventListener('pointerdown', startEditorDrag));
  editorDragHandle?.addEventListener('pointerdown', startEditorDrag);
  editorResizeHandle?.addEventListener('pointerdown', e => {
    const rect = editorEl.getBoundingClientRect();
    editorResize = { pointerId:e.pointerId, startX:e.clientX, startY:e.clientY, width:rect.width, height:rect.height };
    editorResizeHandle.setPointerCapture?.(e.pointerId);
    e.preventDefault(); e.stopPropagation();
  });
  editorModules.forEach(module => {
    const handle = module.querySelector(':scope > .editor-section-resizer');
    handle?.addEventListener('pointerdown', e => {
      const rect = module.getBoundingClientRect();
      moduleResize = { module, pointerId:e.pointerId, startX:e.clientX, width:rect.width };
      handle.setPointerCapture?.(e.pointerId);
      e.preventDefault(); e.stopPropagation();
    });
  });
  window.addEventListener('pointermove', e => {
    if (columnResize) {
      if (columnResize.kind === 'layers') {
        const managerWidth = clamp(columnResize.managerWidth + e.clientX - columnResize.startX, 190, 360);
        if (editorColumns.manager) editorColumns.manager.dataset.columnWidth = String(Math.round(managerWidth));
      } else if (columnResize.kind === 'inspector-width') {
        const inspectorWidth = clamp(columnResize.inspectorWidth + e.clientX - columnResize.startX, 320, 760);
        if (editorColumns.inspector) editorColumns.inspector.dataset.columnWidth = String(Math.round(inspectorWidth));
      } else {
        const layersWidth = clamp(columnResize.layersWidth + e.clientX - columnResize.startX, 240, 460);
        if (editorColumns.layers) editorColumns.layers.dataset.columnWidth = String(Math.round(layersWidth));
      }
      applyColumnWidths();
      return;
    }
    if (moduleResize) {
      const width = clamp(moduleResize.width + e.clientX - moduleResize.startX, 170, 720);
      moduleResize.module.style.width = `${width}px`;
      moduleResize.module.style.flexBasis = `${width}px`;
      moduleWidthMemory[moduleResize.module.dataset.editorModuleKey] = Math.round(width);
      return;
    }
    if (editorResize) {
      const rect = editorEl.getBoundingClientRect();
      const maxW = Math.max(360, innerWidth - rect.left - 8);
      const maxH = Math.max(180, innerHeight - rect.top - 8);
      editorEl.style.width = `${clamp(editorResize.width + e.clientX - editorResize.startX, 360, maxW)}px`;
      editorEl.style.height = `${clamp(editorResize.height + e.clientY - editorResize.startY, 180, maxH)}px`;
      return;
    }
    if (!editorDrag) return;
    const w = editorEl.offsetWidth;
    const h = editorEl.offsetHeight;
    const x = clamp(e.clientX - editorDrag.dx, -w + 80, innerWidth - 80);
    const y = clamp(e.clientY - editorDrag.dy, -h + 40, innerHeight - 40);
    editorEl.style.left = `${x}px`;
    editorEl.style.top = `${y}px`;
  }, { passive: true });
  window.addEventListener('pointerup', () => {
    if (!editorDrag && !editorResize && !moduleResize && !columnResize) return;
    editorDrag = null;
    editorResize = null;
    finishColumnResize();
    moduleResize = null;
    saveEditorUi();
  }, { passive: true });
  window.addEventListener('mousemove', e => {
    if (!columnResize) return;
    if (columnResize.kind === 'layers') {
      const managerWidth = clamp(columnResize.managerWidth + e.clientX - columnResize.startX, 190, 360);
      if (editorColumns.manager) editorColumns.manager.dataset.columnWidth = String(Math.round(managerWidth));
    } else if (columnResize.kind === 'inspector-width') {
      const inspectorWidth = clamp(columnResize.inspectorWidth + e.clientX - columnResize.startX, 320, 760);
      if (editorColumns.inspector) editorColumns.inspector.dataset.columnWidth = String(Math.round(inspectorWidth));
    } else {
      const layersWidth = clamp(columnResize.layersWidth + e.clientX - columnResize.startX, 240, 460);
      if (editorColumns.layers) editorColumns.layers.dataset.columnWidth = String(Math.round(layersWidth));
    }
    applyColumnWidths();
  }, { passive: true });
  window.addEventListener('mouseup', () => {
    finishColumnResize();
  }, { passive: true });
  window.addEventListener('blur', finishColumnResize);
  collapseBtn.addEventListener('click', e => {
    e.stopPropagation();
    const wasCollapsed = editorEl.classList.contains('is-collapsed');
    if (!wasCollapsed) {
      const rect = editorEl.getBoundingClientRect();
      editorExpandedSize = { width: rect.width, height: rect.height };
    }
    editorEl.classList.toggle('is-collapsed');
    if (wasCollapsed && editorExpandedSize) {
      editorEl.style.width = `${editorExpandedSize.width}px`;
      editorEl.style.height = `${editorExpandedSize.height}px`;
    }
    collapseBtn.textContent = editorEl.classList.contains('is-collapsed') ? tr('expand') : tr('collapse');
    saveEditorUi();
  });
  undoBtn.addEventListener('click', e => { e.stopPropagation(); undo(); });
  redoBtn.addEventListener('click', e => { e.stopPropagation(); redo(); });
  loadEditorUi();
  syncEditSceneIsolation(activeScene);
  previewLink?.addEventListener('click', async e => {
    e.preventDefault();
    cancelPendingEditorPersistence();
    saveStatus.textContent = tr('previewing');
    try {
      try { await S.flushLayout(); } catch (_) {
        // Vite's static preview has no write API; the runtime already holds
        // the current draft in memory and can still open preview mode.
      }
      const view = { scene: activeScene, rel: 0, offsetPx: 0 };
      S.switchViewMode?.('preview', view);
    } catch (err) {
      saveStatus.textContent = tr('previewFailed');
      alert(err.message || tr('previewFailed'));
    }
  });

  function exitToNormalMode() {
    const view = S.captureViewportLocation?.() || { scene: activeScene, rel: 0 };
    S.switchViewMode?.('normal', view);
  }

  function cancelPendingEditorPersistence() {
    clearTimeout(saveTimer);
    clearTimeout(historyTimer);
    S.cancelPendingSave?.();
  }

  document.getElementById('saveLayout').addEventListener('click', async () => {
    cancelPendingEditorPersistence();
    const saveButton = buttonById('saveLayout');
    const cancelButton = buttonById('discardLayout');
    saveButton.disabled = true; cancelButton.disabled = true;
    saveStatus.textContent = tr('saving');
    try {
      await S.commitEditSession();
      saveStatus.textContent = tr('savedReturning');
      saveStatus.classList.add('is-ok');
      setTimeout(exitToNormalMode, 120);
    } catch (err) {
      saveStatus.textContent = tr('saveFailed');
      alert(tr('errSave', { error: err.message }));
      saveButton.disabled = false; cancelButton.disabled = false;
    }
  });

  document.getElementById('discardLayout').addEventListener('click', async () => {
    cancelPendingEditorPersistence();
    const saveButton = buttonById('saveLayout');
    const cancelButton = buttonById('discardLayout');
    saveButton.disabled = true; cancelButton.disabled = true;
    saveStatus.textContent = tr('discarding');
    try {
      await S.discardEditSession();
      saveStatus.textContent = tr('discardedReturning');
      saveStatus.classList.add('is-ok');
      setTimeout(exitToNormalMode, 120);
    } catch (err) {
      saveStatus.textContent = tr('discardFailed');
      alert(err.message || tr('discardFailed'));
      saveButton.disabled = false; cancelButton.disabled = false;
    }
  });

  document.getElementById('exportLayout').addEventListener('click', async () => {
    saveStatus.textContent = tr('preparingBackup');
    try {
      const payload = await S.exportProject();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'joe-multiscene-project.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      autosave('Project exported');
    } catch (err) { alert(tr('errExport', { error: err.message })); }
  });

  document.getElementById('importLayout').addEventListener('change', async e => {
    const file = firstFileFromEvent(e); if (!file) return;
    try {
      /** @type {ProjectExportPayload} */
      const data = JSON.parse(await file.text());
      await S.importProject(data);
      syncBg();
      const fallback = S.layout.layers.characterMain ? 'characterMain' : Object.keys(S.layout.layers)[0];
      setSelection(fallback ? [fallback] : [], fallback);
      autosave('Project imported');
    } catch (err) { alert(tr('errImport', { error: err.message })); }
    if (e.target instanceof HTMLInputElement) e.target.value = '';
  });

  document.getElementById('resetLayout').addEventListener('click', () => {
    if (!confirm(tr('resetConfirm'))) return;
    S.reset(true); syncBg();
    const fallback = S.layout.layers.characterMain ? 'characterMain' : Object.keys(S.layout.layers)[0];
    setSelection(fallback ? [fallback] : [], fallback);
    autosave('Layout reset');
  });

  function copySelectedTextLayers(){
    const ids=selectedArray(),items=ids.map(id=>[id,stateFor(id)]).filter(([,s])=>s?.type==='text');if(!items.length)return false;
    layerClipboard=items.map(([id,s])=>({sourceId:id,state:JSON.parse(JSON.stringify(s))}));
    if(items.length===1){const s=items[0][1],text=s.localized?(s.texts?.[currentLang()]??s.texts?.en??s.text??''):(s.text??'');navigator.clipboard?.writeText?.(String(text)).catch(()=>{})}
    return true;
  }
  /** @param {import('../src/types').TextLayer} source @returns {import('../src/types').TextLayer} */
  function cloneTextLayer(source) {
    return /** @type {import('../src/types').TextLayer} */ (JSON.parse(JSON.stringify(source)));
  }
  function pasteTextLayers(){
    if(!layerClipboard?.length)return false;const created=[];let top=Math.max(0,...sceneLayers(activeScene).map(id=>Number(stateFor(id)?.z)||0));
    for(const item of layerClipboard){const s=cloneTextLayer(item.state);const id=`text-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`;s.core=false;s.scene=activeScene;s.name=`${s.name||'Text'} copy`;s.x=Number(s.x||0)+24;s.y=Number(s.y||0)+24;s.z=++top;S.layout.layers[id]=s;created.push(id)}
    if(!created.length)return false;S.applyLayout();setSelection(created,created[0]);autosave('Text added');return true;
  }

  window.addEventListener('keydown', e => {
    const cmd = e.metaKey || e.ctrlKey;
    const nativeTextFocus=['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)||document.activeElement?.isContentEditable;
    if (!nativeTextFocus && (e.key === 'Backspace' || e.key === 'Delete')) {
      const ids = selectedArray();
      const s = ids.length === 1 ? stateFor(ids[0]) : null;
      if (isTextLayer(s) && !s.locked) {
        e.preventDefault();
        if (!confirm(tr('deleteConfirm', { name: displayLayerName(ids[0], s) }))) return;
        S.removeLayer(ids[0]).then(() => {
          S.persistLayout();
          const fallback = Object.keys(S.layout.layers).find(id => layerScene(id) === activeScene) || null;
          setSelection(fallback ? [fallback] : [], fallback);
          autosave('Layer deleted');
        });
        return;
      }
    }
    if(cmd&&!e.altKey&&!nativeTextFocus&&e.key.toLowerCase()==='c'){if(copySelectedTextLayers()){e.preventDefault();return}}
    if(cmd&&!e.altKey&&!nativeTextFocus&&e.key.toLowerCase()==='v'){if(pasteTextLayers()){e.preventDefault();return}}
    if (cmd && !e.altKey && e.key.toLowerCase() === 'z') {
      if (nativeTextFocus) return;
      e.preventDefault();
      e.shiftKey ? redo() : undo();
      return;
    }
    if (e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'y') {
      if (nativeTextFocus) return;
      e.preventDefault(); redo(); return;
    }
    if (nativeTextFocus) return;
    const ids = selectedArray();
    if (!ids.length || ids.some(id => stateFor(id).locked)) return;
    const step = e.shiftKey ? 10 : 1;
    let dx = 0, dy = 0;
    if (e.key === 'ArrowLeft') dx = -step;
    else if (e.key === 'ArrowRight') dx = step;
    else if (e.key === 'ArrowUp') dy = -step;
    else if (e.key === 'ArrowDown') dy = step;
    else return;
    e.preventDefault(); translateSelection(dx, dy); autosave();
  });

  window.addEventListener('scene-resized', updateSelection);
  window.addEventListener('scene-layout-applied', () => { syncSiteTitleControls(); syncBg(); syncXray(); syncTransition(); syncSceneShades(); renderLayerList(); updateSelection(); updateSceneUi(); applyModuleWidths(moduleWidthMemory); });
  window.addEventListener('ui-language-change', applyStaticTranslations);

  applyStaticTranslations();
  setTimeout(syncSceneGroupFilterUi, 0);
  detectSceneInView();
  syncSiteTitleControls(); syncBg(); syncGuides(); syncXray(); syncTransition(); syncSceneShades(); syncSceneVisibilityUi(); renderLayerList();
  if (primaryId) setSelection([primaryId], primaryId);
  resetHistory();
  // The shared data/layout.json hydrates asynchronously after scripts start.
  // Rebase history once it has arrived, before normal editing begins.
  setTimeout(resetHistory, 500);
})();
