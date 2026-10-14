# 资源规范（Asset Guidelines）

> 目标：让仓库在长线开发中保持可克隆、可推送、体积可控。
> 相关文档：[设计目标](design-targets.md)、[路线图](roadmap.md)
> 最后更新：2026-10-14

---

## 1. 目录约定

```text
assets/                 # 进入仓库的成品资源（经过压缩，走 Git LFS）
├── sprites/            # 角色、敌人、道具精灵（PNG）
├── tilesets/           # 瓦片集（PNG）
├── ui/                 # 界面素材（PNG）
├── audio/
│   ├── bgm/            # 背景音乐（OGG）
│   ├── sfx/            # 音效（OGG）
│   └── voice/          # 语音（OGG）
└── fonts/              # 字体（TTF / WOFF2）

source-assets/          # 源文件（PSD、AI、工程文件、原始录音）
                        # 不进入仓库，见第 5 节
```

`source-assets/` 必须写入 `.gitignore`，防止误提交。

---

## 2. 图片规范

| 项目 | 规范 |
|---|---|
| 格式 | 成品使用 PNG；UI 或照片类可用 WEBP |
| 单张原始尺寸 | 精灵帧不超过 128×128；UI 面板不超过 1024×1024 |
| 图集 | 同类精灵打包为图集，单张图集不超过 2048×2048 |
| 单文件上限 | 单文件不超过 **20 MB**，超过需要拆分或降采样 |
| 色彩 | 统一使用 sRGB，导出时去掉无用元数据 |
| 命名 | 小写英文加下划线，如 `ash_wolf_idle_01.png` |

图集统一由 `scripts/pack-atlas.ts` 生成，手动修改图集文件不被允许。

---

## 3. 音频规范

| 类型 | 格式 | 比特率 / 参数 | 说明 |
|---|---|---|---|
| 背景音乐 | OGG Vorbis | 约 128 kbps，立体声 | 循环点需在文件内标注 |
| 音效 | OGG Vorbis | 约 96 kbps，单声道或立体声 | 单个文件不超过 1 MB |
| 语音 | OGG Vorbis | 约 64–96 kbps，单声道 | 按语言分目录 |
| 源录音 | WAV 24-bit / 48 kHz | 无损 | 只保留在 `source-assets/` |

- 不向仓库提交 WAV 成品，避免体积迅速膨胀。
- 单个音频文件超过 **10 MB** 时需要复查码率。
- 所有音频必须在 `assets/LICENSE.md` 中登记来源与授权。

---

## 4. Git LFS 使用说明

### 4.1 已配置的规则

根目录的 `.gitattributes` 已将以下类型交给 Git LFS 管理：

- 图片：`png`、`jpg`、`jpeg`、`webp`、`gif`
- 音频：`ogg`、`mp3`、`wav`、`flac`
- 字体：`ttf`、`otf`、`woff2`

### 4.2 克隆与安装

```bash
# 安装 Git LFS（只需一次）
git lfs install

# 克隆仓库，LFS 文件会自动下载
git clone git@github.com:Anjichen584/claude-haiku-5.5.git
```

### 4.3 常用检查命令

```bash
# 查看哪些文件由 LFS 管理
git lfs ls-files

# 查看某个文件是否走 LFS
git check-attr filter -- assets/sprites/hero.png

# 查看 LFS 占用的本地空间
git lfs env
```

### 4.4 注意事项

- `.gitattributes` 只对**新加入**的文件生效。已经普通提交的大文件需要用 `git lfs migrate` 迁移，迁移前请先与团队确认，因为会改写历史。
- GitHub 免费账户的 LFS 存储与流量有额度限制，超出后需要付费。请定期用 `git lfs ls-files --size` 查看占用。
- 不要用 LFS 存放代码、JSON 数据或文档，这些内容应直接提交。

---

## 5. 源文件与打包产物

| 类型 | 去向 | 理由 |
|---|---|---|
| PSD、AI、Figma 导出工程 | `source-assets/`（不入库，网盘或 NAS 保存） | 单个文件常超过 100 MB |
| 原始录音 WAV | `source-assets/` | 体积大，成品已有 OGG |
| 安装包（`.msi`、`.dmg`、`.AppImage`） | GitHub Releases | 单文件上限 2 GB，且不应进入 Git 历史 |
| 构建产物（`dist/`、`src-tauri/target/`） | 不入库 | 由构建命令生成 |

仓库里只保留一份 `source-assets/README.md`，记录源文件的存放位置与命名规则，不保存源文件本身。

---

## 6. 授权与署名

- 每个资源在 `assets/LICENSE.md` 中登记一行：文件路径、作者、来源、授权类型。
- 购买或下载的素材需保留原始许可证文件，放入 `source-assets/licenses/`。
- AI 生成的图片和音频同样需要登记，并标注生成工具与版本。

---

## 7. 提交前检查清单

- [ ] 图片已压缩，单文件不超过 20 MB
- [ ] 音频为 OGG 成品，没有误放 WAV
- [ ] 文件命名符合小写英文加下划线的规则
- [ ] `source-assets/` 中的文件没有被 `git add`
- [ ] 新资源已在 `assets/LICENSE.md` 中登记
- [ ] 运行 `git lfs ls-files` 确认大文件走的是 LFS

---

## 修订记录

| 版本 | 日期 | 说明 |
|---|---|---|
| v0.1 | 2026-10-14 | 初版，确定目录、格式与 LFS 规则 |
