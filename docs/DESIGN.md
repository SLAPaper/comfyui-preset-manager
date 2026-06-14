# ComfyUI 配置预设管理器 - 设计文档

## 项目概述

### 背景需求

在使用 ComfyUI 进行底模评测时，需要频繁切换不同的采样配置（提示词、宽高、采样方法、步数、CFG 等）。现有方案（如 Lumi Batcher）面向批量处理场景，与特定输出节点绑定，不适合以"配置复用"为核心的评测工作流。

### 核心目标

- 保存完整的采样配置作为长期资产
- 一键注入到当前 workflow 的对应节点
- 支持多个 workflow 模板（SDXL、Qwen Image 等）
- 不绑定任何特定输出节点

### 参考项目

- [Zyin055/Config-Presets](https://github.com/Zyin055/Config-Presets) - A1111 配置预设插件
- ComfyUI-Custom-Scripts - Preset Text 节点

---

## 架构设计

### 目录结构

```
E:\workspace\ComfyUI\
├── user/                                        # 已在 .gitignore
│   └── preset-manager/                          # 插件数据目录
│       ├── config.yaml                          # 全局配置（可选）
│       │
│       ├── workflows/                           # Workflow 模板定义
│       │   ├── sdxl-txt2img.yaml               # SDXL 文生图
│       │   ├── qwen-image.yaml                  # Qwen Image
│       │   ├── qwen-image-edit.yaml             # Qwen Image Edit
│       │   └── flux-dev.yaml                    # Flux Dev
│       │
│       ├── presets/                             # 预设文件
│       │   ├── sdxl-txt2img/                   # 按 workflow 模板分组
│       │   │   ├── _default.yaml               # 默认配置
│       │   │   ├── high-quality.yaml
│       │   │   ├── fast-preview.yaml
│       │   │   └── anime-style.yaml
│       │   ├── qwen-image/
│       │   └── flux-dev/
│       │
│       └── media/                               # 多模态资源
│           ├── images/
│           ├── videos/
│           └── audio/
│
└── custom_nodes/
    └── comfyui-preset-manager/                  # 插件目录
        ├── __init__.py
        ├── preset_manager.py                    # 核心逻辑
        ├── node_matcher.py                      # 节点匹配算法
        ├── web/
        │   └── js/
        │       └── presetManager.js             # 前端 UI
        └── pyproject.toml
```

### 设计决策

| 决策 | 理由 |
|------|------|
| 基于 class_type 匹配 | ComfyUI 的稳定标识，不受节点 ID 变化影响 |
| 多策略匹配 | 处理多个同类型节点的情况 |
| YAML 格式 | 人类可读，便于手动编辑，支持注释 |
| user/preset-manager/ 目录 | 已在 .gitignore，避免版本冲突 |
| Workflow 模板分离 | 同一预设可适配多个 workflow，支持继承 |
| 同义词系统 | 处理节点版本兼容 |

---

## Workflow 模板格式

```yaml
# user/preset-manager/workflows/sdxl-txt2img.yaml
name: "SDXL Text to Image"
description: "SDXL 基础文生图 workflow"
version: "1.0"

# 节点匹配规则
node_mapping:
  positive_prompt:
    match_strategy: "title_keyword"
    class_type: "CLIPTextEncode"
    title_keywords: ["positive", "正向"]
    widget: "text"
    
  negative_prompt:
    match_strategy: "title_keyword"
    class_type: "CLIPTextEncode"
    title_keywords: ["negative", "负向"]
    widget: "text"
    
  sampler:
    match_strategy: "unique_class"
    class_type: "KSampler"
    widget: "sampler_name"
    
  scheduler:
    match_strategy: "unique_class"
    class_type: "KSampler"
    widget: "scheduler"
    
  steps:
    match_strategy: "unique_class"
    class_type: "KSampler"
    widget: "steps"
    
  cfg:
    match_strategy: "unique_class"
    class_type: "KSampler"
    widget: "cfg"
    
  width:
    match_strategy: "unique_class"
    class_type: "EmptyLatentImage"
    widget: "width"
    
  height:
    match_strategy: "unique_class"
    class_type: "EmptyLatentImage"
    widget: "height"
    
  seed:
    match_strategy: "unique_class"
    class_type: "KSampler"
    widget: "seed"

  # 扩展字段（可选）
  lora_strength:
    match_strategy: "title_keyword"
    class_type: "LoraLoader"
    title_keywords: ["lora", "LoRA"]
    widget: "strength_model"
    optional: true

# 同义词映射
synonyms:
  KSamplerAdvanced: "KSampler"
  KSamplerEfficient: "KSampler"
```

### 匹配策略

| 策略 | 说明 | 适用场景 |
|------|------|---------|
| `unique_class` | 唯一 class_type，只有一个同类型节点时直接匹配 | KSampler、EmptyLatentImage |
| `title_keyword` | class_type + 标题关键词匹配 | CLIPTextEncode（positive/negative） |
| `output_connection` | 通过输出连接关系判断（待实现） | 复杂 workflow |

---

## 预设文件格式

```yaml
# user/preset-manager/presets/sdxl-txt2img/high-quality.yaml
name: "高质量出图"
description: "用于最终输出的高质量配置"
workflow_template: "sdxl-txt2img"

# 参数值
params:
  positive_prompt: "masterpiece, best quality, ultra detailed, 8k, photorealistic"
  negative_prompt: "worst quality, low quality, blurry, deformed"
  width: 1024
  height: 1024
  steps: 30
  cfg: 7.0
  sampler_name: "euler_ancestral"
  scheduler: "normal"
  seed: -1

# 扩展参数（可选）
custom_params:
  lora_strength: 0.8
  denoise: 1.0

# 多模态资源（可选）
media:
  reference_image: "images/ref_001.png"
  style_image: "images/style_anime.jpg"
```

---

## 节点匹配算法

```javascript
class NodeMatcher {
    constructor(workflowTemplate) {
        this.template = workflowTemplate;
        this.synonyms = workflowTemplate.synonyms || {};
    }
    
    matchAll(workflow) {
        const result = {};
        
        for (const [paramName, mapping] of Object.entries(this.template.node_mapping)) {
            const match = this.matchNode(workflow, mapping);
            if (match) {
                result[paramName] = match;
            } else if (!mapping.optional) {
                console.warn(`[PresetManager] 必需参数 "${paramName}" 未找到匹配节点`);
            }
        }
        
        return result;
    }
    
    matchNode(workflow, mapping) {
        const candidates = this.findCandidates(workflow, mapping.class_type);
        
        if (candidates.length === 0) {
            return null;
        }
        
        // 策略 1: 唯一 class_type
        if (mapping.match_strategy === "unique_class" && candidates.length === 1) {
            return {
                nodeId: candidates[0].id,
                widgetName: mapping.widget,
                currentValue: candidates[0].node.inputs[mapping.widget]
            };
        }
        
        // 策略 2: 标题关键词匹配
        if (mapping.match_strategy === "title_keyword") {
            for (const candidate of candidates) {
                const title = candidate.node._meta?.title || "";
                const titleLower = title.toLowerCase();
                
                for (const keyword of mapping.title_keywords) {
                    if (titleLower.includes(keyword.toLowerCase())) {
                        return {
                            nodeId: candidate.id,
                            widgetName: mapping.widget,
                            currentValue: candidate.node.inputs[mapping.widget]
                        };
                    }
                }
            }
        }
        
        return null;
    }
    
    findCandidates(workflow, classType) {
        const candidates = [];
        const normalizedType = this.synonyms[classType] || classType;
        
        for (const [nodeId, node] of Object.entries(workflow)) {
            const nodeType = node.class_type;
            const normalizedNodeType = this.synonyms[nodeType] || nodeType;
            
            if (normalizedNodeType === normalizedType) {
                candidates.push({ id: nodeId, node });
            }
        }
        
        return candidates;
    }
}
```

---

## 前端 UI 设计

### 顶栏按钮

- 点击打开配置预设面板（弹窗或侧边栏）

### 面板布局

```
┌─────────────────────────────────────────────────────────────┐
│  配置预设管理器                                    [设置] [X] │
├─────────────────────────────────────────────────────────────┤
│  Workflow 模板: [SDXL Text to Image ▼]         [刷新] [管理] │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  预设列表                                            │   │
│  │  ─────────────────────────────────────────────────  │   │
│  │  ⭐ 高质量出图         [应用] [编辑] [删除]         │   │
│  │     1024x1024, 30步, CFG 7.0                        │   │
│  │  ─────────────────────────────────────────────────  │   │
│  │  🚀 快速预览           [应用] [编辑] [删除]         │   │
│  │     512x512, 15步, CFG 5.0                          │   │
│  │  ─────────────────────────────────────────────────  │   │
│  │  🔍 搜索: [________________]                        │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  [➕ 新建预设]  [📥 导入]  [📤 导出]                        │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│  当前配置预览:                                               │
│  正向提示词: masterpiece, best quality...                   │
│  负向提示词: worst quality, low quality...                   │
│  尺寸: 1024x1024  步数: 30  CFG: 7.0                       │
│  采样器: euler_ancestral  调度器: normal                     │
└─────────────────────────────────────────────────────────────┘
```

---

## API 设计

### 后端端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/preset_manager/templates` | 获取所有 workflow 模板 |
| GET | `/preset_manager/presets/{template_id}` | 获取指定模板的所有预设 |
| GET | `/preset_manager/preset/{template_id}/{preset_id}` | 获取指定预设详情 |
| POST | `/preset_manager/preset` | 保存新预设 |
| PUT | `/preset_manager/preset/{template_id}/{preset_id}` | 更新预设 |
| DELETE | `/preset_manager/preset/{template_id}/{preset_id}` | 删除预设 |
| POST | `/preset_manager/apply` | 应用预设到当前 workflow |
| POST | `/preset_manager/scan` | 扫描当前 workflow 生成模板 |

---

## 实现阶段

### Phase 1: 核心功能（最小可用版本）

1. 创建插件基础结构
2. 实现 workflow 模板解析
3. 实现节点匹配算法（unique_class + title_keyword）
4. 实现预设文件加载/保存
5. 实现参数注入功能
6. 基础顶栏 UI

### Phase 2: UI 完善

1. 预设编辑器对话框
2. 配置预览面板
3. 选择性保存字段
4. 预设搜索和过滤

### Phase 3: 高级功能（可选）

1. 多模态资源支持
2. 导入/导出功能
3. 预设继承和覆盖
4. 快捷键支持
5. 预设历史记录
6. A1111 格式导入

---

## 待讨论问题

### Phase 1 相关

1. **插件初始化方式**
   - 如何发现和加载 workflow 模板？
   - 如何处理模板文件不存在的情况？

2. **节点匹配的容错机制**
   - 匹配失败时如何处理？
   - 是否需要提供手动绑定功能？

3. **参数注入的时机**
   - 用户点击"应用"后立即注入？
   - 还是需要确认对话框？

4. **预设保存的流程**
   - 如何让用户选择要保存的字段？
   - 如何处理当前 workflow 与模板不匹配的情况？

### Phase 2 相关

5. **预设编辑器的设计**
   - 表单式还是代码编辑式？
   - 是否支持实时预览？

6. **UI 交互细节**
   - 顶栏按钮的样式和位置？
   - 面板的打开/关闭方式？

### Phase 3 相关

7. **多模态资源的处理**
   - 如何引用和加载资源？
   - 是否需要资源管理界面？

8. **导入/导出的格式**
   - 单个预设还是批量？
   - 是否需要压缩包格式？

---

## Iteration 2: 参数扫描功能（Parameter Sweep）

### 背景

在底模评测场景中，经常需要固定其他参数，只扫描单个参数（如 CFG Scale）来观察效果差异。A1111 的 XYZ Grid + sd_grid_add_image_number 插件提供了类似功能，但 ComfyUI 缺乏原生支持。

### 需求分析

| 需求 | 优先级 | 说明 |
|------|--------|------|
| 单参数扫描 | P0 | 固定其他参数，扫描单个参数（如 cfg=1.5,3,5.5,8,11.5） |
| 按顺序产出 | P0 | 不需要拼接 grid，逐个输出结果图片 |
| 保留 ComfyUI 输出结构 | P0 | 不绑定输出节点，用户自行决定输出方式 |
| 叠加信息到图片 | P1 | 可选功能，在图片上叠加参数信息 |
| 多参数组合扫描 | P2 | 未来扩展，支持 cfg × steps 等组合 |

### 设计决策

| 决策 | 理由 |
|------|------|
| 作为 Preset Manager 子功能 | 与预设配合使用，复用节点匹配逻辑 |
| 先支持单参数扫描 | 满足主要使用场景（固定其他参数扫 CFG） |
| 保留 ComfyUI 输出结构 | 不绑定输出节点，用户可自行添加 grid/标注节点 |
| 叠加信息可选且位置可选 | 灵活适配不同评测需求 |
| 基于 API 脚本实现 | ComfyUI 不原生支持参数迭代循环 |

### 功能流程

```
┌─────────────────────────────────────────────────────────────────┐
│  参数扫描流程                                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. 用户选择基础预设                                             │
│     └─→ 复用 Preset Manager 的预设                              │
│                                                                 │
│  2. 配置扫描参数                                                 │
│     ├─→ 选择要扫描的参数（如 cfg）                               │
│     ├─→ 输入扫描值（如 1.5,3,5.5,8,11.5）                       │
│     └─→ 可选：配置叠加信息                                       │
│                                                                 │
│  3. 生成扫描脚本                                                 │
│     ├─→ 基于当前 workflow + 基础预设                              │
│     ├─→ 替换扫描参数为变量                                       │
│     └─→ 输出 Python 脚本到 user/preset-manager/scripts/         │
│                                                                 │
│  4. 执行扫描                                                     │
│     ├─→ 方式 A: 在 ComfyUI 外部运行脚本                          │
│     └─→ 方式 B: 通过 API 触发执行（未来）                         │
│                                                                 │
│  5. 输出结果                                                     │
│     ├─→ 保留 ComfyUI 默认输出结构                                │
│     ├─→ 可选：在图片上叠加参数信息                                │
│     └─→ 生成扫描摘要（JSON）                                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 扫描配置格式

```yaml
# user/preset-manager/sweeps/cfg-sweep.yaml
name: "CFG Scale 扫参测试"
description: "固定其他参数，扫描 CFG Scale"

# 基础预设
base_preset: "high-quality"
base_workflow: "sdxl-txt2img"

# 扫描参数（单参数扫描）
sweep_param:
  name: "cfg"                        # 参数名（对应 workflow 模板中的 param name）
  values: [1.5, 3.0, 5.5, 8.0, 11.5]  # 扫描值列表
  # 或者使用范围定义
  # range:
  #   start: 1.0
  #   end: 12.0
  #   step: 1.0

# 输出选项
output:
  # 保留 ComfyUI 输出结构，不额外处理
  keep_comfyui_output: true
  
  # 可选：叠加参数信息到图片
  annotate:
    enabled: false                   # 是否启用
    position: "top-left"             # 位置：top-left, top-right, bottom-left, bottom-right, bottom-center
    format: "[{index}] {param}: {value}"  # 格式模板
    font_size: 24
    font_color: "white"
    background_color: "black"
    background_opacity: 128

  # 输出目录（可选，默认使用 ComfyUI 输出目录）
  # output_dir: "E:/workspace/ComfyUI/output/sweeps/"
```

### 目录结构更新

```
E:\workspace\ComfyUI\
├── user/
│   └── preset-manager/
│       ├── workflows/               # Workflow 模板
│       ├── presets/                 # 预设文件
│       ├── sweeps/                  # 扫描配置（新增）
│       │   ├── cfg-sweep.yaml
│       │   ├── steps-sweep.yaml
│       │   └── sampler-sweep.yaml
│       ├── scripts/                 # 生成的扫描脚本（新增）
│       │   ├── cfg-sweep_20260614_120000.py
│       │   └── ...
│       └── media/
```

### 后端 API 扩展

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/preset_manager/sweeps` | 获取所有扫描配置 |
| GET | `/preset_manager/sweep/{sweep_id}` | 获取扫描配置详情 |
| POST | `/preset_manager/sweep` | 保存扫描配置 |
| POST | `/preset_manager/sweep/generate` | 生成扫描脚本 |
| POST | `/preset_manager/sweep/execute` | 执行扫描（可选，通过 API 触发） |

### 前端 UI 扩展

```
┌─────────────────────────────────────────────────────────────────┐
│  配置预设管理器                                        [X]       │
├─────────────────────────────────────────────────────────────────┤
│  [预设管理]  [参数扫描]  [设置]                                   │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  参数扫描                                                        │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  基础预设: [高质量出图 ▼]                                        │
│                                                                 │
│  扫描参数: [cfg ▼]                                               │
│  扫描值:   [1.5, 3, 5.5, 8, 11.5]                               │
│                                                                 │
│  ☑ 叠加参数信息到图片                                            │
│  位置: [左上角 ▼]                                                │
│  格式: [{index}] {param}: {value}                                │
│                                                                 │
│  [生成脚本]  [执行扫描]  [保存配置]                               │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│  已保存的扫描配置:                                               │
│  ├─ CFG Scale 扫参测试          [加载] [删除]                    │
│  ├─ Steps 扫参测试              [加载] [删除]                    │
│  └─ Sampler 扫参测试            [加载] [删除]                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 扫描脚本生成逻辑

```python
# 生成的脚本结构示例

#!/usr/bin/env python3
"""
Parameter Sweep Script
Generated by ComfyUI Preset Manager
Sweep: CFG Scale 扫参测试
Base Preset: high-quality
Generated: 2026-06-14 12:00:00
"""

import json
import uuid
import urllib.request
import time
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from io import BytesIO

# ============ 配置 ============

SERVER_ADDRESS = "127.0.0.1:8188"

# 扫描参数
SWEEP_PARAM = "cfg"
SWEEP_VALUES = [1.5, 3.0, 5.5, 8.0, 11.5]

# 基础 workflow（从当前 workflow 导出，已应用基础预设）
BASE_WORKFLOW = {
    # ... workflow JSON ...
}

# 输出选项
ANNOTATE_ENABLED = False
ANNOTATE_POSITION = "top-left"

# ============ 核心函数 ============

def queue_prompt(prompt):
    """提交 workflow"""
    # ... 实现 ...

def wait_for_completion(prompt_id):
    """等待执行完成"""
    # ... 实现 ...

def annotate_image(image_data, text, position):
    """叠加参数信息"""
    # ... 实现 ...

# ============ 主逻辑 ============

def run_sweep():
    """执行参数扫描"""
    for i, value in enumerate(SWEEP_VALUES):
        print(f"[{i+1}/{len(SWEEP_VALUES)}] {SWEEP_PARAM}={value}")
        
        # 深拷贝 workflow
        wf = json.loads(json.dumps(BASE_WORKFLOW))
        
        # 修改扫描参数
        # 需要根据节点匹配结果找到正确的节点 ID
        wf["3"]["inputs"][SWEEP_PARAM] = value  # 示例，实际需要动态查找
        
        # 提交执行
        result = queue_prompt(wf)
        history = wait_for_completion(result["prompt_id"])
        
        # 处理输出（保留 ComfyUI 默认输出）
        # 如果启用了叠加信息，则额外保存一份带标注的图片
        if ANNOTATE_ENABLED:
            # ... 叠加逻辑 ...
            pass

if __name__ == "__main__":
    run_sweep()
```

### 叠加信息实现

```python
# 叠加信息位置定义
ANNOTATE_POSITIONS = {
    "top-left": {"x": 10, "y": 10, "anchor": "la"},
    "top-right": {"x": "width-10", "y": 10, "anchor": "ra"},
    "bottom-left": {"x": 10, "y": "height-10", "anchor": "ld"},
    "bottom-right": {"x": "width-10", "y": "height-10", "anchor": "rd"},
    "bottom-center": {"x": "width/2", "y": "height-10", "anchor": "md"},
}

def annotate_image(image_data, params, index, position="top-left"):
    """
    给图片叠加参数信息
    
    Args:
        image_data: 图片二进制数据
        params: 参数字典 {"cfg": 7.0, "steps": 30}
        index: 当前扫描序号
        position: 位置（top-left, top-right, bottom-left, bottom-right, bottom-center）
    """
    image = Image.open(BytesIO(image_data))
    draw = ImageDraw.Draw(image)
    
    # 加载字体
    try:
        font = ImageFont.truetype("arial.ttf", 24)
    except:
        font = ImageFont.load_default()
    
    # 构建标注文本
    lines = [f"[{index}]"]
    for key, value in params.items():
        lines.append(f"{key}: {value}")
    text = "\n".join(lines)
    
    # 计算位置
    pos_config = ANNOTATE_POSITIONS.get(position, ANNOTATE_POSITIONS["top-left"])
    # ... 位置计算逻辑 ...
    
    # 绘制背景和文字
    # ...
    
    return image
```

### 实现阶段

#### Iteration 2.1: 核心扫描功能

1. 扫描配置文件格式定义
2. 扫描脚本生成逻辑
3. 基础扫描执行功能
4. 扫描结果摘要生成

#### Iteration 2.2: 叠加信息功能

1. 叠加信息配置选项
2. 多位置支持
3. 格式模板解析
4. 字体和样式配置

#### Iteration 2.3: UI 集成

1. 参数扫描面板
2. 扫描配置管理
3. 脚本生成和执行触发
4. 扫描历史记录

### 待讨论问题

#### Iteration 2.1 相关

1. **扫描脚本的执行方式**
   - 用户手动运行脚本？
   - 还是通过 API 在 ComfyUI 进程内执行？
   - 手动运行更灵活，但 API 执行更集成

2. **节点 ID 的动态查找**
   - 生成脚本时如何确定要修改的节点 ID？
   - 使用节点匹配算法的结果？
   - 还是让用户手动指定？

3. **执行状态反馈**
   - 如何让用户知道扫描进度？
   - 输出到控制台？
   - 还是通过 WebSocket 反馈到 UI？

#### Iteration 2.2 相关

4. **叠加信息的字体支持**
   - 使用系统字体？
   - 还是内置字体？
   - 中文字体支持？

5. **叠加信息的样式**
   - 背景透明度？
   - 边框？
   - 阴影？

#### Iteration 2.3 相关

6. **扫描配置的管理**
   - 与预设配置分开管理？
   - 还是集成到预设中？

7. **UI 交互**
   - 扫描参数的选择方式？
   - 扫描值的输入方式（列表 vs 范围）？

---

## 参考资源

- [A1111 Config-Presets 插件](https://github.com/Zyin055/Config-Presets)
- [A1111 sd_grid_add_image_number 插件](https://github.com/pkuliyi2015/sd-webui-stablesr)
- [ComfyUI 插件开发文档](https://docs.comfy.org/custom-nodes/overview)
- [ComfyUI API 示例](https://github.com/comfyanonymous/ComfyUI/blob/master/script_examples/basic_api_example.py)
- [ComfyUI WebSocket API 示例](https://github.com/comfyanonymous/ComfyUI/blob/master/script_examples/websockets_api_example.py)
- [KJNodes AddLabel 节点](https://github.com/kijai/ComfyUI-KJNodes) - 图片叠加文字
- [images-grid-comfy-plugin](https://github.com/Smoothlikehai/images-grid-comfy-plugin) - 网格拼接
