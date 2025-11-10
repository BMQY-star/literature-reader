#!/bin/bash
# Git仓库初始化脚本（Linux/Mac）

echo "===================================="
echo "文献阅读器 - Git初始化脚本"
echo "===================================="
echo

# 检查是否已初始化
if [ -d .git ]; then
    echo "Git仓库已存在，跳过初始化..."
else
    echo "正在初始化Git仓库..."
    git init
    echo "Git仓库初始化完成！"
fi

echo
echo "===================================="
echo "下一步操作："
echo "===================================="
echo "1. 添加文件到暂存区:"
echo "   git add ."
echo
echo "2. 创建初始提交:"
echo "   git commit -m \"feat: 初始项目提交\""
echo
echo "3. 在GitHub上创建仓库后，添加远程仓库:"
echo "   git remote add origin https://github.com/YOUR_USERNAME/literature-reader.git"
echo
echo "4. 推送到GitHub:"
echo "   git branch -M main"
echo "   git push -u origin main"
echo
echo "详细说明请查看 GITHUB_SETUP.md"
echo "===================================="

