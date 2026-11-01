# 设计说明

## 目标

为底模评测保存采样配置。用户选择模板和预设后，插件把参数写入当前 workflow 的 widget。插件不绑定输出节点，也不接管队列。

## 组成

| 层 | 文件 | 职责 |
|---|---|---|
| 前端 | `web/preset-manager.js` | 注册扩展，添加入口按钮 |
| 前端 | `web/client.js` | HTTP 请求 |
| 前端 | `web/matcher.js` | 节点匹配、参数读取、检查、应用 |
| 前端 | `web/sweep-runner.js` | 扫描执行顺序和取消 |
| 前端 | `web/sweep-axes.js` | 扫描轴编辑和总数显示 |
| 前端 | `web/sweep-values.js` | 轴值解析、格式化和总数计算 |
| 前端 | `web/sweep-trace.js` | 输出文件名标记和恢复 |
| 前端 | `web/styles.js` | 对话框共享样式 |
| 前端 | `web/*-dialog.js` | 对话框和表单 |
| 后端 | `__init__.py` | 注册 HTTP 路由 |
| 后端 | `storage.py` | 安全 ID、原子写、用户目录、YAML 扫描 |
| 后端 | `workflow_parser.py` | 加载和校验模板 |
| 后端 | `preset_manager.py` | 预设增删改查 |
| 后端 | `sweep_manager.py` | 扫描配置增删改查、组合展开 |
| 存储 | `workflows/`、`presets/` | 内置模板和预设 |
| 存储 | `user/preset-manager/` | 用户模板、预设、扫描配置 |

数据和执行只在前端。后端只提供存储和组合展开，不匹配节点，也不接收 workflow。

## 节点匹配

匹配逻辑只有一份，位于 `web/matcher.js`。模板的 `node_mapping` 为每个参数声明匹配策略。

| 策略 | 定位方式 | 限制 |
|---|---|---|
| `unique_class` | 按 `class_type` 查找唯一节点 | 目标类型的节点多于 1 个时失败 |
| `title_keyword` | 按 `class_type` 查找节点，再按标题关键词筛选 | 标题匹配的节点必须唯一，否则失败 |
| `output_connection` | 从目标节点的指定输入回溯源节点；输入未连接时改用目标节点自身 | 目标节点必须唯一 |
| `input_slot` | 从枢纽节点的命名输入回溯源节点，可沿连接递归 5 层 | 枢纽节点必须唯一，输入必须已连接 |

`synonyms` 在比较前映射节点类型。例如 `KSamplerAdvanced` 按 `KSampler` 处理。

匹配会进入子图。子图内部的 widget 如果被提升为子图输入，写入目标是子图实例上的宿主 widget：执行时读取的是宿主值，写内部节点的同名 widget 不会生效。宿主输入由外部连线驱动时，该参数视为不可写。`nodeId` 用 `实例ID:节点ID` 表示跨层节点，例如 `459:458`。

匹配模块对外提供 6 个函数：

```text
resolveParams(graph, template) -> {param: {nodeId, widgetName, value, widget} | null}
readParams(graph, template)     -> [{name, nodeType, nodeId, value, defaultSelected}]
checkParams(graph, template, params) -> failed[]
explainParams(graph, template, names) -> {param: reason}
applyParams(graph, template, params) -> {applied, failed}
captureParams(graph, template, names) -> [{name, widget, value}]
restoreParams(graph, snapshot)  -> void
```

预览、读取当前参数和参数注入调用 `resolveParams`，调用方不需要知道策略分支。扫描前用 `captureParams` 保存指定参数，结束后用 `restoreParams` 写回。`checkParams` 不修改 graph，扫描试算和逐组校验都调用这个函数。`explainParams` 只返回匹配失败的原因，应用预设和扫描预检用它显示用户可读的失败信息。

模板可以用 `include: "_loaders"` 引入 `workflows/_loaders.yaml` 中的共享参数。合并时模板自己的 `node_mapping` 覆盖同名定义，`include` 不写入加载结果。

## 预设

预设由元数据和 `params` 组成。参数名必须与模板的 `node_mapping` 一致。

存储分两层。内置预设位于 `presets/{template_id}/`，用户预设位于 `user/preset-manager/presets/{template_id}/`。同名文件以用户目录为准。预设 ID 取自文件名，保存时写入用户目录。

内置预设只写提示词、尺寸和采样参数，不写模型文件名。模型由当前 workflow 决定，换机器后内置预设仍可直接使用。

新建预设时，前端用 `readParams()` 读取当前 graph 的参数值。参数默认勾选，模板里声明 `default_selected: false` 的参数除外。共享模型加载器参数都带这个标记，避免预设绑定本机模型文件。编辑预设时，前端重新读取当前 graph。当前 graph 匹配不到的已存参数不会出现在编辑器中，保存后会被删除。

编辑内置预设会以 `名称 副本` 新建用户预设，内置文件保持不变。用户预设编辑后覆盖自身，ID 不变。表单模式和代码模式切换时互相同步；代码模式里新增的参数会作为“自定义”项回到表单。代码中的 `id` 和 `workflow_template` 不生效，保存时始终使用对话框当前的 ID 和模板。

预设列表返回 `source` 字段，取值为 `bundled` 或 `user`。界面只对用户预设显示删除按钮。删除接口只删除用户目录的文件，内置预设无法删除。

## 扫描

扫描配置由 1 个或多个轴组成。参数轴直接给参数取值，预设轴展开为一个预设的全部参数。后端用笛卡尔积展开组合，`axes[0]` 为最外层。后应用的轴覆盖先应用的轴。

每组提交前，`sweep-trace.js` 把带 `filename_prefix` 的 widget 改成 `原名_001_组合标签`，让输出文件能对应到组合。扫描结束后恢复原名。标签中的路径分隔符、控制字符和 `%` 替换为下划线。

前端执行流程：

1. 用 `checkParams()` 检查第一个组合能否匹配节点和 widget。
2. 用户确认提交次数。
3. 保存快照。快照覆盖所有组合用到的参数。
4. `sweep-runner.js` 逐组检查、应用、提交队列。
5. 运行结束后恢复快照。

`runSweep()` 接收检查、应用、提交、进度和取消回调，不依赖 DOM。取消只停止后续提交，已进入队列的任务继续执行。

扫描不校验枚举值是否在 widget 的可选项内。

## 模板关联

用户点击 “Apply Preset” 后，前端把模板 ID 写入 `app.graph.extra.preset_template`。这个字段随 workflow 保存。未保存 workflow 时，关联不会持久化。下次打开预设对话框或扫描对话框时，前端读取该字段，自动选择模板。

关联不再使用独立映射文件，也不依赖 workflow 名称。旧版本的 `mapping.yaml` 不再读取。

## 存储与安全

`storage.py` 统一处理存储：

- `is_safe_id()` 和 `require_safe_id()`：ID 不能包含 `/`、`\`、`:`、空值、`.` 或 `..`。
- `save_yaml()`：先写临时文件，再用 `os.replace()` 替换目标文件。
- `scan_yaml()`：按文件名读取目录下的 YAML。
- `user_dir()`：返回 `user/preset-manager/` 下的目录。

业务模块在拼接路径前调用 `require_safe_id()`。路由用 `_match_ids()` 和 `_body_ids()` 检查入参，非法 ID 返回 400。

## 测试面

- `tests/js/matcher.test.mjs` 覆盖 4 种策略、同义词、检查、应用、快照和读取。
- `tests/js/templates.test.mjs` 用快照模板和真实结构图验证每个参数的匹配结果。
- `tests/js/sweep-runner.test.mjs` 覆盖执行顺序、取消和中途失败。
- `tests/js/sweep-values.test.mjs` 覆盖轴值解析和总数计算。
- `tests/js/sweep-trace.test.mjs` 覆盖输出文件名标记、清理和恢复。
- `tests/test_storage.py` 覆盖 ID 校验和原子读写。
- `tests/test_templates_snapshot.py` 保证模板快照与 `workflows/` 一致。
- `tests/test_preset_manager.py`、`tests/test_sweep_manager.py` 覆盖存储行为。
- `tests/e2e/` 覆盖 HTTP 接口和界面流程。

## 已知限制

- 含多个 KSampler 的 workflow 无法用 `unique_class` 或 `input_slot` 匹配采样参数。
- 编辑预设会丢失当前 graph 匹配不到的已存参数。
- 扫描不校验枚举值。
- 没有 `filename_prefix` 的输出节点无法写入组合标记。
- 脚本无法通过 HTTP 应用预设。应用只在前端完成。

## 后续方向

- 支持按标题或序号选择多个同类型节点。
- 编辑预设时保留当前 graph 匹配不到的已存参数。
- 用 `graphToPrompt()` 预构造 prompt，避免扫描期间修改 graph。
