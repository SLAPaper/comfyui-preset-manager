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

## 使用方法

1. 在 ComfyUI 顶栏点击"配置预设"按钮
2. 选择 workflow 模板
3. 选择或创建预设
4. 点击"应用"注入配置

## 目录结构

```
user/preset-manager/
├── workflows/          # Workflow 模板定义
├── presets/            # 预设文件
└── media/              # 多模态资源
```

## 详细设计

参见 [docs/DESIGN.md](docs/DESIGN.md)
