# 设计说明

## 目标

为底模评测保存采样配置。用户选择模板和预设后，插件把参数写入当前 workflow 的 widget。插件不绑定输出节点，也不接管队列。

## 组成

| 层 | 文件 | 职责 |
|---|---|---|
| 前端 | `web/preset-manager.js` | 注册扩展，添加单一入口按钮 |
| 前端 | `web/client.js` | HTTP 请求 |
| 前端 | `web/template-store.js` | 模板列表缓存与失效 |
| 前端 | `web/graph-index.js` | 图遍历、子图作用域、写入目标解析 |
| 前端 | `web/matcher.js` | 匹配策略、参数读取、检查、应用 |
| 前端 | `web/template-analyzer.js` | 从当前 graph 识别候选模板参数 |
| 前端 | `web/sweep-runner.js` | 扫描执行顺序和取消 |
| 前端 | `web/sweep-axes.js` | 扫描轴编辑和总数显示 |
| 前端 | `web/sweep-values.js` | 轴值解析、格式化和总数计算 |
| 前端 | `web/sweep-trace.js` | 输出文件名标记和恢复 |
| 前端 | `web/styles.js` | 对话框共享样式 |
| 前端 | `web/*-dialog.js` | 对话框和表单 |
| 后端 | `__init__.py` | 注册 HTTP 路由 |
| 后端 | `storage.py` | 安全 ID、原子写、用户目录、YAML 扫描 |
| 后端 | `workflow_parser.py` | 加载、校验和保存模板 |
| 后端 | `preset_manager.py` | 预设增删改查 |
| 后端 | `sweep_manager.py` | 扫描配置增删改查、组合展开 |
| 存储 | `workflows/`、`presets/` | 内置模板和预设 |
| 存储 | `user/preset-manager/` | 用户模板、预设、扫描配置 |

数据和执行只在前端。后端只提供存储和组合展开，不匹配节点，也不接收 workflow。

## 节点匹配

图遍历和写入目标解析只有一份，位于 `web/graph-index.js`。`createGraphIndex()` 一次收集节点、作用域和父层关系，后续参数解析共享这个索引。子图提升、自由宿主、外部连线、多层递归和 `Primitive*` 兜底都在这里处理。

匹配策略位于 `web/matcher.js`，只消费索引返回的写入目标。模板的 `node_mapping` 为每个参数声明匹配策略。

| 策略 | 定位方式 | 限制 |
|---|---|---|
| `unique_class` | 按 `class_type` 查找唯一节点 | 目标类型的节点多于 1 个时失败 |
| `title_keyword` | 按 `class_type` 查找节点，再按标题关键词筛选 | 标题匹配的节点必须唯一，否则失败 |
| `output_connection` | 从目标节点的指定输入回溯源节点；输入未连接时改用目标节点自身 | 目标节点必须唯一 |
| `input_slot` | 从枢纽节点的命名输入回溯源节点，可沿连接递归 5 层 | 枢纽节点必须唯一，输入必须已连接 |

`synonyms` 在比较前映射节点类型。例如 `KSamplerAdvanced` 按 `KSampler` 处理。

匹配会进入子图。子图内部的 widget 如果被提升为子图输入，写入目标是子图实例上的宿主 widget：执行时读取的是宿主值，写内部节点的同名 widget 不会生效。`nodeId` 用 `实例ID:节点ID` 表示跨层节点，例如 `459:458`。

宿主输入由外部连线驱动时，匹配沿连线进入父 graph：

- 来源节点有同名 widget 时，写入该 widget。
- 来源是 `Primitive*` 节点时，写入其唯一的 `value` widget，即使内层 widget 名称不同。
- 宿主输入在父层再次被提升时，继续向上查找，直到找到自由宿主或外部来源。
- 来源是计算节点且没有对应 widget 时，例如 `ResolutionSelector` 的宽高输出，参数匹配失败并报告来源节点。

因此，外部连线的参数写在外部节点上，子图自身持有的参数写在子图实例上，多层嵌套按实际持有值的位置写入。

匹配模块对外提供以下函数：

```text
resolveTemplate(graph, template) -> {resolved, errors}
resolveParams(graph, template)   -> {param: {nodeId, widgetName, value, widget} | null}
readParams(graph, template)      -> [{name, nodeType, nodeId, value, defaultSelected}]
checkParams(graph, template, params) -> failed[]
explainParams(graph, template, names) -> {param: reason}
applyParams(graph, template, params) -> {applied, failed}
captureParams(graph, template, names) -> [{name, widget, value}]
restoreParams(graph, snapshot)   -> void
```

`resolveTemplate()` 只构建一次图索引，并同时返回匹配结果和带 `code` 的错误对象。`explainParams()` 用 `formatMatchError()` 把错误码转成用户可读文本，保持现有调用方兼容。预览、读取当前参数和参数注入都共享同一套解析结果。扫描前用 `captureParams` 保存指定参数，结束后用 `restoreParams` 写回。`checkParams` 不修改 graph，扫描试算和逐组校验都调用这个函数。`explainParams` 只返回匹配失败的原因，应用预设和扫描预检用它显示用户可读的失败信息。

模板可以用 `include: "_loaders"` 引入 `workflows/_loaders.yaml` 中的共享参数。合并时模板自己的 `node_mapping` 覆盖同名定义，`include` 不写入加载结果。

## 模板分析

`web/template-analyzer.js` 从当前 graph 提出候选参数，用于判断一个 workflow 能否转成模板。分析只读，不写入 graph，也不保存文件。

识别规则：

- 提示词：从枢纽节点的 `positive`/`negative` 输入沿连接查找文本 widget；没有枢纽节点时，按标题中的 positive/negative 或“正向”“负向”回退。
- 采样：按节点类型和 widget 名称识别 `sampler`、`scheduler`、`steps`、`cfg`、`seed`、`denoise`。`FluxGuidance.guidance` 映射为 `cfg`，`RandomNoise.noise_seed` 映射为 `seed`。
- 宽高：`*Latent*` 节点上的 `width`/`height` 直接匹配；`ModelSampling*` 上的宽高用 `output_connection` 回溯到上游数值 widget。
- 模型加载器：识别 UNET、GGUF、NF4、Nunchaku、CLIP、双 CLIP、VAE 和 checkpoint，默认不勾选。

每个候选先转成模板 spec，再用 `resolveParams()` 和 `explainParams()` 验证。结果分为 `matched` 和 `error`。同类节点不唯一、同名标题不唯一、子图输入连接到无法直接写入的计算输出等情况都会转为 `error` 并显示原因，而不是静默选择第一个节点。子图输入连接到外部可写 widget 时，候选会报告外部节点的类型、ID 和当前值。

`web/template-analyzer-dialog.js` 是模板编辑器：

- 默认分析当前 workflow。
- “来源”选择已有模板时，用 `describeMapping()` 按原 `node_mapping` 重新校验当前 graph，并以 `原ID-copy` 作为新 ID、`原名 副本` 作为默认名称。
- 勾选的候选通过 `buildTemplate()` 生成完整模板。模型加载器由 `defaultSelected` 转为 `default_selected: false`；副本保留原 `synonyms`。
- “手动添加”按策略生成 spec：选择节点和 widget，自动选择唯一类或标题策略；输入槽和上游连接可以指定枢纽/目标输入。
- 保存调用 `POST /preset-manager/template`，写入 `user/preset-manager/workflows/`。成功后把模板 ID 写入 `app.graph.extra.preset_template`，并使模板列表缓存失效，预设和参数扫描重新加载时即可使用。
- 顶部只有一个 Presets 入口。Preset 对话框的“模板”和“参数扫描”按钮分别打开模板编辑器和扫描对话框，三个对话框共用同一份模板列表缓存。
- 内置模板 ID 不能直接覆盖；用户模板 ID 需要确认覆盖。

后端 `save_template()` 只写用户目录，并校验 ID、名称、`node_mapping` 和 `synonyms`。模板列表返回 `source` 字段，取值为 `bundled` 或 `user`。

## 预设

预设由元数据和 `params` 组成。参数名必须与模板的 `node_mapping` 一致。

存储分两层。内置预设位于 `presets/{template_id}/`，用户预设位于 `user/preset-manager/presets/{template_id}/`。同名文件以用户目录为准。预设 ID 取自文件名，保存时写入用户目录。

内置预设只写提示词、尺寸和采样参数，不写模型文件名。模型由当前 workflow 决定，换机器后内置预设仍可直接使用。

新建预设时，前端用 `readParams()` 读取当前 graph 的参数值。参数默认勾选，模板里声明 `default_selected: false` 的参数除外。共享模型加载器参数都带这个标记，避免预设绑定本机模型文件。编辑预设时，前端重新读取当前 graph，再把预设里有、当前 graph 匹配不到的参数合并为“未匹配”项并保持勾选。这类参数不会被编辑器裁剪，保存时原样写回；应用预设时由 `explainParams()` 报告失败原因。

模板与 workflow 的绑定是显式的。Presets 打开时只使用 `app.graph.extra.preset_template`；没有绑定或绑定已失效时显示“请选择模板”，不回退到列表第一个。用户选择模板后再浏览预设。扫描对话框沿用同一绑定，未绑定时同样等待用户选择。

编辑内置预设会以 `名称 副本` 新建用户预设，内置文件保持不变。用户预设编辑后覆盖自身，ID 不变。编辑器以表单为准；“导出表单”把当前内容写入 JSON 文本框，“导入到表单”把 JSON 写回表单。导入时新增的参数会作为“自定义”项，取消勾选的参数会保留但不会被保存。JSON 中的 `id` 和 `workflow_template` 不生效，保存时始终使用对话框当前的 ID 和模板。

预设列表返回 `source` 字段，取值为 `bundled` 或 `user`。界面只对用户预设显示删除按钮。删除接口只删除用户目录的文件，内置预设无法删除。

## 扫描

扫描配置由 1 个或多个轴组成。参数轴直接给参数取值，预设轴展开为一个预设的全部参数。后端用笛卡尔积展开组合，`axes[0]` 为最外层。后应用的轴覆盖先应用的轴。

每组提交前，`sweep-trace.js` 把带 `filename_prefix` 的 widget 改成 `原名_001_组合标签`，让输出文件能对应到组合。扫描结束后恢复原名。标签中的路径分隔符、控制字符和 `%` 替换为下划线。

前端执行流程：

0. 使用 workflow 绑定的模板；未绑定时等待用户显式选择，不自动选择第一个模板。
1. 用 `checkParams()` 检查第一个组合能否匹配节点和 widget。
2. 用户确认提交次数。
3. 保存快照。快照覆盖所有组合用到的参数。
4. `sweep-runner.js` 逐组检查、应用、提交队列。
5. 运行结束后恢复快照。

`runSweep()` 接收检查、应用、提交、进度和取消回调，不依赖 DOM。取消只停止后续提交，已进入队列的任务继续执行。

扫描不校验枚举值是否在 widget 的可选项内。

## 模板关联

用户点击 “Apply Preset” 后，前端把模板 ID 写入 `app.graph.extra.preset_template`。这个字段随 workflow 保存。未保存 workflow 时，关联不会持久化。下次打开预设对话框或扫描对话框时，前端读取该字段，自动选择模板。

关联不使用独立映射文件，也不依赖 workflow 名称。

## 存储与安全

`storage.py` 统一处理存储：

- `is_safe_id()` 和 `require_safe_id()`：ID 不能包含 `/`、`\`、`:`、空值、`.` 或 `..`。
- `save_yaml()`：先写临时文件，再用 `os.replace()` 替换目标文件。
- `scan_yaml()`：按文件名读取目录下的 YAML。
- `user_dir()`：返回 `user/preset-manager/` 下的目录。

业务模块在拼接路径前调用 `require_safe_id()`。路由用 `_match_ids()` 和 `_body_ids()` 检查入参，非法 ID 返回 400。

## 测试面

- `tests/js/graph-index.test.mjs` 覆盖图索引、跨层节点路径、`resolveTemplate` 错误码和同义词。
- `tests/js/matcher.test.mjs` 覆盖 4 种策略、同义词、检查、应用、快照和读取。
- `tests/js/templates.test.mjs` 用快照模板和真实结构图验证每个参数的匹配结果。
- `tests/js/template-analyzer.test.mjs` 用 8 个代表性 workflow 和子图 fixture 验证候选识别、歧义反馈和只读行为。
- `tests/js/sweep-runner.test.mjs` 覆盖执行顺序、取消和中途失败。
- `tests/js/sweep-values.test.mjs` 覆盖轴值解析和总数计算。
- `tests/js/sweep-trace.test.mjs` 覆盖输出文件名标记、清理和恢复。
- `tests/test_storage.py` 覆盖 ID 校验和原子读写。
- `tests/test_templates_snapshot.py` 保证模板快照与 `workflows/` 一致。
- `tests/test_preset_manager.py`、`tests/test_sweep_manager.py` 覆盖存储行为。
- `tests/e2e/` 覆盖 HTTP 接口、模板保存、分析编辑器保存/复制和界面流程。

## 已知限制

- 含多个 KSampler 的 workflow 无法用 `unique_class` 或 `input_slot` 匹配采样参数。
- 编辑预设会丢失当前 graph 匹配不到的已存参数。
- 扫描不校验枚举值。
- 没有 `filename_prefix` 的输出节点无法写入组合标记。
- 脚本无法通过 HTTP 应用预设。应用只在前端完成。
- 模板分析只覆盖内置识别规则。自定义采样结构如果没有 `positive`/`negative` 输入，不会提出提示词参数。

## 后续方向

- 支持删除或重命名用户模板。
- 为计算节点的输出提供可配置的映射规则。
- 支持按标题或序号选择多个同类型节点。
- 编辑预设时保留当前 graph 匹配不到的已存参数。
- 用 `graphToPrompt()` 预构造 prompt，避免扫描期间修改 graph。
