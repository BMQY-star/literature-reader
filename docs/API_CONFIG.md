# API配置指南

本项目支持使用MinerU API和通义千问API。

## 🔧 环境变量配置

### 1. 创建 `.env` 文件

在项目根目录创建 `.env` 文件（参考 `.env.example`）：

```bash
# 通义千问API配置
QWEN_API_KEY=your_qwen_api_key_here
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen-turbo

# MinerU API配置
# 获取方式：访问 https://mineru.net/ 申请Token
MINERU_TOKEN=your_mineru_token_here
MINERU_BASE_URL=https://mineru.net/api/v4
MINERU_MODEL_VERSION=vlm
MINERU_TIMEOUT=300
```

### 2. 获取通义千问API密钥

1. 访问 [阿里云DashScope控制台](https://dashscope.console.aliyun.com/)
2. 注册/登录账号
3. 创建API密钥
4. 将API密钥填入 `QWEN_API_KEY`

### 3. 配置MinerU API

1. 访问 [MinerU官网](https://mineru.net/) 申请Token
2. 将Token填入 `MINERU_TOKEN`
3. 可选配置：
   - `MINERU_MODEL_VERSION`: 模型版本（`vlm` 或 `pipeline`，默认 `vlm`）
   - `MINERU_TIMEOUT`: 超时时间（秒，默认300）

## 📝 使用方式

### 方式一：通过环境变量（推荐）

```bash
# Windows PowerShell
$env:QWEN_API_KEY="your_key"
$env:MINERU_API_URL="https://api.example.com/parse"

# Linux/Mac
export QWEN_API_KEY="your_key"
export MINERU_API_URL="https://api.example.com/parse"
```

### 方式二：使用 `.env` 文件

创建 `.env` 文件后，Flask会自动读取（需要安装 `python-dotenv`）：

```bash
pip install python-dotenv
```

然后在 `server/__init__.py` 中添加：

```python
from dotenv import load_dotenv
load_dotenv()
```

### 方式三：直接在 `config.py` 中配置

修改 `server/config.py`：

```python
QWEN_API_KEY = 'your_key_here'
MINERU_API_URL = 'https://api.example.com/parse'
```

## 🚀 API接口说明

### MinerU API接口

**端点1**: `POST /api/parse-pdf` - 解析PDF文件

**请求**:
- `file`: PDF文件（multipart/form-data，可选）
- `file_url`: 文件URL（可选，如果提供则直接使用）
- `wait`: 是否等待任务完成（默认: true）
- `model_version`: 模型版本（vlm 或 pipeline，可选）

**响应**:
```json
{
  "success": true,
  "message": "MinerU API解析成功",
  "data": {
    "task_id": "xxx",
    "state": "done",
    "layout_count": 123,
    "layout": [...],
    "mineru_data": {...}
  }
}
```

**端点2**: `GET /api/task/<task_id>` - 查询任务状态

**响应**:
```json
{
  "success": true,
  "message": "查询成功",
  "data": {
    "task_id": "xxx",
    "state": "done/running/pending",
    "full_zip_url": "https://...",
    "layout": [...]
  }
}
```

### 翻译接口

**端点1**: `POST /api/translate-layout` - 直接翻译layout数组（推荐）

**请求**:
```json
{
  "layout": [
    {"page": 1, "bbox": [x1, y1, x2, y2], "text": "原文", "type": "text"},
    ...
  ],
  "target_lang": "zh",
  "model": "qwen-turbo",
  "force_retranslate": false
}
```

**响应**:
```json
{
  "success": true,
  "message": "翻译完成：成功 123 个，跳过 0 个，失败 0 个",
  "data": {
    "layout": [
      {"page": 1, "bbox": [x1, y1, x2, y2], "text": "原文", "translated_text": "翻译", "type": "text"},
      ...
    ],
    "translated_count": 123,
    "skipped_count": 0,
    "failed_count": 0,
    "total_count": 123
  }
}
```

**端点2**: `POST /api/translate` - 翻译MinerU JSON文件

**请求**:
- `filename`: JSON文件名
- `target_lang`: 目标语言（默认: zh）
- `model`: 模型名称（可选）

**响应**:
```json
{
  "success": true,
  "message": "翻译成功",
  "data": {
    "translated_file": "path/to/translated.json",
    "target_lang": "zh"
  }
}
```

**注意**: 翻译功能默认使用通义千问API（如果配置了`QWEN_API_KEY`），否则使用OpenAI兼容API。

## 🔍 测试配置

### 测试通义千问API

```python
from server.translator_llm import translate_with_llm

# 测试翻译
result = translate_with_llm("Hello, world!", target_lang="zh")
print(result)
```

### 测试MinerU API

```python
from server.mineru_api import call_mineru_api

# 测试解析
result = call_mineru_api("path/to/test.pdf")
print(result)
```

## ⚠️ 注意事项

1. **API密钥安全**：
   - 不要将 `.env` 文件提交到Git
   - 生产环境使用环境变量或密钥管理服务

2. **API限流**：
   - 通义千问有调用频率限制
   - 建议使用缓存减少API调用

3. **错误处理**：
   - API调用失败时会返回原文
   - 检查日志了解详细错误信息

4. **超时设置**：
   - MinerU API默认超时300秒
   - 可根据实际情况调整 `MINERU_TIMEOUT`

## 📚 更多信息

- [通义千问文档](https://help.aliyun.com/zh/dashscope/)
- [MinerU文档](https://github.com/opendatalab/MinerU)

