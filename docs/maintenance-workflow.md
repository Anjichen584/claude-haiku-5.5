# 批次维护、推送与重要代码备份

## 默认工作方式

一轮先给出可验收目标，在同一轮连续完成多个相关里程碑，不为每个小改动要求再次确认。按用户最新授权，不再自动创建优化分支：在 `main` 上完成相关修改，验证通过后统一提交并直接推送 `main`，无需用户手动合并。重要阶段仍创建并推送不可变的 `backup/` 标签。涉及破坏性迁移或改动既定产品方向时再确认。

一次回复结束后不会自行后台执行下一轮；需要持续后台运行的自动维护系统并未部署。本文件是后续维护约定，不是后台守护进程。

## 代码备份

Git 提交保留代码历史；每个重要阶段保留远端 `backup/` 标签作为固定恢复点，不在源码目录复制多份相同代码。

本批次已建立/计划完成的恢复点：

| 标签 | 恢复内容 |
|---|---|
| `backup/pre-quest-tracking-d048315` | 本轮任务系统修改前，包含前三轮战斗优化 |
| `backup/quest-tracking-2301df1` | 可选择并持久化追踪任务 |
| `backup/quest-guidance-732adb4` | 实际目标指引与 NPC 任务状态 |
| `backup/quest-journey-complete-20261015` | 本批次完成状态；最终提交后创建并推送 |

这些标签备份的是被 Git 跟踪的代码/文档/测试，不备份浏览器玩家存档、依赖安装目录、私钥或其他本地秘密。GitHub 上同仓库的标签也不等于异地灾备；若需要平台之外的独立备份，需另设受控远端。

恢复时新建分支，不重置或强推 main：

```bash
git fetch origin --tags
git switch -c restore/quest-checkpoint backup/quest-guidance-732adb4
```

不要移动或覆盖已发布的备份标签。每轮结束核对远端分支/标签与本地提交一致，并记录未通过的验证。

## 验收门禁

- `npm run typecheck`
- `npm run validate:data`
- `npm test`
- `npm run build:standalone`
- `npm audit`
- 涉及 UI/交互时运行相关 Playwright 回归。浏览器依赖：`pip install -r scripts/e2e/requirements.txt`，然后 `python -m playwright install --with-deps chromium`。
- main、其他工作分支及 PR 的 CI 还会在生产预览上运行真实开局路线、任务和离线冒烟。
- 不把脚本夹具当作真实长线游玩，也不把内存崩溃后的未完成用例标为通过。

## 发布边界

2026-10-15 用户授权将此前所有优化统一纳入 main，后续默认直接交付 main，不再自动新建优化分支。此前 12 个累积提交从 `optimize/early-route` 快进纳入，保留原提交与标签，不强推、不改写已发布历史。推送 main 会触发现有 Pages 构建/部署。每次推送前 fetch 并检查远端是否有并行修改；如已分叉先正常整合并验证，不覆盖他人的工作。

整合前恢复点：`backup/main-before-optimizations-20261015`（原 main `443b7c6`）。整合后恢复点：`backup/main-optimizations-integrated-20261015`。已发布主线需要回退时，优先用新的 revert 提交，不重置并强推。旧优化分支保留作历史，不要求用户逐个合并。

## 后续默认优先级

1. 正常步行第一小时路线：出生→遭遇→营地→任务发布/交付，记录路程和阻塞点。
2. NPC 身份/重复显示名、职业与聚落布置逐区整理，先列映射再改内容引用。
3. 长线资源和战斗平衡采样，而非只按数据数量判定内容完成。
4. 场景职责拆分与低内存设备测量；先复现和测量，不盲目重写。
