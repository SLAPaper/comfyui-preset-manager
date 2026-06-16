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

## 设计决策

| 决策 | 理由 |
|------|------|
| 基于 class_type 匹配 | ComfyUI 的稳定标识，不受节点 ID 变化影响 |
| 多策略匹配 | 处理多个同类型节点的情况 |
| YAML 格式 | 人类可读，便于手动编辑，支持注释 |
| user/preset-manager/ 目录 | 已在 .gitignore，避免版本冲突 |
| Workflow 模板分离 | 同一预设可适配多个 workflow，支持继承 |
| 同义词系统 | 处理节点版本兼容 |

### 节点匹配策略

| 策略 | 说明 | 适用场景 |
|------|------|---------|
| `unique_class` | 唯一 class_type，只有一个同类型节点时直接匹配 | KSampler、EmptyLatentImage |
| `title_keyword` | class_type + 标题关键词匹配 | CLIPTextEncode（positive/negative） |
| `output_connection` | 通过输出连接关系判断（待实现） | 复杂 workflow |

---

## 实现阶段

### Phase 1: 核心功能（最小可用版本）

1. 创建插件基础结构
2. 实现 workflow 模板解析
3. 实现节点匹配算法（unique_class + title_keyword）
4. 实现预设文件加载/保存
5. 实现参数注入功能
6. 基础顶栏 UI ✅ (2026-06-14)

### Phase 2: UI 完善

1. 预设编辑器对话框 ✅ (2026-06-14)
2. 配置预览面板 ✅ (2026-06-14)
3. 选择性保存字段 ✅ (2026-06-14)
4. 预设搜索和过滤（留待以后实现）

### Phase 3: 高级功能（可选）

1. 多模态资源支持
2. 导入/导出功能
3. 预设继承和覆盖
4. 快捷键支持
5. 预设历史记录
6. A1111 格式导入

---

## 当前状态与已知问题

> 本节记录 2026-06-17 代码审查中发现的问题，基于实际代码库检查。

### 架构问题

| 问题 | 严重程度 | 状态 | 说明 |
|------|----------|------|------|
| 前端硬编码节点映射 | 高 | ✅ 已修复 (2026-06-17) | 前端改为模板驱动匹配，删除所有硬编码映射。新增 `GET /preset-manager/template/{template_id}` API |
| 后端 apply 端点被绕过 | 中 | 低优先级 | 前端直接操作 `app.graph` 保持响应速度，后端端点保留供脚本使用 |
| 双重匹配逻辑 | 中 | ✅ 已缓解 | 前端使用 `findNodeByTemplate()` 通用函数，与后端 `match_nodes()` 算法一致 |

### 测试基础设施

| 问题 | 严重程度 | 状态 | 说明 |
|------|----------|------|------|
| 测试无法运行 | 高 | ✅ 已修复 (2026-06-17) | 根因：`__init__.py` 的模块级装饰器在 pytest 导入时失败。修复：将 API 路由注册移入 `_register_routes()` 函数并加守卫 |
| 根因 | - | - | pytest 的 `import_path` 在独立上下文中执行，conftest.py 的 mock 对 `__init__.py` 的模块级代码无效 |

### 代码质量问题

| 问题 | 严重程度 | 说明 |
|------|----------|------|
| 调试日志污染 | 低 | `debug_apply.log` 被 git 跟踪，每次 apply 操作覆盖 |
| JS 调试语句 | 低 | `preset-dialog.js` 中有大量 `console.log` 调试输出 |
| 孤立文件 | 低 | `presets/_default.yaml` 在根目录，不在 `sdxl-txt2img/` 子目录 |

### 未实现功能清单

#### 节点匹配策略
- `output_connection` 策略（DESIGN.md 标注"待实现"）

#### Phase 2 遗留
- 预设搜索和过滤

#### Phase 3（全部未实现）
- 多模态资源支持
- 导入/导出功能
- 预设继承和覆盖
- 快捷键支持
- 预设历史记录
- A1111 格式导入

#### Iteration 2: 参数扫描（全部未实现）
- 扫描配置文件格式定义
- 扫描脚本生成逻辑
- 基础扫描执行功能
- 扫描结果摘要生成
- 叠加信息配置选项
- 多位置支持
- 格式模板解析
- 字体和样式配置
- 参数扫描面板
- 扫描配置管理
- 脚本生成和执行触发
- 扫描历史记录

### 模板覆盖

| 模板 | 状态 |
|------|------|
| `sdxl-txt2img` | ✅ 已实现（8 个参数映射） |
| Qwen Image | ❌ 未实现 |
| Flux | ❌ 未实现 |
| 其他 workflow | ❌ 未实现 |

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
