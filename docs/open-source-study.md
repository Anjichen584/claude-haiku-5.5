# 开源游戏源码研读与落地（第四轮）

研读日期：2026-10-14。以下链接固定到本次实际查看的提交，便于复核，不以星数作为质量结论。

## 1. Shattered Pixel Dungeon

仓库：[00-Evan/shattered-pixel-dungeon](https://github.com/00-Evan/shattered-pixel-dungeon)

本次提交：`57a4e06a4caf162446d1c28caa7983f0493fecf0`。

读过的关键源码：
- [`Dungeon.java` 保存/加载](https://github.com/00-Evan/shattered-pixel-dungeon/blob/57a4e06a4caf162446d1c28caa7983f0493fecf0/core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/Dungeon.java#L624-L730)：`saveGame` 保存版本、种子、角色和深度等；`saveLevel` 保存层状态；`saveAll` 协调两者。
- [`Item.java` 物品序列化](https://github.com/00-Evan/shattered-pixel-dungeon/blob/57a4e06a4caf162446d1c28caa7983f0493fecf0/core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/items/Item.java#L590-L626)：物品对象保存数量、等级、诅咒/鉴定状态及快捷栏信息，不只记录物品种类。

**学到什么**：生成种子不等于探索进度。角色状态与地图状态都必须有明确的保存边界；独立物品的可变状态也应属于物品实例。

**本轮落地**：新增独立的地牢快照/恢复模块，保存实际生成的图、当前位置、已领奖房间、Boss 完成状态及各已到达层的档案。地图不依赖重新生成器来恢复。

**没有照搬什么**：对方使用多个文件，我们在浏览器中将角色、任务、物品和地牢放进同一个 JSON 检查点，避免不同域来自不同次保存。物品实例只形成后续设计方向，本轮没有宣称已经实现。

## 2. FLARE

仓库：[flareteam/flare-engine](https://github.com/flareteam/flare-engine)

本次提交：`1969baeb89ebf94cf22e2bc2ed4e3d8413714d4f`。

读过的关键源码：
- [`SaveLoad.cpp`](https://github.com/flareteam/flare-engine/blob/1969baeb89ebf94cf22e2bc2ed4e3d8413714d4f/src/SaveLoad.cpp#L75-L207)：保存角色经验、可选 HP/MP、装备与随身物品、campaign 数据和引擎版本。加载流程重算角色并重新应用装备。
- [`MapSaver.cpp`](https://github.com/flareteam/flare-engine/blob/1969baeb89ebf94cf22e2bc2ed4e3d8413714d4f/src/MapSaver.cpp)：查看地图、敌人组与事件组件的序列化。注意它是地图导出代码，不能拿来证明运行时自动保存了开箱状态。

**学到什么**：进度包含战役状态，不只是角色位置和背包；存档结构和运行时重建应与主要游戏逻辑分离。版本信息有助于定位兼容问题。

**本轮落地**：把地牢序列化、图结构校验放在 `checkpoint.ts`，存储与恢复放在 `saveRepository.ts`；场景只调用转换和保存接口。读取前校验房间/连线引用、连通性、重复标记及 Boss 完成一致性。

**适配而非照抄**：没有引入 C++ 引擎或对方文件格式，也没有声称对方使用了我们实现的主备存档策略。

## 3. BrowserQuest

仓库：[mozilla/BrowserQuest](https://github.com/mozilla/BrowserQuest)

本次提交：`af32d247cac3495ca430d0effbb88dd5f3250b2c`。

读过的关键源码：
- [`client/js/storage.js`](https://github.com/mozilla/BrowserQuest/blob/af32d247cac3495ca430d0effbb88dd5f3250b2c/client/js/storage.js)：集中管理客户端档案、外观装备字段和成就，先检查本地存储支持，状态变化后保存。
- [`LICENSE`](https://github.com/mozilla/BrowserQuest/blob/af32d247cac3495ca430d0effbb88dd5f3250b2c/LICENSE)：代码与内容许可不同。

**学到什么**：浏览器存储可以集中封装，而不必散在每个 UI 控件中；应明确客户端究竟保存哪些状态。

**本轮落地**：集中定义存档键、主备恢复、结构校验和失败返回。标题页根据活动地牢决定进入地表还是继续地牢，恢复备份时明确提示可能回退。

**没有盲目学习**：这个旧文件直接解析 JSON、没有当前项目需要的完整冒险进度与损坏恢复策略；我们补上异常处理、合法性校验和上一份有效检查点。不引入联网服务器，也不把它的客户端档案当成完整离线存档方案。

## 许可边界

Shattered Pixel Dungeon 与 FLARE 的所读源码头标明 GPLv3 或更新版本；BrowserQuest 代码为 MPL 2.0，内容为 CC-BY-SA 3.0。这里只研究架构并用项目自身的 TypeScript 数据模型重新实现，没有复制它们的代码文件、素材、剧情或数值表到本仓库，也未新增运行时依赖。若未来引入实际代码或素材，必须单独核查并履行许可要求。

## 下一步可借鉴但尚未做完

- 物品定义与物品实例分开：实例 ID、随机种子、已抽取词条、装备引用、出售指定实例、旧档迁移。
- 把“获得物品”统一成一个入口，避免战斗/商店/任务各自处理实例创建而发生漏接。
- 用正常游玩的装备与金币曲线验收难度，而不只看测试夹具能否通过战斗。
