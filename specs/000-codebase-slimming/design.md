# 000 设计

## 需要读的文件

- 核心架构：`src/core/{world,commands,reducer,schema,simulation}.ts`
- 玩法模块：`src/minigames/angling.ts`、`src/core/fishing/*`、`src/content/{fish,city}.ts`、`src/view/fishing/panel.ts`
- 用例：`tests/unit/angling.test.ts`、`tests/integration/*-save.test.ts`、`tests/e2e/fishing-motion.spec.ts`

## 决策

- **规格放在 `content/`**：它已是定义层，Core、小游戏与 View 都可依赖，且保持纯 TypeScript。每个小游戏一个 `*-spec.ts`，不做通用规格框架。
- **公式参数化而非表格化**：如绿区宽度 `base − stars × perStar + (skill − 1) × perSkill`，规格保存系数，函数留在小游戏里，数值改动只碰规格文件。
- **遭遇规则仍是代码**：各水域的条件分支保留在 `chooseFish`，阈值（方向、力度、概率）来自规格；不引入规则 DSL。
- **错误码**：`core/commands.ts` 导出 `ERROR_CODES` 常量元组与 `ErrorCode` 类型，`CommandError` 构造器只接受该类型。
- **美工边界**：`view/art/` 放 Phaser 绘图与调色板；决定按钮位置的布局 CSS 留在各模块，因为它属于交互契约。
- **存档**：删除字段即升级 `saveVersion`，沿用"旧档拒绝 + 显式重置"，不写迁移。
