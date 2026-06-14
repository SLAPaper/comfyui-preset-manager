# ComfyUI Preset Manager

配置预设管理器 - 用于底模评测的采样配置复用工具

## 功能特性

- 保存完整的采样配置（提示词、宽高、采样方法、步数、CFG 等）
- 一键注入到当前 workflow 的对应节点
- 支持多个 workflow 模板（SDXL、Qwen Image 等）
- 不绑定任何特定输出节点
- YAML 格式配置，便于手动编辑

## 安装

```bash
cd ComfyUI/custom_nodes
git clone <repository-url> comfyui-preset-manager
```

安装依赖：

```bash
pip install pyyaml
```

重启 ComfyUI。

## 使用方法

### 当前版本（Phase 1a - API）

当前版本提供后端 API，可通过 curl 或 HTTP 客户端测试。

#### 1. 获取可用的 workflow 模板

```bash
curl http://127.0.0.1:8188/preset-manager/workflows
```

返回示例：
```json
[
  {
    "id": "sdxl-txt2img",
    "name": "SDXL Text to Image",
    "description": "SDXL 基础文生图 workflow"
  }
]
```

#### 2. 获取指定模板的预设列表

```bash
curl http://127.0.0.1:8188/preset-manager/presets/sdxl-txt2img
```

返回示例：
```json
[
  {
    "id": "_default",
    "name": "默认配置",
    "description": "SDXL 默认采样配置"
  }
]
```

#### 3. 获取预设详情

```bash
curl http://127.0.0.1:8188/preset-manager/preset/sdxl-txt2img/_default
```

返回示例：
```json
{
  "id": "_default",
  "name": "默认配置",
  "description": "SDXL 默认采样配置",
  "workflow_template": "sdxl-txt2img",
  "params": {
    "positive_prompt": "masterpiece, best quality, ultra detailed",
    "negative_prompt": "worst quality, low quality, blurry",
    "width": 1024,
    "height": 1024,
    "steps": 20,
    "cfg": 7.0,
    "sampler": "euler_ancestral",
    "scheduler": "normal"
  }
}
```

#### 4. 保存新预设

```bash
curl -X POST http://127.0.0.1:8188/preset-manager/preset \
  -H "Content-Type: application/json" \
  -d '{
    "id": "high-quality",
    "name": "高质量出图",
    "description": "用于最终输出的高质量配置",
    "workflow_template": "sdxl-txt2img",
    "params": {
      "positive_prompt": "masterpiece, best quality, ultra detailed, 8k",
      "negative_prompt": "worst quality, low quality, blurry, deformed",
      "width": 1024,
      "height": 1024,
      "steps": 30,
      "cfg": 7.0,
      "sampler": "euler_ancestral",
      "scheduler": "normal"
    }
  }'
```

#### 5. 删除预设

```bash
curl -X DELETE http://127.0.0.1:8188/preset-manager/preset/sdxl-txt2img/high-quality
```

#### 6. 应用预设到 workflow

```bash
curl -X POST http://127.0.0.1:8188/preset-manager/apply \
  -H "Content-Type: application/json" \
  -d '{
    "workflow": "sdxl-txt2img",
    "preset": "_default",
    "current_workflow": { ... }
  }'
```

返回修改后的 workflow JSON。

---

## 配置文件

### Workflow 模板

定义参数与 workflow 节点的映射关系。

文件位置：`comfyui-preset-manager/workflows/*.yaml`

示例（`sdxl-txt2img.yaml`）：

```yaml
name: "SDXL Text to Image"
description: "SDXL 基础文生图 workflow"
version: "1.0"

node_mapping:
  positive_prompt:
    match_strategy: "title_keyword"
    class_type: "CLIPTextEncode"
    title_keywords: ["positive", "正向"]
    widget: "text"

  steps:
    match_strategy: "unique_class"
    class_type: "KSampler"
    widget: "steps"

  width:
    match_strategy: "unique_class"
    class_type: "EmptyLatentImage"
    widget: "width"

synonyms:
  KSamplerAdvanced: "KSampler"
```

**匹配策略**：

| 策略 | 说明 | 适用场景 |
|------|------|----------|
| `unique_class` | 唯一 class_type | KSampler、EmptyLatentImage |
| `title_keyword` | class_type + 标题关键词 | CLIPTextEncode（区分 positive/negative） |

### 预设文件

保存具体的参数值。

文件位置：`comfyui-preset-manager/presets/{template_id}/*.yaml`

示例（`presets/sdxl-txt2img/_default.yaml`）：

```yaml
name: "默认配置"
description: "SDXL 默认采样配置"
workflow_template: "sdxl-txt2img"

params:
  positive_prompt: "masterpiece, best quality, ultra detailed"
  negative_prompt: "worst quality, low quality, blurry"
  width: 1024
  height: 1024
  steps: 20
  cfg: 7.0
  sampler: "euler_ancestral"
  scheduler: "normal"
```

---

## 目录结构

```
comfyui-preset-manager/
├── __init__.py              # 插件入口
├── workflow_parser.py       # 模板解析
├── node_matcher.py          # 节点匹配
├── preset_manager.py        # 预设管理
├── workflows/               # 模板文件（随插件分发）
│   └── sdxl-txt2img.yaml
├── presets/                 # 默认预设（随插件分发）
│   └── sdxl-txt2img/
│       └── _default.yaml
├── web/                     # 前端 UI（Phase 1b）
├── tests/                   # 测试文件
└── docs/                    # 设计文档
```

用户数据目录：

```
user/preset-manager/
├── workflows/               # 用户自定义模板
├── presets/                 # 用户创建的预设
│   └── sdxl-txt2img/
│       ├── high-quality.yaml
│       └── fast-preview.yaml
└── media/                   # 多模态资源（Phase 3）
```

---

## 开发

### 运行测试

```bash
cd custom_nodes/comfyui-preset-manager
python -m pytest tests/ -v -c tests/conftest.py
```

### API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/preset-manager/workflows` | 获取所有模板 |
| GET | `/preset-manager/presets/{template_id}` | 获取预设列表 |
| GET | `/preset-manager/preset/{template_id}/{preset_id}` | 获取预设详情 |
| POST | `/preset-manager/preset` | 保存预设 |
| DELETE | `/preset-manager/preset/{template_id}/{preset_id}` | 删除预设 |
| POST | `/preset-manager/apply` | 应用预设 |

---

## 详细设计

参见 [docs/DESIGN.md](docs/DESIGN.md)
