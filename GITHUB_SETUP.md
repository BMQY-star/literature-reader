# GitHub 代码管理指南

本指南将帮助您将项目推送到GitHub并管理代码。

## 📋 前置准备

1. **安装Git**
   - Windows: 下载 [Git for Windows](https://git-scm.com/download/win)
   - Mac: `brew install git`
   - Linux: `sudo apt install git`

2. **创建GitHub账号**
   - 访问 [GitHub](https://github.com) 注册账号

3. **配置Git用户信息**
   ```bash
   git config --global user.name "您的姓名"
   git config --global user.email "your.email@example.com"
   ```

## 🚀 初始化Git仓库

### 1. 在项目根目录初始化Git

```bash
# 进入项目目录
cd F:\桌面\wenxian

# 初始化Git仓库
git init

# 添加所有文件到暂存区
git add .

# 创建初始提交
git commit -m "feat: 初始项目提交 - 文献阅读器全栈应用"
```

### 2. 在GitHub上创建新仓库

1. 登录GitHub
2. 点击右上角 "+" → "New repository"
3. 填写仓库信息：
   - Repository name: `literature-reader` (或您喜欢的名称)
   - Description: `智能文献阅读器 - PDF解析、翻译、双语阅读`
   - 选择 Public 或 Private
   - **不要**勾选 "Initialize this repository with a README"（我们已经有了）
4. 点击 "Create repository"

### 3. 连接本地仓库到GitHub

```bash
# 添加远程仓库（将 YOUR_USERNAME 替换为您的GitHub用户名）
git remote add origin https://github.com/YOUR_USERNAME/literature-reader.git

# 或者使用SSH（如果已配置SSH密钥）
# git remote add origin git@github.com:YOUR_USERNAME/literature-reader.git

# 推送代码到GitHub
git branch -M main
git push -u origin main
```

## 📝 日常开发工作流

### 查看状态
```bash
# 查看文件变更状态
git status

# 查看具体变更内容
git diff
```

### 提交更改
```bash
# 添加修改的文件
git add <文件名>
# 或添加所有修改
git add .

# 提交更改（使用有意义的提交信息）
git commit -m "feat: 添加新功能"
# 或
git commit -m "fix: 修复bug"

# 推送到GitHub
git push
```

### 创建分支
```bash
# 创建并切换到新分支
git checkout -b feature/新功能名称

# 在新分支上开发完成后
git add .
git commit -m "feat: 新功能描述"
git push origin feature/新功能名称

# 在GitHub上创建Pull Request合并到main分支
```

### 更新代码
```bash
# 从远程仓库拉取最新代码
git pull origin main

# 如果有冲突，解决冲突后
git add .
git commit -m "merge: 解决冲突"
git push
```

## 🔐 使用SSH密钥（推荐）

### 生成SSH密钥
```bash
# 生成新的SSH密钥
ssh-keygen -t ed25519 -C "your.email@example.com"

# 按提示操作，默认保存在 ~/.ssh/id_ed25519
```

### 添加SSH密钥到GitHub
1. 复制公钥内容：
   ```bash
   # Windows (PowerShell)
   cat ~/.ssh/id_ed25519.pub
   
   # Linux/Mac
   cat ~/.ssh/id_ed25519.pub
   ```
2. 在GitHub上：
   - Settings → SSH and GPG keys → New SSH key
   - 粘贴公钥内容
   - 点击 "Add SSH key"

### 使用SSH连接
```bash
# 将远程仓库URL改为SSH
git remote set-url origin git@github.com:YOUR_USERNAME/literature-reader.git
```

## 📌 常用Git命令速查

```bash
# 查看提交历史
git log --oneline --graph

# 撤销工作区的修改
git checkout -- <文件名>

# 撤销暂存区的文件
git reset HEAD <文件名>

# 查看远程仓库
git remote -v

# 创建标签
git tag -a v1.0.0 -m "版本1.0.0"
git push origin v1.0.0
```

## 🛡️ 保护敏感信息

**重要：** 确保以下文件不会被提交到GitHub：

- `.env` - 环境变量（已在.gitignore中）
- `data/` - 上传的文件（已在.gitignore中）
- API密钥和密码

如果意外提交了敏感信息：
1. 立即在GitHub上删除仓库
2. 重新创建仓库
3. 修改所有泄露的密钥

## 🔄 GitHub Actions CI/CD

项目已配置GitHub Actions工作流（`.github/workflows/python.yml`），会在每次推送时：
- 运行代码检查（flake8）
- 运行测试（pytest）

## 📚 更多资源

- [Git官方文档](https://git-scm.com/doc)
- [GitHub Guides](https://guides.github.com/)
- [GitHub Desktop](https://desktop.github.com/) - 图形化Git工具

## ❓ 常见问题

**Q: 如何忽略已跟踪的文件？**
```bash
git rm --cached <文件名>
git commit -m "chore: 从Git中移除文件"
```

**Q: 如何回退到之前的提交？**
```bash
# 查看提交历史
git log

# 回退到指定提交（保留工作区）
git reset --soft <commit-hash>

# 强制推送（谨慎使用）
git push --force
```

**Q: 如何合并其他分支？**
```bash
git checkout main
git merge feature/新功能名称
git push
```

---

祝您使用愉快！如有问题，请查看GitHub文档或提交Issue。

