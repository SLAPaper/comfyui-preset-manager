# ComfyUI Preset Manager

ComfyUI 的配置预设与参数扫描插件，用于底模评测。

## 功能

- 保存采样配置为预设，应用到当前 workflow。
- 支持 6 个 workflow 模板：Anima、Flux、Qwen Image 2.1、Qwen Image Edit、Qwen Image 文生图、SDXL。
- 支持节点位于子图内的工作流。
- 按一个或多个轴做参数扫描，逐组提交到队列。
- 不绑定输出节点，输出方式由 workflow 决定。
- 配置保存为 YAML，可手动编辑。

## 安装

1. 把仓库放到 `ComfyUI/custom_nodes/comfyui-preset-manager`。
2. 安装依赖：`pip install pyyaml`。
3. 重启 ComfyUI。

## 使用

### 应用预设

1. 打开 workflow。
2. 点击顶部菜单栏的 “Presets”。
3. 选择模板和预设。
4. 点击 “Apply Preset”。

应用后，插件把模板 ID 写入当前 workflow 的 `extra.preset_template`。保存 workflow 后，下次打开对话框时会自动选择该模板。旧版本的 `mapping.yaml` 不再读取。

### 新建和编辑预设

1. 点击 “Presets”，选择模板。
2. 点击 “+ 新建”。
3. 勾选要保存的参数，填写名称，点击 “保存”。
4. 编辑用户预设时，点击预设右侧的 “编辑”。编辑内置预设时按钮为 “复制”，保存后生成用户预设，内置预设保持不变。
5. 删除用户预设时，点击预设右侧的 “删除”。内置预设不显示删除按钮。

说明：新建预设时，插件读取当前 workflow 的 widget 值。编辑器提供表单模式和代码模式，切换模式会同步当前内容。模型加载器参数默认不勾选，预设不会绑定本机模型文件。

### 运行参数扫描

1. 打开 workflow。
2. 点击顶部菜单栏的 “Sweeps”。
3. 选择模板。
4. 添加参数轴或预设轴，填写逗号分隔的值。
5. 点击 “运行”，确认提交次数。

说明：扫描轴按列表顺序应用，第一条为最外层循环。取消只停止继续提交，已提交的任务仍会执行。扫描结束后，插件恢复扫描前的 widget 值。

运行时默认勾选「在输出文件名中记录组合」。带 `filename_prefix` 的输出节点会写成 `原名_001_组合标签`，扫描结束后恢复原名。

## 模板

| ID | 名称 | 适用 workflow |
|---|---|---|
| `anima-txt2img` | Anima 文生图 | UNETLoader、CLIPLoader、VAELoader |
| `flux-txt2img` | Flux 文生图 | BasicScheduler、KSamplerSelect、FluxGuidance |
| `qwen-image-21` | Qwen Image 2.1 文生图 | 子图内的 KSampler，尺寸由顶层 ResolutionSelector 控制 |
| `qwen-image-edit` | Qwen Image Edit | 文生图和图生图，尺寸经 latent 输入追溯 |
| `qwen-image-txt2img` | Qwen Image 文生图 | EmptySD3LatentImage |
| `sdxl-txt2img` | SDXL 文生图 | CheckpointLoaderSimple、EmptyLatentImage |

模板用 `include: "_loaders"` 引入 `workflows/_loaders.yaml` 中的共享模型加载器参数。模板自己的 `node_mapping` 覆盖同名共享参数。以下划线开头的文件是共享片段，不作为模板出现在列表和详情接口中。

## 匹配策略

模板通过 `match_strategy` 定位节点和 widget。共有 4 种策略。

| 策略 | 定位方式 | 适用场景 |
|---|---|---|
| `unique_class` | 按 `class_type` 唯一匹配 | 场景中只有一个该类型节点 |
| `title_keyword` | 按 `class_type` 和标题关键词匹配 | 区分多个同类型节点，例如正负提示词 |
| `output_connection` | 从目标节点的输入回溯源节点 | 参数位于上游节点，例如 Flux 的宽高 |
| `input_slot` | 从枢纽节点的命名输入回溯源节点 | 提示词节点没有标题，例如 Anima |

`synonyms` 字段把派生节点类型映射到标准类型，例如把 `KSamplerAdvanced` 当作 `KSampler`。

匹配会进入子图内部。内层 widget 提升为子图输入时，值保存在子图实例上，插件写入实例上的 widget；被外部连线占用的子图输入不参与写入。

## 文件位置

| 内容 | 内置目录 | 用户目录 |
|---|---|---|
| 模板 | `workflows/` | `user/preset-manager/workflows/` |
| 预设 | `presets/{template_id}/` | `user/preset-manager/presets/{template_id}/` |
| 扫描配置 | 无 | `user/preset-manager/sweeps/{template_id}/` |

用户目录的同名文件覆盖内置文件。删除预设时，插件只删除用户目录里的文件。内置预设不能删除。

## API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/preset-manager/workflows` | 获取模板列表 |
| GET | `/preset-manager/template/{template_id}` | 获取模板详情 |
| GET | `/preset-manager/presets/{template_id}` | 获取预设列表 |
| GET | `/preset-manager/preset/{template_id}/{preset_id}` | 获取预设详情 |
| POST | `/preset-manager/preset` | 保存预设 |
| DELETE | `/preset-manager/preset/{template_id}/{preset_id}` | 删除预设 |
| GET | `/preset-manager/sweeps/{template_id}` | 获取扫描配置列表 |
| GET | `/preset-manager/sweep/{template_id}/{sweep_id}` | 获取扫描配置详情 |
| POST | `/preset-manager/sweep` | 保存扫描配置 |
| DELETE | `/preset-manager/sweep/{template_id}/{sweep_id}` | 删除扫描配置 |
| POST | `/preset-manager/sweep/expand` | 展开扫描组合 |

路径参数只能用文件名，不能包含路径分隔符。

## 开发

单元测试：

```bash
python -m pytest tests -v --ignore=tests/e2e
node --test tests/js
```

E2E 测试见 [docs/TESTING.md](docs/TESTING.md)。设计说明见 [docs/DESIGN.md](docs/DESIGN.md)，扫描格式见 [docs/SWEEP-SPEC.md](docs/SWEEP-SPEC.md)。

## 已知限制

- `unique_class` 和 `input_slot` 要求目标节点唯一。hires fix 等含多个 KSampler 的 workflow 会匹配失败。
- 编辑预设时，当前 workflow 匹配不到的已存参数会被丢弃。
