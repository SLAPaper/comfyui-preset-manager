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

`tests/conftest.py` 在收集测试前写入上述 mock，并提供 fixture。模块用 `_import_module_from_file()` 按文件路径导入，避开 `__init__.py` 的路由注册。

## 目录结构

| 文件 | 内容 |
|---|---|
| `conftest.py` | mock ComfyUI 运行时模块、fixture 和被测模块导入 |
| `test_storage.py` | 存储接口和 ID 校验 |
| `test_workflow_parser.py` | 模板加载 |
| `test_preset_manager.py` | 预设增删改查 |
| `test_sweep_manager.py` | 扫描组合展开和增删改查 |
| `test_templates_snapshot.py` | 模板快照与图 fixture 覆盖 |
| `fixtures/templates.json` | 内置模板快照，供 JS 测试读取 |
| `fixtures/graphs/` | 每个模板对应的真实结构图，含预期匹配结果 |
| `fixtures/analyzer/` | 8 个代表性 workflow 的 graph，供模板分析测试读取 |
| `tools/dump_templates.py` | 模板改动后重新生成快照 |
| `tools/dump_analyzer_fixtures.py` | 重新生成代表性 workflow 的分析 fixture |
| `js/` | 前端 matcher、模板分析、分析器规则一致性、扫描执行、graph 写锁、扫描值解析和模板匹配单元测试 |
| `e2e/` | 启动真实 ComfyUI 的 API 和界面测试 |

修改 `workflows/*.yaml` 后，运行 `python tests/tools/dump_templates.py` 更新快照，并同步调整 `fixtures/graphs/` 中对应模板的预期结果。
