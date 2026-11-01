# 测试

## 运行单元测试

在插件根目录执行：

```bash
python -m pytest tests -v --ignore=tests/e2e
node --test tests/js
```

E2E 测试见 [../docs/TESTING.md](../docs/TESTING.md)。

## 依赖 mock 的原因

插件依赖 ComfyUI 运行时模块：`aiohttp`、`server`、`folder_paths`。单元测试在 ComfyUI 外运行，需要先 mock 这些模块。

`conftest.py` 位于插件根目录，pytest 启动时会自动加载，并写入上述 mock。`tests/conftest.py` 提供 fixture，并用 `_import_module_from_file()` 按文件路径导入被测模块，避开 `__init__.py` 的路由注册。

## 目录结构

| 文件 | 内容 |
|---|---|
| `../conftest.py` | mock ComfyUI 运行时模块 |
| `conftest.py` | fixture 和被测模块导入 |
| `test_imports.py` | 模块导入 |
| `test_storage.py` | 存储接口和 ID 校验 |
| `test_workflow_parser.py` | 模板加载 |
| `test_preset_manager.py` | 预设增删改查 |
| `test_sweep_manager.py` | 扫描组合展开和增删改查 |
| `test_api_template.py` | 模板数据 |
| `test_templates_snapshot.py` | 模板快照与图 fixture 覆盖 |
| `fixtures/templates.json` | 内置模板快照，供 JS 测试读取 |
| `fixtures/graphs/` | 每个模板对应的真实结构图，含预期匹配结果 |
| `tools/dump_templates.py` | 模板改动后重新生成快照 |
| `js/` | 前端 matcher、扫描执行、扫描值解析和模板匹配单元测试 |
| `e2e/` | 启动真实 ComfyUI 的 API 和界面测试 |

修改 `workflows/*.yaml` 后，运行 `python tests/tools/dump_templates.py` 更新快照，并同步调整 `fixtures/graphs/` 中对应模板的预期结果。
