# 曲镜 · SongScope

**打开 Studio One 工程，直观查看歌曲结构、轨道、插件与 MIDI。**

曲镜是一个只读歌曲浏览器：不需要安装工程里的 VST 插件，也能查看工程结构、音符片段和插件名称。支持 Windows / macOS / Linux 桌面构建，以及手机与平板上的浏览器 / PWA。

> 当前为私有预览项目。GitHub 仓库与 Release 保持私有。网页版可通过链接访问，工程文件仅在使用者本地解析，不会上传到服务器。

## 网页版

- 应用：<https://songscope.pages.dev>
- 简约图标候选：<https://songscope.pages.dev/icons.html>
- 桌面下载：本仓库的 [Releases](../../releases)，需要具有仓库访问权限。

## 功能

### 歌曲首页

打开 `.song` 后，默认显示工程内的歌曲封面、名称、艺术家、风格、创作者、速度、拍号、调性及制作软件。左侧浏览轨道，右侧查看插件清单。

### 只读编排

- 左边是轨道，右边是按工程内实际位置和长度排列的 MIDI 块。
- MIDI 块内绘制音符缩略图，时间标尺以小节显示，支持缩放和横向 / 纵向滚动。
- 点击片段进行多选，不能拖动、剪切、修改音符或写回工程。
- 音频轨会保留在轨道列表中，当前不渲染音频波形。

### 通道与插件

- 顶部点击「通道 / 插件」展开底部横向通道区。
- 每个轨道通道显示加载的 VSTi、插入效果链、发送目标及可识别的目标效果。
- 左侧选择轨道时，下方自动滚到对应通道并高亮；重复点击与重新展开也会重新定位。
- 文件夹没有独立通道。无法识别的插件或槽位会显示「无 / 未识别」。

### MIDI 导出

- 选择一个或多个 MIDI 块导出为标准 `.mid`。
- 导出整轨或全部片段时保留编排位置；单独导出所选片段时从片段内容起点开始。
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
- 复杂速度变化、循环片段、MIDI 控制器 / 表情数据等还需要更多样本验证；当前重点为音符导出，导出使用识别到的单一工程速度。
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

## Cloudflare Pages 部署

本项目是纯静态应用，无需数据库或服务端。构建输出为 `dist/`。

```bash
npm run build
# 使用环境变量配置 CLOUDFLARE_API_TOKEN 和 CLOUDFLARE_ACCOUNT_ID
npx wrangler@4 pages deploy dist --project-name=songscope --branch=main
```

参考 [Cloudflare Direct Upload 文档](https://developers.cloudflare.com/pages/get-started/direct-upload/)。不要把 API Token、`.env`、本地配置或隧道凭据提交进仓库。

## 项目结构

| 路径 | 内容 |
| --- | --- |
| `src/App.tsx` | 歌曲首页、只读编排、通道联动与导出交互 |
| `src/lib/song.ts` | 工程 ZIP、XML、元信息及插件路由解析 |
| `src/lib/musicx.ts` | `.musicx` 音符二进制编解码 |
| `src/lib/midi.ts` | 标准 MIDI 导出及早期格式研究辅助函数 |
| `electron/` | 桌面窗口与文件读写桥接 |
| `public/` | PWA、现用图标、简约图标候选及预览页 |
| `build/` | 平台图标 PNG / ICO / ICNS |
| `scripts/` | 合成测试工程、验证与截图辅助脚本 |
| `fixtures/smoke.song` | 合成测试工程，不含真实用户歌曲 |

## 验证与格式说明

在获得授权的本地真实工程上验证了：44 条非文件夹轨道、70 个 MIDI 块；全部导出后重读为 5927 个音符。测试歌曲不随项目或网页分发。

```bash
# 默认使用 /tmp/s1real/song.zip；可用 SONG 指定本地样本
SONG=/path/to/example.song xvfb-run -a node_modules/.bin/electron --no-sandbox scripts/check-reader.cjs
```

覆盖首页与移动端截图、MIDI 导出重读、轨道 / 通道定位、重复选择和收起重开。部分历史截图脚本针对旧界面，仅作开发记录。

格式笔记：`MusicPart` 保存 `clipID / start / length / offset`（拍）；`mediapool.xml` 中的 `MusicClip mediaID` 指向 `Performances/**/*.musicx`。VSTi 通过乐器输出通道关联，插入与发送保持槽位顺序。

## 图标待选

现用图标尚未替换。最新候选 E「原结构」、F「整齐版」、G「圆润版」保留内部走带线与三色 MIDI 块，去掉镜片圆环、反光及同心线。见 `public/brand/candidates/` 和网页版 `icons.html`。

候选页的预选只存于本机，不会自动更换应用图标。此前 A/B/C/D 的 SVG 仍保留作设计记录。运行 `python3 scripts/make-icon-options.py` 可重建当前三个候选及预览页。

---

非 PreSonus / Fender 官方产品，与相关商标所有者无关联。
