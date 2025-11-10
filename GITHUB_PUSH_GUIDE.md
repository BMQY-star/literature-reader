# 🚀 GitHub推送快速指南

## ✅ 已完成

- ✅ Git仓库已初始化
- ✅ 所有文件已添加到暂存区
- ✅ 已创建初始提交

## 📋 下一步：推送到GitHub

### 方式一：使用推送脚本（推荐）

**Windows用户：**
```bash
# 双击运行或在命令行执行
push_to_github.bat
```

**Linux/Mac用户：**
```bash
chmod +x push_to_github.sh
./push_to_github.sh
```

### 方式二：手动执行

#### 1. 在GitHub上创建新仓库

1. 登录 [GitHub](https://github.com)
2. 点击右上角 "+" → "New repository"
3. 填写信息：
   - Repository name: `literature-reader`（或您喜欢的名称）
   - Description: `智能文献阅读器 - 支持MinerU API和通义千问API`
   - 选择 Public 或 Private
   - **不要**勾选 "Initialize with README"（已有README）
4. 点击 "Create repository"

#### 2. 添加远程仓库并推送

**使用HTTPS（推荐新手）：**
```bash
# 替换 YOUR_USERNAME 为您的GitHub用户名
git remote add origin https://github.com/YOUR_USERNAME/literature-reader.git

# 设置main分支
git branch -M main

# 推送到GitHub
git push -u origin main
```

**使用SSH（推荐，需要先配置SSH密钥）：**
```bash
# 替换 YOUR_USERNAME 为您的GitHub用户名
git remote add origin git@github.com:YOUR_USERNAME/literature-reader.git

# 设置main分支
git branch -M main

# 推送到GitHub
git push -u origin main
```

#### 3. 验证

访问您的GitHub仓库页面，应该能看到所有代码文件。

## 🔐 GitHub认证

### 如果推送时要求输入密码：

**方式一：使用Personal Access Token（推荐）**

1. GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. 点击 "Generate new token"
3. 选择权限：`repo`（完整仓库访问权限）
4. 生成后复制token
5. 推送时，用户名填GitHub用户名，密码填token

**方式二：配置SSH密钥**

```bash
# 生成SSH密钥
ssh-keygen -t ed25519 -C "your.email@example.com"

# 复制公钥
cat ~/.ssh/id_ed25519.pub

# 在GitHub上添加SSH密钥
# Settings → SSH and GPG keys → New SSH key
```

## 📝 后续开发流程

推送成功后，日常开发流程：

```bash
# 1. 查看变更
git status

# 2. 添加文件
git add .

# 3. 提交
git commit -m "feat: 添加新功能"

# 4. 推送
git push
```

## ❓ 常见问题

**Q: 提示 "remote origin already exists"**
```bash
# 查看现有远程仓库
git remote -v

# 删除后重新添加
git remote remove origin
git remote add origin https://github.com/YOUR_USERNAME/literature-reader.git
```

**Q: 推送失败，提示认证错误**
- 检查GitHub用户名和密码/token
- 或配置SSH密钥

**Q: 想修改远程仓库URL**
```bash
git remote set-url origin https://github.com/YOUR_USERNAME/new-repo-name.git
```

## 🎉 完成！

推送成功后，您的代码就安全地保存在GitHub上了！

---

**提示**：记得在GitHub仓库设置中添加 `.env` 到 `.gitignore`，确保API密钥不会被提交。

