# 裂隙编年史 / Rift Chronicles

> 一座被裂隙撕碎的大陆，一场横跨地表与地下的长线生存与抉择。
> 2D 开放世界 RPG 与 Roguelike 地牢的融合作品，纯本地离线运行。

![状态](https://img.shields.io/badge/状态-规划中-lightgrey)
![许可证](https://img.shields.io/badge/许可证-MIT-blue)

<!-- 占位：截图 / GIF，待阶段 1 原型完成后补充 -->

---

## 项目定位

- **目标游玩体量**：每天 4–6 小时，约 1 个月完成一个主结局路线，完整内容约 80–100 小时。
- **技术栈**：TypeScript、Phaser 3、Vite，可选 Tauri 打包为桌面应用。
- **运行原则**：纯本地离线，运行时不包含任何 AI 模型或 API 调用。

---

## 文档索引

| 文档 | 说明 |
|---|---|
| [设计目标](docs/design-targets.md) | 长线体量、内容分配、节奏约束 |
| [开发路线图](docs/roadmap.md) | 阶段 0–8 的交付物与验收标准 |
| [资源规范](docs/asset-guidelines.md) | 图片、音频格式，Git LFS 使用说明 |

---

## 当前进度

| 阶段 | 状态 |
|---|---|
| 阶段 0：工程搭建 | 进行中（文档与仓库规范已完成） |
| 阶段 1–8 | 未开始 |

详细排期见 [开发路线图](docs/roadmap.md)。

---

## 仓库结构

```text
claude-haiku-5.5/
├── docs/               # 设计与规范文档
│   ├── design-targets.md
│   ├── roadmap.md
│   └── asset-guidelines.md
├── .gitattributes      # Git LFS 规则
├── .gitignore
└── README.md
```

游戏代码、`data/` 数据目录与 `assets/` 资源目录将在阶段 0 中陆续加入。

---

## 开发环境（计划）

```bash
npm install        # 安装依赖
npm run dev        # 启动浏览器开发服务器
npm run build      # 生成生产构建
npm run tauri build  # 打包桌面应用（可选）
```

> 以上命令在阶段 0 完成后可用。

克隆仓库前请先安装 Git LFS：

```bash
git lfs install
git clone git@github.com:Anjichen584/claude-haiku-5.5.git
```

---

## 贡献

目前为个人项目，暂不接受外部 Pull Request。开发约定见 [资源规范](docs/asset-guidelines.md) 与 [设计目标](docs/design-targets.md)。

---

## 许可证

代码采用 [MIT License](LICENSE) 发布（LICENSE 文件将在阶段 0 中添加）。

美术与音频资源的授权信息登记于 `assets/LICENSE.md`。

---

## 说明

本项目在开发期间使用 Claude Haiku 辅助编写代码。这只属于开发阶段的工程辅助，**游戏运行时不包含任何 AI 组件或 API 调用**。
