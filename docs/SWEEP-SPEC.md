# 参数扫描说明

## 目标

在保存的预设之上，沿一个或多个参数轴做笛卡尔积组合。插件逐组写入当前 graph，并提交到队列，用于底模评测等需要控制变量的场景。

## 数据格式

存储路径：`user/preset-manager/sweeps/{template_id}/{sweep_id}.yaml`。扫描配置只存用户目录。

```yaml
name: "CFG × Sampler 扫描"
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

保存时剥离 `workflow_template` 和 `id`；读取时由存储路径和文件名注入。`.yaml` 和 `.yml` 都可读取，同 stem 同时存在时 `.yaml` 优先。

- `axes` 的顺序即循环顺序，`axes[0]` 为最外层。
- 后应用的轴覆盖先应用的轴。预设轴和参数轴使用同一规则。
- 扫描不支持基础预设。需要固定非扫描参数时，把参数放进预设轴。

## 执行流程

1. 后端展开 `axes`，得到组合列表。预设轴在后端展开为完整参数。
2. 前端解析一次模板，检查全部组合；不修改 graph。任意组合无法匹配时停止。
3. 用户确认提交次数后，前端获取 graph 写锁，锁定模板、扫描轴和配置按钮。
4. 前端用 `captureParams()` 保存快照。快照覆盖所有组合用到的参数。
5. `sweep-runner.js` 逐组检查、应用参数，调用 `app.queuePrompt(0, 1)` 提交。
6. 每组提交后，前端用 `restoreParams()` 写回快照并恢复输出文件名；下一组从同一基线应用。
7. 运行结束或异常时释放写锁并恢复界面。

运行期使用开始时的模板和 graph 快照，不读取之后被修改的对话框状态。关闭扫描对话框不中断运行；重新打开时保留运行界面。扫描运行期间不能应用预设。

检查只确认参数能否匹配节点和 widget。插件不检查枚举值是否在 `widget.options.values` 内。

说明：取消只停止后续提交。已进入队列的任务继续执行。

## 职责划分

### 后端

`workflow_parser.py` 提供模板，`preset_manager.py` 提供预设，`sweep_manager.py` 负责扫描配置的增删改查和组合展开。展开结果是扁平列表，每条包含 `params` 和 `label`。

```python
[{"params": {...}, "label": "cfg=3, preset=anime"}, ...]
```

组合逻辑放在后端，便于单元测试覆盖。

### 前端

`matcher.js` 提供 `resolveParams()`、`checkParams()`、`applyParams()`、`captureParams()` 和 `restoreParams()`。预设应用和扫描共用这些函数。

`sweep-runner.js` 负责执行顺序和中途取消，依赖通过参数注入，不依赖 DOM。

`sweep-axes.js` 负责轴的增删、排序和 DOM 渲染。`sweep-values.js` 负责解析逗号列表、格式化轴值和计算运行总数，不依赖 DOM。

`sweep-dialog.js` 负责配置管理、快照捕获，并给执行器提供逐组恢复回调。

## 设计决策

| 决策 | 理由 |
|---|---|
| 不处理种子 | 固定种子的方式较多，插件无法保证一致，交给 workflow 处理 |
| 独立对话框 | 沿用预设对话框的交互方式，减少新交互 |
| 扫描配置独立于预设 | 两者的存储层级和字段不同，合并会改动已测试代码 |
| 后端展开组合 | 项目没有前端测试框架，展开顺序和覆盖规则放在后端才能被测试 |
| 复用 ComfyUI 队列 | 进度、中断和预览由 ComfyUI 提供，插件不绑定输出节点 |
| 只支持逗号列表 | 范围语法需要配套预览，暂不支持 |
| 不做图片叠加 | KJNodes AddLabel 等节点已能处理，用户在 workflow 内自行配置 |

## 待定

- 入队前是否提示 `control_after_generate != fixed`。只提示，不修改。

## 测试

- `tests/test_sweep_manager.py` 覆盖展开顺序、覆盖规则、预设轴解析和增删改查。
- `tests/js/sweep-runner.test.mjs` 覆盖执行顺序、逐组恢复、取消和中途失败。
- `tests/js/graph-lock.test.mjs` 覆盖 graph 写锁的独占和释放。
- `tests/e2e/test_api.py` 覆盖扫描配置接口和组合展开。
- `tests/e2e/test_preset_workflow.py` 覆盖扫描对话框交互、全组合预检和运行期隔离。
