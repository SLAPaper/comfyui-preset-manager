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
| `tests/js/template-analyzer.test.mjs` | 代表性 workflow 的候选识别、歧义反馈和子图分析 |
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
python main.py --cpu --port <空闲端口> \
  --user-directory <临时目录>/user \
  --output-directory <临时目录>/output \
  --temp-directory <临时目录>/temp \
  --input-directory <临时目录>/input \
  --disable-all-custom-nodes \
  --whitelist-custom-nodes comfyui-preset-manager \
  --disable-api-nodes \
  --database-url "sqlite:///:memory:"
```

参数说明：

- `--cpu`：不要求 GPU。
- `--user-directory` 等目录：每次会话使用独立临时目录，不读写真实用户数据、输出或临时文件。
- `--port`：每次会话动态选择空闲端口，避免残留服务占用固定端口。
- `--disable-all-custom-nodes --whitelist-custom-nodes`：只加载本插件。
- `--database-url "sqlite:///:memory:"`：使用内存数据库，避免文件锁。

fixture 优先使用 `ComfyUI/venv` 的 Python 启动服务，找不到时使用当前 Python。

## 分析 fixture

`tests/fixtures/analyzer/` 保存从本地 workflow 和 ComfyUI 在线模板库筛选的 8 份代表性 graph：

| 文件 | 来源 | 覆盖点 |
|---|---|---|
| `anima-local.json` | 本地 Anima | KSampler、UNET/CLIP/VAE 加载器 |
| `flux-local.json` | 本地 Flux | `ModelSamplingFlux` 上游宽高、混合加载器 |
| `qwen-edit-local.json` | 本地 Qwen Image Edit | 编辑编码器提示词 |
| `z-image-local.json` | 本地 Z Image | 标准 KSampler 与 UNet 加载器 |
| `sdxl-local.json` | 本地 SDXL | 多 KSampler、多提示词节点的歧义反馈 |
| `chroma-template.json` | 内置 Chroma 模板 | `CFGGuider`、`BasicScheduler`、`RandomNoise` |
| `flux-schnell-template.json` | 内置 Flux Schnell 模板 | 标准 KSampler + checkpoint |
| `hidream-template.json` | 内置 HiDream 模板 | 自定义采样链 |

修改 fixture 后运行 `python tests/tools/dump_analyzer_fixtures.py` 重新生成。子图分析由 `tests/fixtures/graphs/qwen-image-21.json` 覆盖。

## E2E fixture

| Fixture | 作用域 | 说明 |
|---|---|---|
| `comfyui_server` | session | 用临时目录和空闲端口启动 ComfyUI，返回地址 |
| `api_base` | function | 返回 API 地址 |
| `page` | function | 打开浏览器页面，接受 `beforeunload` 对话框，并关闭空用户目录首次打开时的模板对话框 |

## 注意事项

- 修改前端代码后，按 `Ctrl + Shift + R` 强制刷新，避免浏览器使用缓存。
- 修改 widget 值时，同时更新 `widget.value`，再调用 `graph.setDirtyCanvas(true, true)`。
- 不要用 `app.loadGraphData()` 修改参数。这个函数会替换整个 graph。
