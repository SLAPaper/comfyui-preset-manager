# 参数扫描 Spec

## 目标

在保存的预设之上，沿一个或多个参数轴做笛卡尔积组合，逐个应用到当前 graph 并入队执行，
用于底模评测等需要控制变量的场景。

## 数据格式

存储路径：`sweeps/<template_id>/<sweep_id>.yaml`，仅 user 层（无 bundled 覆盖）。

```yaml
name: "CFG × Sampler 扫描"
description: "底模评测用"
axes:
  - type: param
    param: cfg
    values: [1.5, 3, 5.5, 8]
  - type: preset
    values: [anime-style, realistic-style]
  - type: param
    param: sampler
    values: [euler, dpmpp_2m]
```

- 数值与枚举不区分类型，由 YAML 标量天然承载。枚举合法性在运行前对照
  `widget.options.values` 校验。
- `axes` 数组顺序即循环顺序，`axes[0]` 为最外层。不设独立的 order 字段。
- 初始状态由用户保证——sweep 不支持 base_preset。如果要锁死非扫描维度的
  参数，把它们放进一个预设轴里。

## 覆盖规则

按 axes 顺序依次应用，后应用者覆盖先应用者，即**内层覆盖外层**。
preset 轴与 param 轴遵循同一规则，无特殊情况。

应用顺序：`axes[0]` → `axes[1]` → ... → `axes[n]`

## 职责划分

### 后端 `sweep_manager.py`

- 扫描配置 CRUD
- `expand(sweep)` → 完全解析的组合列表，preset 轴在后端展开为 params：

```python
[{"params": {...}, "label": "cfg=3, preset=anime"}, ...]
```

后端负责全部组合逻辑，使其可被单元测试覆盖。前端只消费扁平结果。

### 前端

- `preset-api.js` 抽出 `applyParamsToGraph(graph, template, params)`
  → `{successCount, totalCount, failed}`，由 `onApply()` 与扫描共用
- `sweep-dialog.js`：轴的增删、拖动排序、逗号列表输入、总数确认
- 执行循环：逐组合 apply + `await app.queuePrompt(0, 1)`，结束后恢复原始 widget 值
- 前置校验：用第一个组合试算，`failed` 非空则中止并报告，不入队

## 设计决策

| 决策 | 理由 |
|---|---|
| 不处理种子固定 | 控制种子的方式很多（自定义节点、SeedEverywhere 等），插件覆盖无法保证完全，做了反而制造"已保证"的错觉。由用户在 workflow 中自行保证。 |
| 独立对话框而非标签页 | 项目已有 `PresetEditorDialog` 先例，沿用零学习成本、零回归风险。模板选择通过传参共享。 |
| `sweep_manager.py` 独立于 `preset_manager.py` | 两者约 70% 逻辑相似，但预设有 bundled/user 双层覆盖、schema 与校验均不同。泛化需改动已测试代码，收益不抵风险。 |
| 组合展开放后端 | 项目无 JS 测试框架。展开顺序与覆盖规则是最易出 bug 处，放后端才能被 pytest 覆盖。 |
| 复用 ComfyUI 原生队列 | 进度、中断、预览全部继承，且不绑定输出节点。 |
| 只支持逗号列表输入 | 范围语法需配套预览功能，抬高使用门槛。 |
| 不做参数信息叠加到图片 | 生态已有 KJNodes AddLabel 等节点，用户在 workflow 中自行处理更灵活。 |

## 待定

- 入队确认框是否提示 `control_after_generate != fixed`（仅提示，不修改）
- 公共 CSS 抽取推迟到扫描功能跑通之后

## 测试

- `test_sweep_manager.py`：展开顺序、覆盖规则、preset 解析、CRUD
- E2E：扫描配置 CRUD 路由
