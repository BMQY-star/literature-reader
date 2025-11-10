# 📚 文献阅读器 (Literature Reader)

智能文献阅读器，支持PDF解析、版面结构可视化、语义级翻译和双语阅读。

## ✨ 功能特性

- 📄 **PDF上传与解析**：支持上传PDF文件，通过MinerU解析文档结构
- 🎨 **版面可视化**：可视化展示文档的版面结构（layout），支持文本块高亮
- 🌐 **智能翻译**：使用大语言模型（LLM）进行语义级翻译，支持多语言
- 📖 **双语阅读**：支持原文/翻译/对照三种阅读模式
- 🔍 **文本对齐**：点击PDF上的文本块，查看对应的翻译内容
- ⚡ **性能优化**：翻译结果缓存，避免重复调用API

## 🏗️ 技术栈

### 后端
- **Flask** - Web框架
- **Flask-Caching** - 缓存支持
- **Flask-CORS** - 跨域支持
- **OpenAI API** - 大语言模型翻译
- **PyMuPDF** - PDF处理（可选）

### 前端
- **React 18** - UI框架
- **Vite** - 构建工具
- **Tailwind CSS** - 样式框架
- **PDF.js** - PDF渲染

### 解析工具
- **MinerU** - 文档结构解析（外部工具）

## 📦 项目结构

```
literature-reader/
├── server/                 # Flask后端
│   ├── __init__.py        # 应用初始化
│   ├── config.py          # 配置文件
│   ├── main.py            # 主入口
│   ├── routes.py          # API路由
│   ├── mineru_parser.py   # MinerU解析模块
│   ├── translator_llm.py  # LLM翻译模块
│   └── data/              # 数据目录
│       ├── files/         # 上传的PDF文件
│       └── mineru/        # MinerU输出文件
│
├── client/                # React前端
│   ├── src/
│   │   ├── App.jsx        # 主应用组件
│   │   ├── api.js         # API客户端
│   │   └── components/    # 组件
│   │       ├── PdfViewer.jsx
│   │       ├── LayoutOverlay.jsx
│   │       └── BlockText.jsx
│   └── package.json
│
├── requirements.txt       # Python依赖
└── README.md
```

## 🚀 快速开始

### 1. 环境准备

**Python环境（推荐3.9+）**
```bash
python -m venv venv
# Windows
venv\Scripts\activate
# Linux/Mac
source venv/bin/activate
```

**Node.js环境（推荐18+）**
```bash
node --version
npm --version
```

### 2. 安装依赖

**后端依赖**
```bash
pip install -r requirements.txt
```

**前端依赖**
```bash
cd client
npm install
```

### 3. 配置环境变量

创建 `.env` 文件（可选，也可直接在config.py中配置）：
```bash
# .env
OPENAI_API_KEY=your_api_key_here
OPENAI_BASE_URL=https://api.openai.com/v1
DEFAULT_MODEL=gpt-4o-mini
FLASK_ENV=development
SECRET_KEY=your_secret_key_here
```

### 4. 运行项目

**启动后端（Flask）**
```bash
# 开发环境
python server/main.py

# 或使用Flask CLI
export FLASK_APP=server.main:app
flask run --reload

# 生产环境（推荐使用gunicorn）
gunicorn server.main:app -w 4 -b 0.0.0.0:5000
```

**启动前端（React）**
```bash
cd client
npm run dev
```

访问 `http://localhost:3000` 查看应用。

## 📖 使用指南

详细使用说明请查看 **[USER_GUIDE.md](USER_GUIDE.md)**，包含：

- ✅ 快速开始和安装指南
- ✅ 环境配置和API设置
- ✅ 功能使用说明（PDF解析、翻译、全文显示、双栏对照）
- ✅ GitHub代码管理
- ✅ 故障排除和常见问题

### 快速功能概览

1. **上传PDF** → 自动通过MinerU API解析
2. **查看解析结果** → PDF上显示文本块高亮
3. **翻译全文** → 分批翻译，实时显示进度
4. **全文显示** → 支持Markdown、LaTeX公式、HTML表格
5. **双栏对照** → 中英文对照阅读，支持同步滚动
6. **全屏模式** → 点击"全屏"按钮，按ESC退出

## 🔧 API接口

### 上传文件
```
POST /api/upload
Content-Type: multipart/form-data
Body: file (PDF或JSON文件)
```

### 解析Layout
```
POST /api/layout
Content-Type: multipart/form-data
Body: 
  - filename: JSON文件名（可选）
  - file: JSON文件（可选）
```

### 翻译文档
```
POST /api/translate
Content-Type: multipart/form-data
Body:
  - filename: JSON文件名
  - target_lang: 目标语言（默认: zh）
  - model: 模型名称（可选）
```

### 获取文件
```
GET /api/files/<filename>
GET /api/mineru/<filename>
```

## 🛠️ 开发规范

本项目遵循以下开发规范：

1. **项目结构**：使用Blueprint组织模块，业务逻辑与视图分离
2. **性能优化**：使用缓存、异步任务（Celery）处理耗时操作
3. **代码质量**：所有函数添加docstring，遵循PEP8规范
4. **API规范**：统一返回JSON格式 `{success, message, data}`
5. **安全性**：参数校验、文件类型检查、CSRF防护

详细规范请参考代码注释。

## 📝 后续扩展

- [ ] OCR和图表识别（PaddleOCR / layoutparser）
- [ ] 语义检索（sentence-transformers + FAISS）
- [ ] 翻译缓存优化（SQLite + SHA256）
- [ ] 多语言支持（i18n）
- [ ] 桌面端应用（Electron）
- [ ] 笔记和标注功能
- [ ] 协作功能

## 🤝 贡献

欢迎提交Issue和Pull Request！

## 📄 许可证

MIT License

## 🙏 致谢

- [MinerU](https://github.com/opendatalab/MinerU) - 文档解析工具
- [PDF.js](https://mozilla.github.io/pdf.js/) - PDF渲染
- [Flask](https://flask.palletsprojects.com/) - Web框架
- [React](https://react.dev/) - UI框架

