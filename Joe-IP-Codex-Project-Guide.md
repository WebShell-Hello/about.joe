# Joe-IP Portfolio — Codex 项目说明

> 当前基线：**v65（no-ripple）**
> 项目性质：单用户维护、前台公开访问的多幕式个人 Portfolio。当前没有业务数据库，也没有用户账号系统。

## 1. 项目目标

Joe-IP 是一个电影化、多幕式个人作品集网站。网站通过顶部导航和离散式滚轮/触控板/键盘输入，在 7 个 Scene 之间切换；第 1 幕是高度定制的视觉首页，第 2–4 幕为视频叙事，第 5–7 幕用于 Projects / Blog / Contact 等内容。

项目同时内置一个仅供站长本地使用的可视化编辑器，用于直接调整每一幕的文字、图片、视频、位置、尺寸、图层、透明度和特效参数，并通过 JSON 保存布局。

---

## 2. 当前技术栈

### 前端

- **HTML5**
- **CSS3**
- **Vanilla JavaScript**（无 React / Vue / Next.js）
- **WebGL2 / GLSL Shader**：第 1 幕数字雨
- HTML5 `<video>`：第 2–4 幕视频
- CSS `transform / mask-image / opacity / transition`：图层、透视光圈、转场等
- `requestAnimationFrame`：高频视觉更新和 WebGL 渲染
- `sessionStorage / localStorage`：语言、编辑器窗口状态、视图恢复等本地状态

### 本地开发服务

- **Python 3 `ThreadingHTTPServer`**
- 文件：`server.py`
- 默认端口：`8080`

Python Server 不是业务后端，主要用于本地编辑模式：

- 读取 / 保存布局 JSON
- 编辑会话 Save / Cancel
- 上传、删除编辑器素材
- 提供静态文件

### 当前没有使用

- Node.js / npm
- Vite / Webpack
- React / Vue
- Django / Flask
- PostgreSQL / MySQL
- 用户登录
- RBAC
- 业务 API

因此当前网站主体本质上是一个 **静态前端 + 本地文件编辑服务**。

---

## 3. 目录架构

```text
Joe-IP/
├── index.html                 # 全局页面骨架、导航、编辑器 UI
├── app.js                     # 启动器：加载各 Scene、挂载 Runtime/Editor
├── server.py                  # 本地编辑服务器
├── start.command              # macOS 本地启动入口
│
├── shared/
│   ├── runtime.js             # 核心运行时 / Layer Engine / X-ray / Layout
│   ├── editor.js              # 可视化编辑器行为
│   └── style.css              # 全局与编辑器样式
│
├── scenes/
│   ├── manifest.js            # 7 幕注册表 + 导航 / 视频 Story 状态机
│   │
│   ├── scene-1/
│   │   ├── scene.html
│   │   ├── scene.css
│   │   ├── scene.js
│   │   ├── digital-rain.js    # WebGL2 数字雨
│   │   └── assets/            # 第 1 幕固定素材
│   │
│   ├── scene-2/ ... scene-7/
│   │   ├── scene.html
│   │   ├── scene.css
│   │   ├── scene.js
│   │   └── assets/            # 对应 Scene 素材
│
├── data/
│   ├── layout01.json          # 已提交 / 正式布局
│   ├── layout02.json          # 当前编辑草稿
│   └── .edit-session-state.json
│
└── uploads/                   # 编辑期间临时新增素材；当前固定素材尽量放 Scene assets
```

---

## 4. 核心架构

### 4.1 Scene Registry

每一幕通过 `window.JoeScenes` 注册自己的：

- Scene ID
- Root DOM
- Stage DOM
- 默认 Layer
- 本幕 Controller
- 本幕素材和行为

`scenes/manifest.js` 维护 1–7 幕的 manifest，并负责多幕导航和视频 Story 状态机。

当前映射：

| Scene | 导航 | 主要用途 |
|---|---|---|
| 1 | Home | 首页视觉场景、人物、草坡、透视、数字雨 |
| 2 | About | 视频 Scene |
| 3 | Experience | 视频 Scene |
| 4 | Skills | 视频 Scene |
| 5 | Projects | 项目展示区域，仍在继续开发 |
| 6 | Blog | Blog 区域 / 当前较轻量 |
| 7 | Contact | 联系区域 / 当前较轻量 |

### 4.2 Layer Engine

`shared/runtime.js` 将页面元素统一抽象为 Layer。

主要 Layer 类型：

- `text`
- `image`
- `video`
- 特殊 control / scroll layer

常用属性：

```text
scene
x / y
scale
rotation
opacity
z
visible
locked
width / height
src
imageStyle
textStyle
```

Layer 可以：

- 拖动
- 缩放
- 调整 Width / Height
- 旋转
- 调透明度
- 显示 / 隐藏
- 锁定 / 解锁
- 调整 Z-index
- 删除
- 绑定其他 Layer

### 4.3 Layout 数据模型

正式布局：

```text
data/layout01.json
```

编辑草稿：

```text
data/layout02.json
```

编辑工作流：

```text
进入 Edit Mode
      ↓
layout01 → layout02
      ↓
所有修改只操作 layout02
      ↓
Save   → layout02 提交到 layout01
Cancel → 丢弃草稿并恢复 layout01
```

这套设计用于保证编辑失败或误操作时不直接破坏正式页面。

---

## 5. 普通浏览模式

### 顶部导航

```text
JOSEPH | Home | About | Experience | Skills | Projects | Blog | Contact | 文/A
```

支持：

- 点击顶部导航直接进入对应 Scene
- 中 / 英文全站切换
- Arrow Up / Arrow Down 相邻 Scene 导航
- Mac Trackpad / Mouse Wheel 离散式 Scene 导航

滚轮不是传统连续网页滚动，而被转换为 **一次有效手势 = 相邻一幕**。

当前已经针对 Safari / Chrome 的触控板惯性做过专门处理，必须避免重新引入连续 native scrolling。

### 导航边界

Scene 范围硬限制为：

```text
1 → 7
```

不做 Contact → Home 自动循环。

### Navigation Transaction

当前导航使用 `navigationToken` / target state 处理竞争请求。

原则：

> 新导航请求优先，旧的未完成播放 / transition 应被取消。

不要删除这套逻辑，否则快速点击导航时可能出现 Scene 串台、视频继续播放或画面闪回。

---

## 6. Scene 1：首页视觉系统

Scene 1 是当前最复杂的一幕。

### 普通视觉图层

包括但不限于：

- Main background
- Background perspective
- Character body
- Character perspective
- 三块 Grass 实体图
- 三块 Grass wireframe / perspective 图
- Rock
- 标题、副标题等文字
- WebGL Digital Rain

### 主背景

当前主背景已经作为 **普通 Image Layer** 管理，不再使用 Scene 1 特殊 Background 控件。

它处于 Scene 1 Layer 底部，可以和普通图片一样：

- 选中
- 拖动
- 缩放
- 调尺寸
- 旋转
- 调透明度
- 调 Z-index
- 显示 / 隐藏

### X-ray / 透视光圈

鼠标在 Scene 1 中移动时存在一个全局透视 Lens。

统一状态：

```text
x
y
radius
feather
```

所有透视效果必须复用同一 Lens 状态：

- 主背景实体挖空
- 背景透视图显示
- 人物主体挖空
- 人物透视图显示
- Grass 实体挖空
- Grass wireframe 显示
- Digital Rain 显示

要求：

> 透视区中的原实体内容应透明，让后面的透视图真正可见，而不是把透视图简单叠在实体图上。

光标离开浏览器 / Scene 1 后必须立即关闭 Lens，不能把最后位置保留在屏幕上。

### Grass Pair Binding

Scene 1 有三组：

```text
Grass 实体图  ↔  Grass wireframe 透视图
```

它们已经按相对关系绑定。

绑定目标：

- 移动其中一个时保持另一层相对位置
- Scale 联动
- Width / Height 尺寸变化保持对应比例
- Rotation 联动

不要重新假设三张透视图的顺序；当前 JSON 中的 pair 映射是现阶段的正确对应关系。

### Background / Perspective Binding

主背景和背景透视图需要保持视觉对应。窗口大小改变后也应维持相对关系，避免响应式布局导致透视图错位。

---

## 7. WebGL2 Digital Rain

文件：

```text
scenes/scene-1/digital-rain.js
```

实现方式：

- WebGL2
- Full-screen triangle
- Fragment Shader 实时生成 `0 / 1`
- 不使用 GIF
- 不使用 DOM 字符雨
- 不使用 Canvas 2D

### 行为

数字雨逻辑上一直覆盖整个屏幕并连续向下运动，但只有 X-ray Lens 内可见。

Lens 移动只改变 Shader 的可见区域：

> 不重新生成，不重置雨幕位置。

### 可编辑参数

- `Digital rain density`
- `Digit size`

### 性能规则

- Scene 1 激活时运行 RAF
- 离开 Scene 1 后停止 WebGL 渲染
- DPR 最大约束为 2，避免 Retina 屏幕片元成本过高

当前已经删除此前实验的 click ripple / 水波透视功能。**不要重新引入 ripple 行为，除非明确收到新需求。**

---

## 8. Scene 2–4 视频系统

Scene 2、3、4 是连续的 cinematic video Scene。

技术：

```text
HTML5 <video>
+ 自定义 JavaScript Controller
+ Scene Story State Machine
```

每个视频 Layer 支持：

- 替换视频
- Position
- Scale / Width / Height
- Rotation
- Opacity
- Visible / Hidden
- Locked
- Z-index
- Frame fit：cover / contain / fill
- Playback speed
- Edit Mode 下拖动 Video Frame 查看具体帧

### Edit Mode

编辑视频时默认暂停：

- 可以 scrub 查看任意帧
- 松开 slider 不自动播放

### Normal Mode

Scene 2–4 采用专门的 cinematic state machine，包括：

- 视频播放
- 暂停
- 最终帧 Hold
- Scene 间 crossfade
- 中途导航 cancellation
- Domain isolation

不要用普通页面滚动逻辑替代当前视频状态机。

---

## 9. Domain Isolation

项目存在 Scene Interaction Domain 概念。

任何时刻只有当前 Scene 能真正响应主要交互。

Inactive Scene 可以为了转场：

- preload
- render

但不能：

- 接管 pointer
- 错误启动视频
- 错误 pause / resume
- 消费滚轮手势
- 驱动另一个 Scene 的透视或 animation

Debug API：

```js
window.__joeSimpleVideoStory.getActiveDomainId()
window.__joeSimpleVideoStory.getDomainSnapshot()
```

这是目前防止多幕同时响应的重要架构约束。

---

## 10. Edit Mode / 可视化编辑器

编辑器主要代码：

```text
index.html
shared/editor.js
shared/runtime.js
```

### 当前工作方式

Edit Mode 中：

- 页面不允许正常上下滚动
- 只显示当前正在编辑的 Scene
- Scene 之间通过编辑器 Scene 选择切换
- 网站上的普通链接被禁用，避免误跳转

### 通用编辑能力

目前主要支持：

- `+ Text`
- `+ Image`
- 删除选中 Layer
- Position X / Y
- Scale
- Width / Height
- Rotation
- Opacity
- Z-index
- Visible / Hidden
- Lock / Unlock
- Layer binding
- 图片亮度 / 对比度 / 饱和度 / Hue
- 双语文字
- 字体 / 字号 / 字重 / 字间距 / 行高 / 颜色 / 对齐
- 文本链接与内部跳转

### 视频专属 Inspector

选择 Video Layer 时显示：

- Replace video
- Frame fit
- Video frame scrub
- Opacity
- Playback speed

### Scene 1 专属 Inspector

- X-ray radius
- Feather
- Perspective opacity
- Digital Rain Density
- Digital Rain Digit Size

### 编辑器窗口自身

支持：

- 展开 / 折叠
- 折叠状态仍可拖动
- 拖动窗口位置
- Resize
- 模块宽度调整
- Undo / Redo（最多约 20 steps）
- UI 中英文

---

## 11. 动态新增 Layer 与固定 Layer

项目区分：

### Core Layer

写在各 Scene `scene.js` 中，是该幕的核心元素。

### Dynamic Layer

用户通过 Editor 新增的文字 / 图片等，保存在 Layout JSON 中，由 Runtime 动态创建 DOM。

Runtime 负责：

```text
Layout JSON
   ↓
syncDynamicLayers()
   ↓
createDynamicElement()
   ↓
DOM
```

因此新增普通内容时，优先继续复用 Layer Engine，不要为每一张图片单独写 DOM 和控制逻辑。

---

## 12. 本地 Server API

`server.py` 当前主要提供：

```text
GET  /api/version
GET  /api/layout
POST /api/edit-session
POST /api/layout
POST /api/upload
POST /api/delete-asset
```

这些接口主要服务 **本地编辑器**。

正式公网版本原则上可以完全不需要这些写接口。

---

## 13. 部署定位

网站的公开展示部分可以做成静态站：

```text
HTML / CSS / JS / JSON
+ 图片 / 视频 / WebGL Shader
```

没有用户登录，也没有业务数据交互。

Contact 后续可以直接使用：

```text
mailto:
```

用户点击后用自己的邮件客户端给站长发邮件，因此不需要留言数据库。

推荐生产架构方向：

```text
Domain
  ↓
Nginx / Static Hosting
  ↓
Portfolio Frontend

大型图片 / 视频
  ↓
OSS + CDN
```

本地 Editor / Python write API 不建议直接暴露公网。

---

## 14. 当前浏览器目标

当前主要优先保证：

1. macOS Safari
2. macOS Chrome

项目已经为以下问题做过专门处理：

- macOS Trackpad momentum
- Safari / Chrome 视频最终帧闪烁
- X-ray CSS mask GPU compositing
- Chrome 多个大型透明 PNG + mask 时的闪烁
- WebGL GPU 生命周期
- Scene 切换时后台渲染停止

因此修改视觉合成、mask、scroll、wheel 或视频控制时必须同时在 Safari 与 Chrome 验证。

---

## 15. 给 Codex 的开发原则

后续修改这个项目时，请遵循以下原则：

1. **不要无要求重写框架。** 当前 Vanilla JS 架构已经运行；如未来引入 Vite / TypeScript，应渐进式迁移。
2. **Scene 逻辑保持模块化。** Scene 特有功能留在 Scene 内，通用功能放 `shared/`。
3. **优先复用 Layer Engine。** 不要为普通新元素创建另一套坐标 / opacity / z-index 系统。
4. **不要破坏 layout01 / layout02 编辑事务。**
5. **Normal Mode 与 Edit Mode 行为必须分离。**
6. **不要恢复 native continuous scrolling。** 当前正常浏览是离散 Scene Navigation。
7. **不要破坏 Scene Domain Isolation。**
8. **Scene 1 的所有透视层必须共享同一个 Lens 状态。**
9. **实体层在 Lens 内应被挖空，Perspective Layer 才显示。**
10. **Digital Rain 只在 Scene 1 激活时持续 GPU render；离开后停止。**
11. **不要重新加入 click ripple / water ripple 功能。**
12. **媒体资源尽量放所属 Scene 的 `assets/`，而不是长期堆积在 `uploads/`。**
13. **任何 wheel / mask / video / compositing 修改至少检查 Safari + Chrome。**
14. 新功能应优先设计成：

```text
80% 通用 Layer / Inspector 能力
+ 20% Scene / Element 专属 Inspector
```

而不是为每一幕复制一套完全独立的编辑器。

---

## 16. 后续可能的工程化方向（不是当前技术栈）

如果后续项目和视频数量明显增加，可以考虑渐进式加入：

- **Vite**：开发服务器、production build、asset hashing、code splitting
- **TypeScript**：为 Layer / Scene / Controller / Layout 建立类型
- Scene Dynamic Import
- 图片 WebP / AVIF
- 视频 H.264 / WebM 多规格
- OSS + CDN
- Scene Manager / Project Manager / Asset Manager

这些属于未来优化方向，**当前 v65 尚未使用 Vite 或 TypeScript**。

---

## 17. 一句话总结

Joe-IP 当前是一个：

> **以 Vanilla JavaScript + CSS Layer Engine + WebGL2 + HTML5 Video 为核心，使用 JSON 驱动布局、Python 文件服务器提供本地可视化编辑能力，并通过自定义 Scene Story State Machine 管理 7 幕电影化导航的个人 Portfolio 网站。**

Codex 后续开发时，应优先保持现有 Scene Engine、Layer Engine、编辑事务、Domain Isolation 和跨 Safari / Chrome 的交互稳定性，再逐步扩展项目管理和工程化能力。
