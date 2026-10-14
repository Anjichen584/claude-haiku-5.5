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
| 阶段 0：工程搭建 | 已完成（骨架、数据加载、校验脚本、测试均可运行） |
| 阶段 1：核心玩法原型 | 已完成（移动、冲刺、闪避、攻击、3 种敌人 AI，见测试房间） |
| 阶段 2：地牢生成 | 已完成（房间图、连通性检测与重试、12 层参数、房间模板） |
| 阶段 3：开放世界 | 已完成（种子噪声区块、5 种群系、河流与道路、昼夜光照、天气） |
| 阶段 4：成长系统 | 已完成（80 种词条、3 套套装、45 个技能与 8 个组合技、重铸） |
| 阶段 5：叙事系统 | 已完成（任务状态机、对话条件与效果、世界状态与序列化） |
| 阶段 6：阵营与结局 | 已完成（五阵营声望与敌对联动、档位效果、稳定度、7 个结局、4 个关键抉择） |
| 阶段 7：内容生产 | 数量已达标：主线 24/24、支线 120/120、隐藏 20/20、敌人 46/45、精英 12/12、Boss 8/8、对话节点 2008/2000（`npm run content:stats`）；地点与 NPC 引用已校验（40 个地点、1 个 NPC）；地表已放置 40 个地点标记（`src/world/placement.ts`），玩家走近即触发抵达并推进任务；NPC 可在地点上靠近按 E 对话，对话结束后推进 talk 任务（`src/world/npcs.ts`）；已有 21 个 NPC 分布在 40 个地点中的 18 个上（`data/npcs.json`）；NPC 数量与内容质量待扩充 |
| 阶段 8：长线与发布 | 未开始 |

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

## 开发环境

环境要求：Node.js 20 LTS 或更高版本。

```bash
npm install            # 安装依赖
npm run dev            # 启动浏览器开发服务器（http://localhost:5173）
npm run typecheck      # TypeScript 类型检查
npm run validate:data  # 校验 data/ 中的 JSON 引用与字段
npm test               # 运行单元测试
npm run build          # 类型检查 + 生产构建，输出到 dist/
npm run preview        # 预览生产构建（http://localhost:4173）
```

> 打包桌面应用（`npm run tauri build`）计划在阶段 8 加入。

**内存较小的机器**：如果 `npm run build` 被系统终止（Killed / OOM），可以用
`npx vite build` 配合 `sourcemap: false`（当前配置已默认关闭）。Phaser 体积较大，
构建时需要约 1.5 GB 可用内存。

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
