# S1 Toolbox

本地桌面工具，用于拆解 **PreSonus Studio One / Fender Studio Pro** 的 `.song` 工程文件：

- 查看全部轨道（名称、类型、颜色、文件夹层级、channelID）
- 查看每条轨道加载的乐器与效果插件（Native / 第三方）
- 浏览工程里的 MIDI 片段（clipID、起点、长度、音符数）
- 把 MIDI 片段导出为标准 `.mid`
- 把 `.mid` 写入工程（克隆已有片段的内部结构，只替换音符），另存为新 `.song`
- 一键导出格式诊断 JSON（用于适配未知版本 / 反馈问题）

所有解析都在本地完成，文件不会上传。

## 运行

```bash
npm install
npm start          # 构建 + 启动 Electron
npm run dev        # 只跑 Vite（浏览器调试，无原生文件对话框）
```

## 打包

```bash
npm run dist:linux   # AppImage + deb
npm run dist:win     # NSIS 安装包（需在 Windows 或配置 wine）
npm run dist:mac     # dmg（需在 macOS）
```

跨平台 CI 见 `.github/workflows/build.yml`。

本机（Linux arm64）实测产物：

- `release/S1 Toolbox-0.1.0.AppImage`（x64）
- `release/S1 Toolbox-0.1.0-arm64.AppImage`（arm64）
- `release/S1 Toolbox-0.1.0-win.zip`（Windows x64 免安装版）

在无网络的构建机上补 Electron 二进制镜像：

```bash
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ \
ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/ \
npx electron-builder --linux AppImage --x64
```

> Linux arm64 主机无法生成 NSIS 安装包（makensis 只有 x64 二进制）；
> Windows 用 `--win zip` 出免安装版，安装包交给 CI 的 windows-latest。
> macOS dmg 必须在 macOS 上构建。

## .song 格式速记

`.song` 本质是一个 ZIP：

| 条目 | 内容 |
| --- | --- |
| `Song/song.xml` | 轨道列表、part 元数据、速度/拍号 |
| `Song/mediapool.xml` | 音频素材池 |
| `Devices/audiosynthfolder.xml` | 乐器轨的插件实例 |
| `Devices/musictrackdevice.xml` | 音乐轨通道 / instrumentOut |
| `Devices/audiomixer.xml` | 调音台通道、Inserts/Sends 效果链 |

轨道位于 `Attributes[x:id=Root]/List[x:id=Tracks]` 下，节点为
`MediaTrack` / `FolderTrack` / `AutomationTrack`；
每个 `MediaTrack` 通过 `UID[x:id=channelID]` 关联设备通道。

> 注意：不同 Studio One 版本的结构会变。遇到解析不到的内容，请点「导出格式诊断」，把 JSON 发回来即可适配。

## MIDI 导入的安全策略

- 永远另存为 `*-edited.song`，不覆盖原工程
- 结构上优先克隆**目标轨道已有片段**，保留未知字段，只替换音符
- 没有可参考片段时退化为最小 `<MusicPart>`，并给出警告

## 开发脚本

```bash
node scripts/make-fixture.cjs   # 生成测试用 .song
node scripts/smoke.cjs          # 解析 / MIDI 往返冒烟测试（需要 xvfb）
node scripts/shot.cjs           # 生成 UI 截图到 shots/
```
