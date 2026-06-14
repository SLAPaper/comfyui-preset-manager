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

## 参考资源

- [A1111 Config-Presets 插件](https://github.com/Zyin055/Config-Presets)
- [ComfyUI 插件开发文档](https://docs.comfy.org/custom-nodes/overview)
- [ComfyUI API 示例](https://github.com/comfyanonymous/ComfyUI/blob/master/script_examples/basic_api_example.py)
