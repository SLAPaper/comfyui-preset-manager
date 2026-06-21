# ComfyUI Preset Manager - 测试指南

**最后更新**: 2026-06-22

---

## 测试架构

| 层级 | 工具 | 命令 | 覆盖范围 |
|------|------|------|----------|
| 单元测试 | pytest | `python -m pytest tests/ -v --ignore=tests/e2e` | 后端 Python 模块 |
| E2E API 测试 | pytest + httpx | `python -m pytest tests/e2e/test_api.py -v -m e2e` | HTTP API 端点 |
| E2E UI 测试 | pytest + Playwright | `python -m pytest tests/e2e/test_preset_workflow.py -v -m e2e` | 前端 UI 交互 |

### 依赖

```bash
pip install pytest httpx playwright pytest-asyncio
python -m playwright install chromium
```

---

## 自动化 E2E 测试

### 启动方式

E2E 测试使用轻量 ComfyUI 实例，自动启动和关闭：

```
python main.py --cpu --port 18188
  --disable-all-custom-nodes
  --whitelist-custom-nodes comfyui-preset-manager
  --disable-api-nodes
  --database-url "sqlite:///:memory:"
```

- `--cpu`：不需要 GPU
- `--disable-all-custom-nodes --whitelist-custom-nodes`：只加载本插件
- `--database-url "sqlite:///:memory:"`：内存数据库，无文件锁

### 运行 E2E 测试

```bash
# 运行所有 E2E 测试
python -m pytest tests/e2e/ -v -m e2e

# 只运行 API 测试
python -m pytest tests/e2e/test_api.py -v -m e2e

# 只运行 UI 测试
python -m pytest tests/e2e/test_preset_workflow.py -v -m e2e
```

### E2E 测试结构

```
tests/e2e/
├── conftest.py             # Fixtures: comfyui_server, api_base, page
├── test_api.py             # API 端点测试 (SDXL, Qwen Image, Flux)
└── test_preset_workflow.py # UI 全流程测试 (对话框、预设选择、应用)
```

### Fixtures

| Fixture | Scope | 说明 |
|---------|-------|------|
| `comfyui_server` | session | 启动轻量 ComfyUI 实例，返回 base URL |
| `api_base` | function | 返回 API base URL |
| `page` | function | 创建 Playwright page，处理 beforeunload |

---

## 手动 Playwright 测试

### 启动 ComfyUI

```powershell
# 使用完整参数启动
Start-Process -FilePath 'python' `
  -ArgumentList 'main.py', '--enable-cors-header' `
  -WorkingDirectory 'E:\workspace\ComfyUI' `
  -PassThru | Select-Object Id
```

### beforeunload 弹窗处理

ComfyUI 在刷新页面时会弹出确认对话框，必须禁用：

```javascript
await page.evaluate(() => {
  window.addEventListener('beforeunload', (e) => {
    e.returnValue = '';
    delete e.returnValue;
  });
});
```

### 测试流程

1. 打开页面 → `page.goto('http://127.0.0.1:8188')`
2. 点击 Presets 按钮 → `page.locator('button', has_text='Presets')`
3. 选择预设 → `page.locator('.preset-item-name').first().click()`
4. 点击 Apply → `page.locator('button', has_text='Apply Preset')`
5. 验证对话框关闭 → `dialog.wait_for(state='hidden')`

---

## 踩坑记录

### 1. 前端代码更新后不生效

**原因**: 浏览器缓存

**解决**: `Ctrl + Shift + R` 强制刷新

### 2. widgets_values 更新后 UI 不刷新

**原因**: LiteGraph 不自动监听数组变化

**解决**: 同时更新 `widgets_values` 和 `widget.value`，调用 `graph.setDirtyCanvas(true, true)`

### 3. app.loadGraphData() 创建新 workflow

**原因**: `loadGraphData` 替换整个 graph

**解决**: 直接修改节点对象，不使用 `loadGraphData`

### 4. window.comfyAPI 替代弃用的 import

```javascript
// 旧方式（弃用）
import { $el, ComfyDialog } from "../../scripts/ui.js";

// 新方式
const { $el, ComfyDialog } = window.comfyAPI.ui;
const { ComfyButton } = window.comfyAPI.button;
```

---

## 相关文件

| 文件 | 用途 |
|------|------|
| `tests/e2e/conftest.py` | E2E fixture 定义 |
| `tests/e2e/test_api.py` | API 端点测试 |
| `tests/e2e/test_preset_workflow.py` | UI 全流程测试 |
| `tests/conftest.py` | 单元测试 fixture 和 mock |
| `pytest.ini` | pytest 配置 |
