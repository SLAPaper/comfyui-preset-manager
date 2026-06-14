# Phase 1 实施规划

## 目标

验证"配置复用"概念：用户选择 workflow 模板 → 选择预设 → 一键注入参数到当前 workflow。

## 决策记录

| 问题 | 决策 |
|------|------|
| 插件初始化：发现 workflow 模板 | 扫描 `workflows/` 目录 |
| 模板文件不存在 | 打印警告，不阻断 |
| 节点匹配失败 | 跳过该参数 + console.warn（Phase 2 加手动绑定） |
| 参数注入时机 | 点击"应用"立即注入，无确认对话框 |
| 预设保存字段 | 只保存与模板定义匹配的字段 |

## 迭代拆分

### Phase 1a：最小可测试版本（后端验证）

**目标**：通过 API 测试核心逻辑，无需 UI。

| 序号 | 任务 | 依赖 | 产出文件 |
|------|------|------|----------|
| 1 | 插件骨架 + API 路由注册 | 无 | `__init__.py` |
| 2 | Workflow 模板解析 | 1 | `workflow_parser.py` |
| 3 | 节点匹配算法 | 2 | `node_matcher.py` |
| 4 | 预设文件加载/保存 | 2 | `preset_manager.py` |
| 5 | 参数注入（API 触发） | 3, 4 | `__init__.py` (apply endpoint) |
| 6 | 最小 workflow 模板 | 无 | `workflows/sdxl-txt2img.yaml` |
| 7 | 测试预设 | 6 | `presets/_default.yaml` |

**验收标准**：
- `GET /preset-manager/workflows` 返回模板列表
- `GET /preset-manager/presets/sdxl-txt2img` 返回预设列表
- `POST /preset-manager/apply` 将预设参数注入到当前 workflow
- 控制台输出匹配日志（哪些节点匹配成功/失败）

**测试方法**：
```bash
# 获取模板列表
curl http://127.0.0.1:8188/preset-manager/workflows

# 获取预设列表
curl http://127.0.0.1:8188/preset-manager/presets/sdxl-txt2img

# 应用预设（需要先在 ComfyUI 加载一个 workflow）
curl -X POST http://127.0.0.1:8188/preset-manager/apply \
  -H "Content-Type: application/json" \
  -d '{"workflow": "sdxl-txt2img", "preset": "_default"}'
```

---

### Phase 1b：可用版本（前端 UI）

**目标**：用户可通过界面操作。

| 序号 | 任务 | 依赖 | 产出文件 |
|------|------|------|----------|
| 8 | 顶栏按钮 + 面板骨架 | 1a | `web/preset-manager.js` |
| 9 | 模板选择器 | 8 | `web/preset-manager.js` |
| 10 | 预设列表 + 应用按钮 | 8, 9 | `web/preset-manager.js` |
| 11 | 预设保存对话框 | 8 | `web/preset-manager.js` |

**验收标准**：
- 顶栏显示"配置预设"按钮
- 点击打开面板，可选择 workflow 模板
- 面板显示该模板下的预设列表
- 点击"应用"注入参数到当前 workflow
- 点击"保存"可将当前配置保存为新预设

---

## 文件结构

```
comfyui-preset-manager/
├── __init__.py              # 插件入口：API 路由、目录初始化
├── workflow_parser.py       # Workflow 模板解析
├── node_matcher.py          # 节点匹配算法
├── preset_manager.py        # 预设文件加载/保存
├── workflows/               # Workflow 模板（随插件分发）
│   └── sdxl-txt2img.yaml   # Phase 1a 的最小模板
├── presets/                 # 默认预设（随插件分发）
│   └── _default.yaml
├── web/
│   └── preset-manager.js    # 前端 UI（Phase 1b）
├── pyproject.toml           # 需添加 pyyaml 依赖
├── docs/
│   ├── DESIGN.md
│   └── PHASE1-PLAN.md
└── README.md
```

## 用户数据目录

```
user/preset-manager/
├── workflows/               # 用户自定义模板（可选）
├── presets/                 # 用户创建的预设
│   ├── sdxl-txt2img/
│   │   ├── high-quality.yaml
│   │   └── fast-preview.yaml
│   └── qwen-image/
└── media/                   # 多模态资源（Phase 3）
```

## API 设计

| 方法 | 路径 | 说明 | Phase |
|------|------|------|-------|
| GET | `/preset-manager/workflows` | 获取所有 workflow 模板 | 1a |
| GET | `/preset-manager/presets/{template_id}` | 获取指定模板的预设列表 | 1a |
| GET | `/preset-manager/preset/{template_id}/{preset_id}` | 获取预设详情 | 1a |
| POST | `/preset-manager/preset` | 保存新预设 | 1a |
| POST | `/preset-manager/apply` | 应用预设到当前 workflow | 1a |
| DELETE | `/preset-manager/preset/{template_id}/{preset_id}` | 删除预设 | 1b |

## 调试日志规范

Phase 1 必须输出以下日志（console.warn / print）：

```
[PresetManager] 加载模板: sdxl-txt2img (8 个参数定义)
[PresetManager] 匹配 positive_prompt: 节点 15 (CLIPTextEncode, title="positive")
[PresetManager] 匹配 negative_prompt: 节点 16 (CLIPTextEncode, title="negative")
[PresetManager] 匹配 sampler: 节点 3 (KSampler)
[PresetManager] ⚠ 匹配失败: lora_strength (LoraLoader 不存在)
[PresetManager] 注入完成: 7/8 个参数成功
```

## 依赖

```toml
# pyproject.toml
[project]
dependencies = ["pyyaml"]
```

## 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| PromptServer 加载时序 | 检查 `hasattr(PromptServer, "instance")` |
| PyYAML 未安装 | pyproject.toml 声明依赖 |
| 节点匹配错误 | 详细日志 + Phase 1 只支持简单模板 |
| workflow 无活跃图 | apply 接口返回错误提示 |

## 后续步骤

Phase 1a 完成后：
1. 用真实 workflow 测试节点匹配
2. 根据测试结果调整匹配策略
3. 再启动 Phase 1b（前端 UI）
