# 📚 文献阅读器 - 完整使用指南

## 📖 目录

- [快速开始](#快速开始)
- [环境配置](#环境配置)
- [功能使用](#功能使用)
- [API配置](#api配置)
- [GitHub代码管理](#github代码管理)
- [故障排除](#故障排除)

---

## 🚀 快速开始

### 1. 环境准备

**Python环境（推荐3.9+）**
```bash
python --version
# 或
python3 --version
```

**Node.js环境（推荐18+）**
```bash
node --version
npm --version
```

### 2. 安装依赖

**后端依赖**
```bash
# 创建虚拟环境（推荐）
python -m venv venv

# 激活虚拟环境
# Windows
venv\Scripts\activate
# Linux/Mac
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt
```

**前端依赖**
```bash
cd client
npm install
cd ..
```

### 3. 配置环境变量

复制环境变量模板：
```bash
# Windows
copy .env.example .env

# Linux/Mac
cp .env.example .env
```

编辑 `.env` 文件，填入API密钥（详见[API配置](#api配置)部分）

### 4. 启动项目

**终端1 - 启动后端：**
```bash
python server/main.py
```
后端运行在：http://localhost:5000

**终端2 - 启动前端：**
```bash
cd client
npm run dev
```
前端运行在：http://localhost:3000

**访问应用：** 打开浏览器访问 http://localhost:3000

---

## ⚙️ 环境配置

### 必需配置

在 `.env` 文件中配置以下内容：

```bash
# 通义千问API配置（翻译功能必需）
QWEN_API_KEY=your_qwen_api_key_here
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen-turbo

# MinerU API配置（PDF解析必需）
MINERU_TOKEN=your_mineru_token_here
MINERU_BASE_URL=https://mineru.net/api/v4
MINERU_MODEL_VERSION=vlm
```

### 获取API密钥

**通义千问API：**
1. 访问 [阿里云DashScope控制台](https://dashscope.console.aliyun.com/)
2. 注册/登录账号
3. 创建API密钥
4. 将密钥填入 `QWEN_API_KEY`

**MinerU API：**
1. 访问 [MinerU官网](https://mineru.net/)
2. 申请Token
3. 将Token填入 `MINERU_TOKEN`

---

## 🎯 功能使用

### 1. 上传和解析PDF

1. **上传PDF文件**
   - 点击"上传PDF文件"按钮
   - 选择要解析的PDF文档
   - 系统会自动调用MinerU API进行解析

2. **查看解析进度**
   - 上传后会显示"正在通过MinerU API解析PDF"
   - 进度条显示：`已解析页数 / 总页数`
   - 解析完成后会自动显示文本块

3. **查看解析结果**
   - PDF上会显示黄色高亮的文本块区域
   - 点击文本块可查看对应的文本内容
   - 右侧显示当前页的文本块列表

### 2. 翻译功能

1. **翻译全文**
   - 点击"翻译全文"按钮
   - 系统会分批翻译所有文本块（每批10个）
   - 实时显示翻译进度：`已翻译 / 总数 (百分比)`
   - 已翻译的文本块会立即显示

2. **翻译模式**
   - **原文**：只显示英文原文
   - **翻译**：只显示中文翻译
   - **对照**：同时显示原文和翻译

3. **强制重新翻译**
   - 勾选"强制重新翻译"复选框
   - 会重新翻译所有文本块（包括已有翻译的）

### 3. 视图模式

#### PDF视图
- 显示PDF文档
- 支持翻页（上一页/下一页）
- 文本块高亮显示
- 点击高亮区域查看文本

#### 全文视图
- 显示完整的Markdown格式文档
- 支持LaTeX数学公式渲染
- 支持HTML表格显示
- 支持图片显示
- **全屏功能**：点击"全屏"按钮可全屏查看（按ESC退出）

#### 双栏对照视图
- **左侧**：显示英文原文
- **右侧**：显示中文翻译
- **同步滚动**：滚动一侧时，另一侧自动同步
- **全屏功能**：点击"全屏"按钮可全屏查看

### 4. 全文显示功能

**功能特点：**
- 自动加载MinerU解析生成的 `full.md` 文件
- 支持Markdown格式渲染
- 支持LaTeX数学公式（使用MathJax）
- 支持HTML表格（包括rowspan和colspan）
- 支持图片显示
- 支持代码块、列表、链接等

**使用方式：**
1. 解析完成后，如果存在 `full.md`，会自动加载
2. 点击"全文"按钮切换到全文视图
3. 点击"全屏"按钮可全屏查看
4. 按 `ESC` 键退出全屏

### 5. 双栏对照功能

**功能特点：**
- 左侧显示原文（English）
- 右侧显示翻译（中文）
- 自动同步滚动
- 支持全文模式和Layout模式

**使用方式：**
1. 确保已翻译文本块
2. 点击"双栏对照"按钮
3. 如果存在翻译后的全文，显示全文对照
4. 否则显示基于Layout数据的文本块对照
5. 点击"全屏"按钮可全屏查看

---

## 🔧 API配置

### 通义千问API配置

**优先级：** 如果配置了 `QWEN_API_KEY`，优先使用通义千问API

**配置项：**
- `QWEN_API_KEY`: API密钥（必需）
- `QWEN_BASE_URL`: API地址（默认：`https://dashscope.aliyuncs.com/compatible-mode/v1`）
- `QWEN_MODEL`: 模型名称（默认：`qwen-turbo`）

### MinerU API配置

**配置项：**
- `MINERU_TOKEN`: API Token（必需）
- `MINERU_BASE_URL`: API地址（默认：`https://mineru.net/api/v4`）
- `MINERU_MODEL_VERSION`: 模型版本（默认：`vlm`，可选：`pipeline`）
- `MINERU_TIMEOUT`: 超时时间（秒，默认：300）

### API接口说明

#### PDF解析接口

**POST `/api/parse-pdf`**
- 上传PDF文件进行解析
- 支持异步模式（返回task_id）和同步模式（等待完成）
- 自动使用MinerU批量上传接口

**GET `/api/task/<task_id>`**
- 查询单个解析任务状态
- 任务完成后自动下载并解析结果

**GET `/api/batch/<batch_id>`**
- 查询批量解析任务状态
- 显示解析进度（已解析页数/总页数）

#### 翻译接口

**POST `/api/translate-layout`**
- 直接翻译layout数组中的文本块
- 支持分批翻译，实时返回结果
- 支持强制重新翻译选项

**请求示例：**
```json
{
  "layout": [
    {"page": 1, "text": "Hello", "bbox": [0, 0, 100, 20]},
    ...
  ],
  "target_lang": "zh",
  "force_retranslate": false
}
```

#### 全文和图片接口

**GET `/api/full-text/<task_id>`**
- 获取MinerU解析的全文Markdown内容

**GET `/api/images/<task_id>/<image_name>`**
- 获取MinerU解析的图片文件

---

## 📦 GitHub代码管理

### 初始化仓库

如果还没有初始化Git仓库：

```bash
# 初始化Git仓库
git init

# 添加所有文件
git add .

# 创建初始提交
git commit -m "feat: 初始项目提交"
```

### 连接GitHub

```bash
# 添加远程仓库（替换YOUR_USERNAME为您的GitHub用户名）
git remote add origin https://github.com/YOUR_USERNAME/literature-reader.git

# 或使用SSH
git remote add origin git@github.com:YOUR_USERNAME/literature-reader.git

# 推送到GitHub
git branch -M main
git push -u origin main
```

### 日常开发流程

```bash
# 1. 查看变更
git status

# 2. 添加文件
git add .

# 3. 提交更改
git commit -m "feat: 添加新功能"

# 4. 推送到GitHub
git push
```

### GitHub认证

**使用Personal Access Token：**
1. GitHub → Settings → Developer settings → Personal access tokens
2. 生成新token，选择 `repo` 权限
3. 推送时，用户名填GitHub用户名，密码填token

**使用SSH密钥（推荐）：**
```bash
# 生成SSH密钥
ssh-keygen -t ed25519 -C "your.email@example.com"

# 复制公钥
cat ~/.ssh/id_ed25519.pub

# 在GitHub上添加SSH密钥
# Settings → SSH and GPG keys → New SSH key
```

---

## 🔍 故障排除

### 1. PDF加载失败

**问题：** `Missing PDF "http://localhost:3000/api/files/xxx.pdf"`

**解决方案：**
- 确保后端已重启
- 检查 `data/files` 目录是否存在
- 确认文件已成功上传

### 2. 翻译失败

**问题：** 翻译完成但显示"成功 0 个，失败 X 个"

**可能原因：**
- API密钥未配置或无效
- API调用频率超限
- 网络连接问题
- 模型不存在

**解决方案：**
1. 检查 `.env` 文件中的 `QWEN_API_KEY` 是否正确
2. 查看后端日志获取详细错误信息
3. 检查网络连接
4. 确认模型名称正确（默认：`qwen-turbo`）

### 3. 解析进度不显示

**问题：** 显示"正在解析"但没有进度信息

**解决方案：**
- 等待几秒钟，进度信息会在解析开始后显示
- 检查浏览器控制台是否有错误
- 检查后端日志

### 4. 全文内容不显示

**问题：** 切换到全文视图后没有内容

**可能原因：**
- MinerU解析结果中没有 `full.md` 文件
- 全文内容加载失败

**解决方案：**
- 检查MinerU解析结果是否包含 `full.md`
- 查看浏览器控制台是否有错误
- 尝试重新解析PDF

### 5. 双栏对照显示英文

**问题：** 双栏对照视图右侧显示的是英文而不是中文

**解决方案：**
- 确保已点击"翻译全文"按钮完成翻译
- 检查文本块是否有 `translated_text` 字段
- 尝试勾选"强制重新翻译"后重新翻译

### 6. 端口被占用

**后端端口5000被占用：**
```bash
# 修改 server/main.py 中的端口
app.run(host='0.0.0.0', port=5001)
```

**前端端口3000被占用：**
```bash
# 修改 client/vite.config.js
server: {
  port: 3001
}
```

### 7. 模块导入错误

**错误：** `ModuleNotFoundError: No module named 'server'`

**解决方案：**
```bash
# 使用模块方式启动（推荐）
python -m server.main

# 或直接运行（已修复路径问题）
python server/main.py
```

### 8. CORS错误

**错误：** 前端无法访问后端API

**解决方案：**
- 确保后端已启用CORS（开发环境自动启用）
- 检查 `vite.config.js` 中的代理配置
- 确认后端运行在正确的端口

---

## 💡 使用技巧

### 1. 批量翻译优化

- 翻译时会自动分批处理（每批10个文本块）
- 已翻译的文本块会立即显示，无需等待全部完成
- 如果部分翻译失败，可以勾选"强制重新翻译"后重试

### 2. 全屏阅读

- 在全文视图或双栏对照视图中，点击"全屏"按钮
- 全屏模式下，按 `ESC` 键可快速退出
- 全屏时右侧面板会自动隐藏，提供更大的阅读空间

### 3. 文本块定位

- 点击PDF上的黄色高亮区域，可快速定位到对应的文本块
- 右侧文本块列表按页面分组显示
- 可以切换"原文"、"翻译"、"对照"三种模式查看

### 4. 公式和表格

- LaTeX数学公式会自动渲染（使用MathJax）
- HTML表格支持复杂的rowspan和colspan属性
- 图片会自动从MinerU解析结果中加载

---

## 📚 更多资源

- **项目文档：** 查看 `../README.md` 了解项目概述
- **API文档：** 查看 `API_CONFIG.md` 了解详细API配置
- **贡献指南：** 查看 `CONTRIBUTING.md` 了解如何贡献代码
- **故障排除：** 查看 `TROUBLESHOOTING.md` 了解常见问题解决方案

---

## 🆘 获取帮助

如果遇到问题：
1. 查看本文档的[故障排除](#故障排除)部分
2. 检查后端日志获取详细错误信息
3. 查看浏览器控制台是否有前端错误
4. 在GitHub上提交Issue

---

**祝您使用愉快！** 🎉

