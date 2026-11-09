# SongScope — Studio One 工程查看器

**简体中文** | [English](README.en.md)

**打开 Studio One 工程，直观查看歌曲结构、轨道、插件与 MIDI。**

SongScope 是一个只读歌曲浏览器：不需要安装工程里的 VST 插件，也能查看工程结构、音符片段和插件名称。支持 Windows / macOS / Linux 桌面构建，以及手机与平板上的浏览器 / PWA。

> 当前为私有预览项目。GitHub 仓库与 Release 保持私有。网页版可通过链接访问，工程文件仅在使用者本地解析，不会上传到服务器。

## 语言、隐私与免责

界面按系统 / 浏览器首选语言自动选择：中文环境显示中文，其他环境显示英文。工程名称、音轨名称、预设及素材路径不会被翻译。

工程文件及其中的数据均在设备本地离线处理，**不会以任何形式上传**；不收集工程内容或素材路径。首次访问和更新网页仅下载应用资源。网页离线可用性取决于浏览器保留缓存，工程不会自动持久化。

这是非官方只读查看器，与 PreSonus / Fender 无关联。解析结果可能不完整或有误，请以原软件为准，并保留工程备份。素材路径只是保存的引用，不代表当前文件存在；缺少路径会明确提示。MIDI 导出功能保留，但不提供音频导出。

## 网页版

- 应用：<https://songscope.response.run>
- 简约图标候选：<https://songscope.response.run/icons.html>
- 桌面下载：本仓库的 [Releases](../../releases)，需要具有仓库访问权限。

## 功能

### 歌曲首页

打开 `.song` 后，默认显示工程内的歌曲封面、名称、艺术家、风格、创作者、速度、拍号、调性及制作软件。左侧浏览轨道，右侧查看插件清单。

### 只读编排

- 左边是轨道，右边是按工程内实际位置和长度排列的 MIDI 块。
- MIDI 块内绘制音符缩略图，时间标尺以小节显示，支持缩放和横向 / 纵向滚动。
- 点击片段进行多选，不能拖动、剪切、修改音符或写回工程。
- 音频轨显示素材文件名、事件名及工程保存的路径；编排和通道中均可展开查看。不访问外部素材，不提供音频导出，不渲染波形。

### 通道与插件

- 顶部点击「通道 / 插件」展开底部横向通道区。
- 每个轨道通道显示加载的 VSTi、插入效果链、发送目标及可识别的目标效果。
- 左侧选择轨道时，下方自动滚到对应通道并高亮；重复点击与重新展开也会重新定位。
- 文件夹没有独立通道。无法识别的插件或槽位会显示「无 / 未识别」。

### MIDI 导出

- 选择一个或多个 MIDI 块导出为标准 `.mid`。
- 导出整轨或全部片段时保留编排位置；单片段导出时以片段起点归零，多片段导出保留编排位置。速度 / 拍号节点同时写入 MIDI conductor track；单片段会从所在位置的有效速度 / 拍号开始。
- 桌面版使用文件保存对话框；手机优先使用系统分享面板，不支持时下载文件。
- **产品不提供 MIDI 导入和工程编辑入口，也不覆盖原工程。** `src/lib/midi.ts` 中保留了早期格式研究使用的写入辅助函数，不属于当前产品功能。

## 使用

1. 打开网页或桌面应用，选择 `.song` 文件；桌面浏览器也支持拖放。
2. 在歌曲首页查看封面与信息，切换「编排 / 走带」查看 MIDI 布局。
3. 点击左侧轨道，在下方通道区查看相应插件。
4. 选择片段后导出 MIDI，或导出整个轨道 / 全部编排。

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

## 桌面打包

```bash
npm run dist:win    # Windows NSIS；建议在 Windows 构建
npm run dist:mac    # macOS DMG；必须在 macOS 构建
npm run dist:linux  # Linux AppImage / deb
```

产物在 `release/`。跨平台 CI 见 [build.yml](.github/workflows/build.yml)。发布标签后，工作流会把各平台产物附加到私有 Release；不会把仓库改为公开。

## 快捷键

| 按键 | 功能 |
| --- | --- |
| F1 | 显示 / 隐藏帮助 |
| F2 | 显示 / 隐藏只读 MIDI 查看区 |
| F3 | 显示 / 隐藏底部混音台 |
| Esc | 关闭帮助 |

采用 [Studio One 常用快捷键布局](https://pae-web.presonusmusic.com/downloads/products/pdf/STUDIO_ONE_-_KEY_COMMANDS_SHEET.pdf)；F2 仅查看，不编辑。Mac 可能需要 Fn。输入框、修饰键组合与按键连发不会触发这些切换。

## 乐器预设名

- 直接读取工程内保存的 VST3 / VST2 插件状态，不安装或运行插件，也不查找外部采样文件。
- Serum 2：读取 XferJson 元数据中的预设名，已在授权真实工程中验证两个实例。
- Serum / 通用 VST2：在保存了 FXP program name 的情况下读取该字段。
- Kontakt：读取可见预设 / 快照元数据及 `.nki` / `.nkm` / `.nksn` 文件引用，多条可同时显示。文件引用明确标注，不等同于运行时音色加载验证；尚无用户真实 Kontakt 工程验证。
- 不把 S1 自动生成的 `3 - Serum 2.vstpreset` 等缓存文件名冒充音色名。压缩、加密、未知私有状态或未保存名称时显示「未识别」。

## Cloudflare Pages 部署（原生 Git 集成）

- 正式域名：<https://songscope.response.run>
- Pages 项目：`songscope-web`，源仓库：`yukinsnow/SongScope`（保持私有）。
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
| `public/` | PWA、现用图标、简约图标候选及预览页 |
| `build/` | 平台图标 PNG / ICO / ICNS |
| `scripts/` | 合成测试工程、验证与截图辅助脚本 |
| `fixtures/smoke.song` | 合成测试工程，不含真实用户歌曲 |

## 验证与格式说明

```bash
npm run build
xvfb-run -a npx electron --no-sandbox scripts/test-timing-shortcuts.cjs
xvfb-run -a npx electron --no-sandbox scripts/test-presets.cjs
```

合成回归覆盖 120→80→150→100 BPM、4/4→3/4→7/8→5/4、单片段归零、MIDI 元事件重读、F1/F2/F3、输入框与连发保护，以及 Serum/Kontakt/通用预设元数据、UTF-16 引用、损坏和未知状态。CI 在 Linux 构建前运行这些验证。


在获得授权的本地真实工程上验证了：44 条非文件夹轨道、70 个 MIDI 块；全部导出后重读为 5927 个音符。测试歌曲不随项目或网页分发。

```bash
# 默认使用 /tmp/s1real/song.zip；可用 SONG 指定本地样本
SONG=/path/to/example.song xvfb-run -a node_modules/.bin/electron --no-sandbox scripts/check-reader.cjs
```

覆盖首页与移动端截图、MIDI 导出重读、轨道 / 通道定位、重复选择和收起重开。部分历史截图脚本针对旧界面，仅作开发记录。

格式笔记：`MusicPart` 保存 `clipID / start / length / offset`（拍）；`mediapool.xml` 中的 `MusicClip mediaID` 指向 `Performances/**/*.musicx`。VSTi 通过乐器输出通道关联，插入与发送保持槽位顺序。

## 品牌与 Logo

已选定第 01 款「手写音乐」作为正式 Logo，主名为 **SongScope**，产品说明为 **Studio One 工程查看器**，不再使用中文品牌名。完整字标用于网页，音符与节奏线提取为平台应用图标。

保留 10 款不同风格的 AI 品牌概念图作为设计记录：手写音乐、瑞士极简、建筑字母、包豪斯、工业录音棚、复古合成器、丝带、负空间、唱片厂牌与模块音序。采用电蓝 / 深蓝黑 / 白色配色。

- [在线放大对比](https://songscope.response.run/brand/round-3/)
- 原图：`public/brand/round-3/01.png` 至 `10.png`
- [完整提示词](docs/branding/round-3/prompts.md)，使用内置 imagegen 生成
- 对比图：`shots/logo-round3-sheet.png`

除选定的 01 款外，其余均为未采用的概念预览。此前 E/F/G 去镜片方案仍保留于 `icons.html`，A/B/C/D 与 E/F/G 的 SVG 仍在 `public/brand/candidates/` 作记录。

---

非 PreSonus / Fender 官方产品，与相关商标所有者无关联。
