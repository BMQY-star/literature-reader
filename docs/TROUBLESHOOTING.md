# 🔧 故障排除指南

## PDF加载失败问题

### 问题：`Missing PDF "http://localhost:3000/api/files/xxx.pdf"`

**原因：**
- 文件路径配置问题
- `send_from_directory` 需要绝对路径

**解决方案：**
1. 确保后端已重启（应用最新的代码更改）
2. 检查 `data/files` 目录是否存在
3. 确认文件已成功上传

**验证步骤：**
```bash
# 检查文件是否存在
Get-ChildItem data\files

# 检查后端日志
# 应该看到 "返回文件: ..." 的日志
```

### 其他常见问题

#### 1. 模块导入错误

**错误：** `ModuleNotFoundError: No module named 'server'`

**解决：** 使用以下方式启动：
```bash
# 方式1：使用模块方式启动（推荐）
python -m server.main

# 方式2：直接运行（已修复路径问题）
python server/main.py
```

#### 2. 端口被占用

**错误：** `Address already in use`

**解决：**
- 修改 `server/main.py` 中的端口号
- 或关闭占用端口的进程

#### 3. API密钥未配置

**错误：** 翻译或解析失败

**解决：**
- 检查 `.env` 文件
- 确认 `QWEN_API_KEY` 和 `MINERU_TOKEN` 已正确配置

#### 4. CORS错误

**错误：** 前端无法访问后端API

**解决：**
- 确保后端已启用CORS（开发环境自动启用）
- 检查 `vite.config.js` 中的代理配置

---

**提示：** 如果问题仍未解决，请查看后端日志获取详细错误信息。

