# SongScope — Studio One / Fender Studio Pro 工程查看器

**简体中文** | [English](README.en.md)

**打开 Studio One / Fender Studio Pro 工程，直观查看歌曲结构、轨道、插件与 MIDI。**

SongScope 是一个只读歌曲浏览器：不需要安装工程里的 VST 插件，也能查看工程结构、音符片段和插件名称。支持 Windows / macOS / Linux 桌面构建，以及手机与平板上的浏览器 / PWA。

> 当前为私有预览项目。GitHub 仓库与 Release 保持私有。网页版可通过链接访问，使用者打开的工程文件仅在本地解析，不会上传到服务器。

## 语言、隐私与免责

界面按系统 / 浏览器首选语言自动选择：中文环境显示中文，其他环境显示英文。工程名称、音轨名称、预设及素材路径不会被翻译。

你打开的工程文件及其中的数据均在设备本地离线处理，**不会以任何形式上传**；不收集工程内容或素材路径。首次访问和更新网页仅下载应用资源。网页离线可用性取决于浏览器保留缓存，工程不会自动持久化。

这是非官方工程查看与兼容副本导出工具，与 PreSonus / Fender 无关联。解析或转换结果可能不完整或有误，请以原软件为准，并保留工程备份。素材路径只是保存的引用，不代表当前文件存在；缺少路径会明确提示。MIDI 导出功能保留，但不提供音频导出。

## 网页版

- 应用：<https://songscope.response.run>
- 简约图标候选：<https://songscope.response.run/icons.html>
- 桌面下载：本仓库的 [Releases](../../releases)，需要具有仓库访问权限。

## 功能

### 首页示例工程

首页在「打开 .song 文件」下方提供较小的 **「示例工程」** 按钮，打开 **「夏夜绮想演示用」** 后即可浏览歌曲信息、编排、钢琴窗与通道 / 插件，无需选择本地文件。示例使用从授权工程提取、清理后的展示数据，不分发原始 `.song`、插件状态或外部音频；素材只保留文件名，不公开本机路径。

示例保留每个乐器的解析结果：Piano 显示「加密音源无法读取」，Violin 显示保存的音色名「Violin」；未识别的音色也明确显示状态。

示例是**仅供浏览的只读模式，所有 MIDI 导出和低版本工程导出均禁用**。打开自己的 `.song` 后，正常导出功能恢复。

### 歌曲首页

打开 `.song` 后，默认显示工程内的歌曲封面、名称、艺术家、风格、创作者、速度、拍号、调性及制作软件。制作软件统一显示 **Studio One / Fender Studio Pro**；额外分开展示工程保存版本（含构建号）与文件格式号，未知版本不推测。左侧浏览轨道，右侧查看插件清单。

### 导出低版本兼容副本（实验性）

歌曲信息页提供 **高版本转低版本**。支持从 8 / 7 / 6 选择更低的 7 / 6 / 5 目标；导出前会检查保存版本、格式号与已知不支持状态，显示转换项目、兼容性说明或阻断原因。到 5 的新版 Pro EQ 转换尚未验证，遇到此类状态会阻止导出，不会删除插件强行降级。

- 生成新的 `.song` 文件，不覆盖或修改已载入工程；原始保存软件信息保留。
- 不等于官方「另存为旧版」：只转换已支持的结构/原生效果状态，不能把所有新功能无损变成旧版功能。**尚未通过目标旧版 DAW 实机打开验证**。
- 保留工程内已有内容与外部素材引用，不寻找、读取或打包外部素材。把导出副本放在原工程目录，核对素材、插件、路由与自动化。
- 插件本身的版本兼容性不在转换范围内；第三方插件状态保持原样。

转换范围与依据：[兼容导出说明](docs/compatibility-export.md)。

### 只读编排

- 左边是轨道，右边是按工程内实际位置和长度排列的 MIDI 和音频块。
- MIDI 块内绘制音符缩略图，时间标尺以小节显示，支持缩放和横向 / 纵向滚动。
- 点击片段进行多选，不能拖动、剪切、修改音符或写回工程。
- 音频片段按实际起点与长度显示，名称优先音块名、其次 sample 文件名；重复片段不合并，重叠片段分行显示。点击查看详情，通道可展开素材路径。秒制起点 / 时长按速度图分别换算；未知时间格式明确列为无法定位，曲线变速按节点阶梯近似。
- F2 钢琴窗有黑白键、音高 / MIDI 编号、小节拍点网格、音符名称、双向缩放和完整 128 键范围；点击音符可看位置、时值和力度，中央 C 使用 C4 / MIDI 60。支持片段偏移和边界裁切。
- 不访问外部素材，不提供音频导出，不渲染波形。

### 通道与插件

- 顶部点击「通道 / 插件」展开底部横向通道区。
- 每个轨道通道显示加载的 VSTi、插入效果链、发送目标及可识别的目标效果。
- 左侧选择轨道时，下方自动滚到对应通道并高亮；重复点击与重新展开也会重新定位。
- Kontakt 可读取受支持保存状态中的实际音色槽位名称；经验证的加密状态无法取名时显示「加密音源无法读取」。Rack 名称不会冒充音色名，空实例显示「未加载音源」，未知格式仍显示未识别；全过程不调用 Kontakt。
- 文件夹没有独立通道。无法识别的插件或槽位会显示「无 / 未识别」。

### MIDI 导出

- 选择一个或多个 MIDI 块导出为标准 `.mid`。
- 导出全部编排时保留片段位置；单片段导出时以片段起点归零，多片段导出保留编排位置。速度 / 拍号节点同时写入 MIDI conductor track；单片段会从所在位置的有效速度 / 拍号开始。
- 桌面版使用文件保存对话框；手机优先使用系统分享面板，不支持时下载文件。
- **产品不提供 MIDI 导入和工程编辑入口，也不覆盖原工程。** `src/lib/midi.ts` 中保留了早期格式研究使用的写入辅助函数，不属于当前产品功能。

## 使用

1. 打开网页或桌面应用，可先点首页「示例工程」浏览；也可选择自己的 `.song` 文件，桌面浏览器支持拖放。
2. 在歌曲首页查看封面与信息，切换「编排 / 走带」查看 MIDI 布局。
3. 点击左侧轨道，在下方通道区查看相应插件。
4. 在自己打开的工程中选择片段后导出 MIDI，或导出全部编排；首页示例不允许导出。

手机可通过浏览器菜单「添加到主屏幕」安装为 PWA。初次加载后可缓存应用资源；离线使用取决于浏览器是否保留缓存，并非自动保存已打开的工程。

## 当前限制

- “走带”指只读编排视图，**不包含音频播放、渲染或 VST 宿主功能**。
- `.song` 是逆向适配的第三方格式，不保证所有 Studio One / Fender Studio Pro 版本都兼容。旧二进制工程、加密工程、特殊事件类型尚未验证。
- 当前主要适配含 `Song/song.xml`、`Song/mediapool.xml` 和 `.musicx` 数据的 ZIP 工程。
- 不渲染音频波形、自动化、和弦轨与歌词；不加载外部音频资源。
- 已读取全部速度 / 拍号节点、按变拍号绘制小节线并随 MIDI 导出；曲线变速保留原始节点与 curveType，连续曲线目前按节点阶梯近似并明确提示。循环片段、MIDI 控制器 / 表情数据等仍需要更多样本验证。
- 大型工程需要在内存中解压，手机可用内存较少时可能失败。
- 桌面包尚未进行商业代码签名 / macOS 公证；macOS 安装包须由 macOS 构建，实际产物以 Release 附件为准。

## 本地开发

需要 Node.js 20+、npm；推荐 Node.js 22。Electron 图形界面需要桌面环境，Linux 无头验证可使用 Xvfb。

```bash
npm ci
npm run dev       # 浏览器开发模式
npm run build     # TypeScript 检查 + Vite 生产构建
npm start         # 构建并启动 Electron
```

生成或更新授权示例时，先构建，再用实际应用及其后台解析器读取原始工程，最后重新构建以包含新快照；不要在 `about:blank` 中注入独立的读取器，因为它无法定位 Kontakt Worker。

```bash
npm run build
xvfb-run -a npx electron --no-sandbox scripts/make-demo.cjs /path/to/demo.song
npm run build
```

## 桌面打包

```bash
npm run dist:win    # Windows x64 ZIP；建议在 Windows 构建
npm run dist:mac    # macOS Intel / Apple Silicon DMG；必须在 macOS 构建
npm run dist:linux  # Linux x64 / ARM64 AppImage
```

产物在 `release/`，共 5 份桌面文件：Windows x64 ZIP、Linux x64 / ARM64 AppImage、macOS x64 / ARM64 DMG。跨平台 CI 见 [build.yml](.github/workflows/build.yml)。发布标签后，工作流会把各平台产物附加到私有 Release；不会把仓库改为公开。

## 快捷键

| 按键 | 功能 |
| --- | --- |
| F1 | 显示 / 隐藏帮助 |
| F2 | 显示 / 隐藏只读 MIDI 查看区 |
| F3 | 显示 / 隐藏底部混音台 |
| Esc | 关闭帮助 |

F2 / F3 面板互斥：打开 MIDI 窗会收起插件窗，反之亦然；插件 Rack 不显示 MIDI 导出按钮。

采用 [Studio One 常用快捷键布局](https://pae-web.presonusmusic.com/downloads/products/pdf/STUDIO_ONE_-_KEY_COMMANDS_SHEET.pdf)；F2 仅查看，不编辑。Mac 可能需要 Fn。输入框、修饰键组合与按键连发不会触发这些切换。

## 乐器预设名

- 直接读取工程内保存的 VST3 / VST2 插件状态，不安装或运行插件，也不查找外部采样文件。
- Serum 2：读取 XferJson 元数据中的预设名，已在授权真实工程中验证两个实例。
- Serum / 通用 VST2：在保存了 FXP program name 的情况下读取该字段。
- Kontakt：受支持的 NI 容器读取音色槽位名称（已在真实工程验证古筝与 Cello），Rack 名不当作音色名；经验证的空实例显示「未加载音源」，经验证的加密状态无法取名时显示「加密音源无法读取」。旧格式可见文件引用明确标注，不等同于运行时验证。
- 不把 S1 自动生成的 `3 - Serum 2.vstpreset` 等缓存文件名冒充音色名。压缩、加密、未知私有状态或未保存名称时显示「未识别」。

支持范围与样本证据见 [预设支持表](docs/preset-support.md)：Omnisphere 已从一个真实工程的音频转换前保存状态读取到音色名，并在对应通道明确标记；Vital、Sylenth1、StylusRMX、Falcon 支持部分明确格式，尚非全版本 / 真实宿主全量验证；Nexus 十个实际实例仍未恢复出名称。Kontakt 追加解码实验未恢复新的加密音色名，见[研究记录](docs/kontakt-decode-followup.md)。

## Cloudflare Pages 部署（原生 Git 集成）

- 正式域名：<https://songscope.response.run>
- Pages 项目：`songscope-web`，源仓库：`yukinsnow/SongScope`（MIT 开源）。
- 生产分支：`main`；构建命令：`npm run build`；输出：`dist/`。
- 环境变量：`NODE_VERSION=22`、`ELECTRON_SKIP_BINARY_DOWNLOAD=1`（仅网页构建无需下载 Electron）。
- 推送 main 后由 Cloudflare 自动拉取、构建、部署，不再手动上传 dist；API Token 不进入仓库或网页。
- 原直传项目 `songscope.pages.dev` 保留作历史地址，不再更新。根据 [Cloudflare 文档](https://developers.cloudflare.com/pages/get-started/direct-upload/)，直传项目不能原地切换 Git 集成，因此新建 Git 关联项目并绑定域名。

```bash
git push origin main  # 自动触发 Pages 部署
```

## 署名

Github@Yukinsnow · Bilibili@純白

应用首页及工程界面底部均显示署名。GitHub 链接指向已确认的账户；未猜测 Bilibili 个人空间链接。

## 项目结构

| 路径 | 内容 |
| --- | --- |
| `src/App.tsx` | 歌曲首页、只读编排、通道联动与导出交互 |
| `src/lib/song.ts` | 工程 ZIP、XML、元信息及插件路由解析 |
| `src/lib/musicx.ts` | `.musicx` 音符二进制编解码 |
| `src/lib/timing.ts` | 全速度 / 拍号图、小节位置和导出归零 |
| `src/lib/presets.ts` | 插件状态的预设名与音色文件引用 |
| `src/lib/midi.ts` | 标准 MIDI 导出及早期格式研究辅助函数 |
| `electron/` | 桌面窗口与文件读写桥接 |
| `src/lib/demo.ts`、`src/data/` | 只读示例加载器、展示数据与封面 |
| `public/` | PWA、现用图标及预览页 |
| `build/` | 平台图标 PNG / ICO / ICNS |
| `scripts/` | 合成测试工程、验证与截图辅助脚本 |
| `fixtures/smoke.song` | 合成测试工程，不含真实用户歌曲 |

## 验证与格式说明

```bash
npm run build
xvfb-run -a npx electron --no-sandbox scripts/test-demo.cjs
xvfb-run -a npx electron --no-sandbox scripts/test-timing-shortcuts.cjs
xvfb-run -a npx electron --no-sandbox scripts/test-presets.cjs
xvfb-run -a npx electron --no-sandbox scripts/test-audio-events.cjs
xvfb-run -a npx electron --no-sandbox scripts/test-arrangement-inspector.cjs
node scripts/test-note-window.cjs
node scripts/test-kontakt.cjs
```

合成回归覆盖 120→80→150→100 BPM、4/4→3/4→7/8→5/4、单片段归零、MIDI 元事件重读、F1/F2/F3、输入框与连发保护，以及 Serum/Kontakt/通用预设元数据、UTF-16 引用、损坏和未知状态。CI 在 Linux 构建前运行这些验证。


在获得授权的本地真实工程上验证了：44 条非文件夹轨道、70 个 MIDI 块；全部导出后重读为 5927 个音符。上述私有测试歌曲原文件不随项目或网页分发；首页只提供另外授权的「夏夜绮想演示用」经过清理的展示数据。

```bash
# 默认使用 /tmp/s1real/song.zip；可用 SONG 指定本地样本
SONG=/path/to/example.song xvfb-run -a node_modules/.bin/electron --no-sandbox scripts/check-reader.cjs
```

覆盖首页与移动端截图、MIDI 导出重读、轨道 / 通道定位、重复选择和收起重开。部分历史截图脚本针对旧界面，仅作开发记录。

格式笔记：`MusicPart` 保存 `clipID / start / length / offset`（拍）；`mediapool.xml` 中的 `MusicClip mediaID` 指向 `Performances/**/*.musicx`。VSTi 通过乐器输出通道关联，插入与发送保持槽位顺序。

## 品牌与 Logo

已选定第 01 款「手写音乐」作为正式 Logo，主名为 **SongScope**，产品说明为 **Studio One / Fender Studio Pro 工程查看器**，不再使用中文品牌名。完整字标用于网页，音符与节奏线提取为平台应用图标。

保留 10 款不同风格的 AI 品牌概念图作为设计记录：手写音乐、瑞士极简、建筑字母、包豪斯、工业录音棚、复古合成器、丝带、负空间、唱片厂牌与模块音序。采用电蓝 / 深蓝黑 / 白色配色。

- [在线放大对比](https://songscope.response.run/brand/round-3/)
- 原图：`public/brand/round-3/01.png` 至 `10.png`
- [完整提示词](docs/branding/round-3/prompts.md)，使用内置 imagegen 生成
- 对比图：`shots/logo-round3-sheet.png`

除选定的 01 款外，其余均为未采用的概念预览。此前 E/F/G 去镜片方案仍保留于 `icons.html`，A/B/C/D 与 E/F/G 的 SVG 仍在 `public/brand/candidates/` 作记录。

---

非 PreSonus / Fender 官方产品，与相关商标所有者无关联。

## License / 许可证

SongScope source code is licensed under the [MIT License](LICENSE). Third-party dependencies retain their own licenses. Demo music and example project content are provided for in-app viewing only; the MIT license does not grant rights to redistribute that musical content.

SongScope 源代码采用 MIT 许可证；第三方依赖遵循各自许可。示例音乐及示例工程内容仅供应用内查看，不属于 MIT 授权的音乐内容再分发范围。

### Resizable bottom panels / 底部面板高度

Drag the top divider of the MIDI or channel/plugin panel up or down. Each panel remembers its height while the app is open. Use arrow keys on the divider (Shift for larger steps), Home/End for limits, or double-click to reset. Touch dragging is supported.

拖动 MIDI 窗或通道/插件区顶部的分隔条即可调整高度，两者在本次打开应用期间分别记忆。分隔条支持方向键（Shift 加大步进）、Home/End 和双击复位，也支持触屏拖动。

### Vertical track zoom / 走带纵向缩放

The arrangement toolbar provides independent horizontal zoom and track height (36–180 px). MIDI and stacked audio lanes scale together. Reset height restores 72 px without changing MIDI timing or selection.

走带工具栏支持独立的横向缩放和轨道高度（36–180 像素）。MIDI 与分层音频同步调整显示高度；“重置高度”恢复为 72 像素，不改变 MIDI 时间或选择。
