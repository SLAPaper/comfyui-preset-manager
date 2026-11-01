# 测试说明

## 依赖

```bash
pip install pytest pytest-asyncio httpx playwright
python -m playwright install chromium
```

前端测试需要 Node.js 18 或更高版本。

## 单元测试

```bash
python -m pytest tests -v --ignore=tests/e2e
```

| 文件 | 覆盖范围 |
|---|---|
| `test_imports.py` | 模块导入 |
| `test_storage.py` | ID 校验、原子读写、目录扫描 |
| `test_workflow_parser.py` | 模板发现、解析和校验 |
| `test_preset_manager.py` | 预设增删改查、内置与用户目录覆盖 |
| `test_sweep_manager.py` | 组合展开、覆盖规则、扫描配置增删改查 |
| `test_templates_snapshot.py` | 模板快照与图 fixture 覆盖 |

## 前端单元测试

```bash
node --test tests/js
```

| 文件 | 覆盖范围 |
|---|---|
| `tests/js/matcher.test.mjs` | 4 种匹配策略、同义词、检查、应用、快照和读取 |
| `tests/js/templates.test.mjs` | 快照模板与真实结构图的匹配结果 |
| `tests/js/sweep-runner.test.mjs` | 执行顺序、取消和中途失败 |
| `tests/js/sweep-values.test.mjs` | 轴值解析、格式化和总数计算 |

## E2E 测试

E2E 测试启动一个轻量 ComfyUI 实例，只加载本插件，测试结束后关闭。

```bash
# 全部 E2E
python -m pytest tests/e2e -v -m e2e

# 只测 API
python -m pytest tests/e2e/test_api.py -v -m e2e

# 只测界面
python -m pytest tests/e2e/test_preset_workflow.py -v -m e2e
```

启动参数：

```bash
python main.py --cpu --port 18188 \
  --disable-all-custom-nodes \
  --whitelist-custom-nodes comfyui-preset-manager \
  --disable-api-nodes \
  --database-url "sqlite:///:memory:"
```

参数说明：

- `--cpu`：不要求 GPU。
- `--disable-all-custom-nodes --whitelist-custom-nodes`：只加载本插件。
- `--database-url "sqlite:///:memory:"`：使用内存数据库，避免文件锁。

fixture 优先使用 `ComfyUI/venv` 的 Python 启动服务，找不到时使用当前 Python。

## E2E fixture

| Fixture | 作用域 | 说明 |
|---|---|---|
| `comfyui_server` | session | 启动 ComfyUI，返回地址 |
| `api_base` | function | 返回 API 地址 |
| `page` | function | 打开浏览器页面，接受 `beforeunload` 对话框 |

## 注意事项

- 修改前端代码后，按 `Ctrl + Shift + R` 强制刷新，避免浏览器使用缓存。
- 修改 widget 值时，同时更新 `widget.value`，再调用 `graph.setDirtyCanvas(true, true)`。
- 不要用 `app.loadGraphData()` 修改参数。这个函数会替换整个 graph。
