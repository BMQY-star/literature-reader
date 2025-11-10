@echo off
REM GitHub推送脚本（Windows）
REM 使用前请先在GitHub上创建仓库

echo ====================================
echo 文献阅读器 - GitHub推送脚本
echo ====================================
echo.

REM 检查Git是否初始化
if not exist .git (
    echo 正在初始化Git仓库...
    git init
    echo Git仓库初始化完成！
    echo.
)

REM 添加所有文件
echo 正在添加文件到暂存区...
git add .
echo.

REM 检查是否有未提交的更改
git diff --cached --quiet
if %errorlevel% equ 0 (
    echo 没有需要提交的更改。
    echo.
) else (
    echo 请输入提交信息（或直接回车使用默认信息）:
    set /p commit_msg="提交信息: "
    if "!commit_msg!"=="" set commit_msg=feat: 更新代码 - 支持MinerU API和通义千问API
    
    echo.
    echo 正在创建提交...
    git commit -m "!commit_msg!"
    echo 提交完成！
    echo.
)

REM 检查远程仓库
git remote get-url origin >nul 2>&1
if %errorlevel% neq 0 (
    echo ====================================
    echo 请先配置远程仓库
    echo ====================================
    echo.
    echo 1. 在GitHub上创建新仓库
    echo 2. 运行以下命令添加远程仓库:
    echo    git remote add origin https://github.com/YOUR_USERNAME/literature-reader.git
    echo.
    echo 或者运行以下命令设置远程仓库:
    set /p github_url="GitHub仓库URL: "
    if not "!github_url!"=="" (
        git remote add origin "!github_url!"
        echo 远程仓库已添加！
    ) else (
        echo 未设置远程仓库，跳过推送。
        pause
        exit /b
    )
    echo.
)

REM 设置main分支
git branch -M main 2>nul

REM 推送到GitHub
echo ====================================
echo 正在推送到GitHub...
echo ====================================
echo.
git push -u origin main

if %errorlevel% equ 0 (
    echo.
    echo ====================================
    echo 推送成功！
    echo ====================================
) else (
    echo.
    echo ====================================
    echo 推送失败，请检查：
    echo 1. 网络连接
    echo 2. GitHub认证
    echo 3. 远程仓库URL是否正确
    echo ====================================
)

echo.
pause

