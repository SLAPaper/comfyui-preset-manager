# ComfyUI Preset Manager - 自动化前端测试指南

**创建时间**: 2026-06-14
**适用场景**: 需要验证前端 UI 功能时使用

---

## 快速启动

### 1. 启动 ComfyUI

```powershell
# 使用 venv 中的 python 启动（必须，否则缺少依赖）
Start-Process -FilePath 'E:\workspace\ComfyUI\venv\Scripts\python.exe' `
  -ArgumentList 'main.py', '--fp16-intermediates', '--supports-fp8-compute', '--enable-triton-backend', '--async-offload', '--enable-cors-header' `
  -WorkingDirectory 'E:\workspace\ComfyUI' `
  -PassThru | Select-Object Id
```

### 2. 等待就绪

```powershell
# 等待端口 8188 可用（通常需要 15-30 秒）
Start-Sleep -Seconds 30
Test-NetConnection -ComputerName localhost -Port 8188 -WarningAction SilentlyContinue | Select-Object TcpTestSucceeded
```

### 3. 关闭 ComfyUI

```powershell
# 通过 PID 关闭（启动时记录的 ID）
Stop-Process -Id <PID> -Force

# 或者关闭所有 python 进程（危险，确认没有其他任务）
Get-Process python -ErrorAction SilentlyContinue | Stop-Process -Force
```

---

## Playwright 测试流程

### 基本操作

```javascript
// 打开页面
await page.goto('http://127.0.0.1:8188');

// 禁用 beforeunload 弹窗（必须！否则刷新/导航会卡住）
await page.evaluate(() => {
  window.addEventListener('beforeunload', (e) => {
    e.returnValue = '';
    delete e.returnValue;
  });
});

// 截图
await page.screenshot({ path: 'screenshot.png', type: 'png' });

// 获取页面快照（用于查找元素）
// 使用 playwright_browser_snapshot 工具

// 点击元素
await page.getByRole('button', { name: 'Preset Manager' }).click();

// 获取控制台日志
// 使用 playwright_browser_console_messages 工具
```

### 重要：beforeunload 弹窗处理

ComfyUI 在刷新页面或导航时会弹出"是否离开此网站"的对话框，导致 Playwright 操作卡住。

**必须在每次页面加载后立即禁用此弹窗：**

```javascript
await page.evaluate(() => {
  window.addEventListener('beforeunload', (e) => {
    e.returnValue = '';
    delete e.returnValue;
  });
});
```

**何时需要执行：**
- 每次 `page.goto()` 后
- 每次页面刷新后
- 每次 `playwright_browser_navigate` 后

### 测试 Preset Manager 的流程

1. **打开页面** → `playwright_browser_navigate`
2. **点击 Presets 按钮** → 找到 `button "Preset Manager"` 的 ref
3. **选择预设** → 找到 `generic [cursor=pointer]: 默认配置 (_default)` 的 ref
4. **点击 Apply** → 找到 `button "Apply Preset"` 的 ref
5. **检查控制台日志** → `playwright_browser_console_messages`
6. **截图验证** → `playwright_browser_take_screenshot`

---

## 踩坑记录

### 1. 启动 ComfyUI 失败

**问题**: 直接运行 `python main.py` 报错 `ModuleNotFoundError: No module named 'sqlalchemy'`

**原因**: 没有激活虚拟环境

**解决**: 使用 `E:\workspace\ComfyUI\venv\Scripts\python.exe` 启动

### 2. 前端代码更新后不生效

**问题**: 修改了 JS 文件后浏览器没有加载新代码

**原因**: 浏览器缓存

**解决**: 
- `Ctrl + Shift + R` 强制刷新
- 或 F12 → Network → Disable cache → 刷新

### 3. widgets_values 更新后 UI 不刷新

**问题**: 修改了 `widgets_values` 数组，但节点显示没有变化

**原因**: LiteGraph 不会自动监听数组变化

**解决**: 
- 同时更新 `widgets_values` 和 `widget.value`
- 调用 `graph.setDirtyCanvas(true, true)` 强制刷新

### 4. CLIPTextEncode 节点无法区分正负提示词

**问题**: 两个 CLIPTextEncode 节点标题相同，无法通过标题关键词区分

**原因**: 用户自定义的 workflow 没有使用标准命名

**解决**: 
- 先尝试标题关键词匹配
- 失败后通过连接关系匹配（CLIPTextEncode → KSampler 的 positive/negative 输入）

### 5. app.loadGraphData() 创建新 workflow

**问题**: 调用 `app.loadGraphData()` 后创建了一个新的 "Unsaved Workflow"

**原因**: `loadGraphData` 会替换整个 graph

**解决**: 
- 直接修改节点的 `widgets_values` 和 `widget.value`
- 调用 `graph.setDirtyCanvas(true, true)` 刷新
- 不使用 `loadGraphData`

### 6. 'str' object has no attribute 'get' 错误

**问题**: 后端报错 `'str' object has no attribute 'get'`

**原因**: `app.graph.serialize()` 返回的是图格式（nodes 数组），不是 API 格式（node_id 字典）

**解决**: 
- 前端直接操作节点对象，不序列化/反序列化
- 避免格式转换

### 7. window.comfyAPI 替代弃用的 import

**问题**: 控制台显示弃用警告 `[ComfyUI Deprecated] Importing from "scripts/ui.js"`

**原因**: 旧的 import 方式已弃用

**解决**:
```javascript
// 旧方式（弃用）
import { $el, ComfyDialog } from "../../scripts/ui.js";
const { ComfyButton } = await import("../../scripts/ui/components/button.js");

// 新方式
const { $el, ComfyDialog } = window.comfyAPI.ui;
const { ComfyButton } = window.comfyAPI.button;
```

---

## 调试技巧

### 添加调试日志到文件

```javascript
// 在 __init__.py 中
from pathlib import Path
DEBUG_LOG = Path(__file__).parent / "debug.log"

def _log_debug(message: str):
    with open(DEBUG_LOG, "a", encoding="utf-8") as f:
        f.write(message + "\n")
```

### 检查节点结构

```javascript
console.log('Node widgets_values:', node.widgets_values);
console.log('Node widgets:', node.widgets);
console.log('Node inputs:', node.inputs);
console.log('Node outputs:', node.outputs);
console.log('Graph links:', graph.links);
```

### 检查连接关系

```javascript
// Links 格式: [link_id, from_node_id, from_slot, to_node_id, to_slot, type]
for (const link of graph.links || []) {
    const [linkId, fromNodeId, fromSlot, toNodeId, toSlot, type] = link;
    console.log(`Link ${linkId}: node ${fromNodeId} slot ${fromSlot} -> node ${toNodeId} slot ${toSlot}`);
}
```

---

## 测试检查清单

### Phase 1 测试

- [x] 顶栏显示 Presets 按钮
- [x] 点击按钮打开对话框
- [x] 模板下拉框正常工作
- [x] 预设列表正确显示
- [x] 点击预设显示预览
- [x] Apply 按钮可用
- [x] 数值参数（width/height/steps/cfg）正确应用
- [x] 枚举参数（sampler/scheduler）正确应用
- [x] 文本参数（positive/negative prompt）正确应用
- [x] 不创建新的 "Unsaved Workflow"
- [x] 控制台无错误日志
- [x] UI 正确刷新显示新值

### Phase 2 测试

- [x] 预设编辑器对话框打开
- [x] 预设编辑器显示当前 workflow 参数
- [x] 参数按节点类型分组显示
- [x] checkbox 可选择/取消参数
- [x] 全选/反选功能正常
- [x] 创建新预设成功
- [x] 编辑现有预设成功
- [x] 代码编辑模式可用
- [x] 配置预览面板显示匹配状态
- [x] 匹配节点 ID 正确显示

---

## Playwright 测试脚本

### 测试 1: 预设编辑器对话框

```javascript
// 1. 启动 ComfyUI 并打开页面
// 2. 禁用 beforeunload
await page.evaluate(() => {
  window.addEventListener('beforeunload', (e) => {
    e.returnValue = '';
    delete e.returnValue;
  });
});

// 3. 点击 Presets 按钮
await page.getByRole('button', { name: 'Preset Manager' }).click();

// 4. 点击 "+ 新建" 按钮
await page.getByText('+ 新建').click();

// 5. 验证编辑器对话框打开
// 检查是否有 "创建预设" 标题
const title = await page.locator('h2:has-text("创建预设")').count();
assert(title > 0, '编辑器对话框应打开');

// 6. 验证参数列表显示
// 检查是否有 KSampler 分组
const ksamplerGroup = await page.locator('.param-group-title:has-text("KSampler")').count();
assert(ksamplerGroup > 0, '应显示 KSampler 参数分组');

// 7. 验证 checkbox 存在
const checkboxes = await page.locator('.param-item input[type="checkbox"]').count();
assert(checkboxes > 0, '应显示参数 checkbox');

// 8. 截图
await page.screenshot({ path: '.omo/screenshots/test-editor-dialog.png', type: 'png' });
```

### 测试 2: 选择性保存字段

```javascript
// 1. 打开预设编辑器（同测试 1）

// 2. 取消选择一个参数
const firstCheckbox = page.locator('.param-item input[type="checkbox"]').first();
await firstCheckbox.uncheck();

// 3. 验证 checkbox 状态
const isChecked = await firstCheckbox.isChecked();
assert(!isChecked, 'checkbox 应取消选中');

// 4. 点击 "全选" 按钮
await page.locator('.param-group-select-all').first().click();

// 5. 验证所有 checkbox 被选中
const allChecked = await page.locator('.param-item input[type="checkbox"]:checked').count();
const totalCheckboxes = await page.locator('.param-item input[type="checkbox"]').count();
assert(allChecked === totalCheckboxes, '全选后所有 checkbox 应被选中');

// 6. 填写预设名称
await page.locator('input[placeholder="输入预设名称"]').fill('测试预设');

// 7. 点击保存
await page.getByText('保存').click();

// 8. 验证预设列表更新
await page.waitForTimeout(1000); // 等待刷新
const presetItem = await page.locator('.preset-item-name:has-text("测试预设")').count();
assert(presetItem > 0, '新预设应出现在列表中');
```

### 测试 3: 配置预览面板

```javascript
// 1. 打开 Preset Manager 对话框
await page.getByRole('button', { name: 'Preset Manager' }).click();

// 2. 选择一个预设
await page.locator('.preset-item-name').first().click();

// 3. 验证预览面板显示
const previewRows = await page.locator('.preview-row').count();
assert(previewRows > 0, '预览面板应显示参数行');

// 4. 验证匹配状态显示
const successStatus = await page.locator('.preview-status:has-text("✅")').count();
const failStatus = await page.locator('.preview-status:has-text("❌")').count();
assert(successStatus + failStatus > 0, '应显示匹配状态');

// 5. 验证节点 ID 显示
const nodeIds = await page.locator('.preview-node').count();
assert(nodeIds > 0, '应显示匹配的节点 ID');

// 6. 截图
await page.screenshot({ path: '.omo/screenshots/test-preview-panel.png', type: 'png' });
```

### 测试 4: 编辑现有预设

```javascript
// 1. 打开 Preset Manager 对话框
await page.getByRole('button', { name: 'Preset Manager' }).click();

// 2. 点击预设的 "编辑" 按钮
await page.locator('.preset-item button:has-text("编辑")').first().click();

// 3. 验证编辑器打开
const title = await page.locator('h2:has-text("编辑预设")').count();
assert(title > 0, '编辑器应打开');

// 4. 验证预设名称输入框禁用
const nameInput = page.locator('input[placeholder="输入预设名称"]');
const isDisabled = await nameInput.isDisabled();
assert(isDisabled, '编辑模式下名称输入框应禁用');

// 5. 修改一个参数值
const stepsInput = page.locator('.preview-row:has-text("steps") .preview-value');
// 注意：实际测试中需要根据 UI 结构调整选择器

// 6. 保存修改
await page.getByText('保存').click();

// 7. 验证保存成功
await page.waitForTimeout(1000);
```

---

## 测试结果记录

### 2026-06-14 Phase 2 测试通过

**环境**: Windows, ComfyUI v0.4, Playwright

**测试结果**: ✅ 全部通过

**测试项目**:
1. 预设编辑器对话框 - ✅ 正常打开，显示参数分组
2. 选择性保存字段 - ✅ checkbox 可选择/取消，全选/反选正常
3. 创建新预设 - ✅ 成功保存 "测试预设"
4. 配置预览面板 - ✅ 显示匹配状态（✅）和节点 ID
5. 编辑现有预设 - ✅ 正确加载预设数据，名称禁用

**截图**:
- .omo/screenshots/test-1-editor-dialog.png
- .omo/screenshots/test-2-selective-save.png
- .omo/screenshots/test-3-preview-panel.png
- .omo/screenshots/test-4-edit-preset.png

### 2026-06-14 Phase 1 测试通过

**环境**: Windows, ComfyUI v0.4, Playwright

**测试结果**: ✅ 全部通过

**关键发现**:
1. 连接关系查找成功区分正负提示词
2. `widget.value` 更新后 UI 自动刷新
3. `widgets_values` 和 `widget.value` 需要同时更新

---

## 相关文件

| 文件 | 用途 |
|------|------|
| `web/preset-manager.js` | 扩展入口，注册按钮 |
| `web/preset-dialog.js` | 对话框 UI 和应用逻辑 |
| `web/preset-api.js` | 后端 API 封装 |
| `mapping_manager.py` | 映射存储 |
| `debug_apply.log` | 调试日志（运行时生成） |
