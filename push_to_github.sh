#!/bin/bash
# GitHub推送脚本（Linux/Mac）

echo "===================================="
echo "文献阅读器 - GitHub推送脚本"
echo "===================================="
echo

# 检查Git是否初始化
if [ ! -d .git ]; then
    echo "正在初始化Git仓库..."
    git init
    echo "Git仓库初始化完成！"
    echo
fi

# 添加所有文件
echo "正在添加文件到暂存区..."
git add .
echo

# 检查是否有未提交的更改
if git diff --cached --quiet; then
    echo "没有需要提交的更改。"
    echo
else
    # 获取提交信息
    read -p "请输入提交信息（或直接回车使用默认信息）: " commit_msg
    if [ -z "$commit_msg" ]; then
        commit_msg="feat: 更新代码 - 支持MinerU API和通义千问API"
    fi
    
    echo
    echo "正在创建提交..."
    git commit -m "$commit_msg"
    echo "提交完成！"
    echo
fi

# 检查远程仓库
if ! git remote get-url origin &>/dev/null; then
    echo "===================================="
    echo "请先配置远程仓库"
    echo "===================================="
    echo
    echo "1. 在GitHub上创建新仓库"
    echo "2. 运行以下命令添加远程仓库:"
    echo "   git remote add origin https://github.com/YOUR_USERNAME/literature-reader.git"
    echo
    read -p "或者现在输入GitHub仓库URL: " github_url
    if [ -n "$github_url" ]; then
        git remote add origin "$github_url"
        echo "远程仓库已添加！"
    else
        echo "未设置远程仓库，跳过推送。"
        exit 0
    fi
    echo
fi

# 设置main分支
git branch -M main 2>/dev/null

# 推送到GitHub
echo "===================================="
echo "正在推送到GitHub..."
echo "===================================="
echo
git push -u origin main

if [ $? -eq 0 ]; then
    echo
    echo "===================================="
    echo "推送成功！"
    echo "===================================="
else
    echo
    echo "===================================="
    echo "推送失败，请检查："
    echo "1. 网络连接"
    echo "2. GitHub认证"
    echo "3. 远程仓库URL是否正确"
    echo "===================================="
fi

