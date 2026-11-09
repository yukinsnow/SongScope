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

## 移动端

同一个 React 构建既是桌面 Electron 渲染层，也是可安装的 PWA：

- 响应式布局（≤820px）：顶部统计、横向轨道胶囊、卡片式 MIDI 列表
- 手机上点「打开 .song」从「文件」选择工程；解析全在浏览器本地完成
- 导出文件优先走系统分享面板（存到「文件」、AirDrop、微信等），不支持时回退下载
- 「添加到主屏幕」后可全屏离线使用（Service Worker 缓存）

本地起静态服务：

```bash
cd dist && python3 -m http.server 18090 --bind 127.0.0.1
```

再配一个 Cloudflare quick tunnel（或任意 HTTPS 反代）即可在手机上打开。
PWA 安装要求 HTTPS（localhost 除外）。

## 真实工程格式（Studio One 6/7 / Fender Studio Pro）

以真实工程验证：

- `Song/song.xml`：`List[x:id=Tracks]` 下是 `MediaTrack/FolderTrack`；
  `MarkerTrack/ChordTrack/ArrangerTrack/LyricsTrack/VideoTrack` 是工具轨，应跳过
- `MediaTrack` `mediaType="Music"` 为乐器轨，`mediaType="Audio"` 为音频轨
- `MusicPart` 只存编排信息：`clipID / start / length / offset / timeFormat / name`
  （单位是**拍**）
- MIDI 音符不在 song.xml，而在 **`Performances/**/*.musicx`** 二进制文件里；
  `Song/mediapool.xml` 的 `MusicClip mediaID` 对应 `MusicPart clipID`，
  `Url url="media:///Performances/..."` 指向压缩包内路径
- `.musicx` 是带类型标记的 TLV 流：`{` 对象、`[` 数组、`D` float64、`I` int16、
  `i` varint、`U` uint8、`s` 字符串；事件字段为
  `start / pitch / noteId / length / velocity`（velocity 为 0–1）
- 颜色为 `AARRGGBB`（如 `FF2ACAFF`）
- 速度 `TempoMapSegment tempo` 存的是**每拍秒数**（`0.441176` = 136 BPM）

导入 MIDI 时会：写新的 `.musicx` → 在 mediapool 注册 `MusicClip` →
在目标轨道 `List[x:id=Events]` 下插入 `MusicPart`，最后另存新工程。
