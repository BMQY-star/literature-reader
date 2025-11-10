@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ====================================
echo 删除GitHub上的无用文件
echo ====================================
echo.

echo 正在删除以下文件：
echo - git_push.bat
echo - git_push.py
echo - verify_push.bat
echo - GITHUB_SETUP.md
echo - QUICK_START.md
echo - START_GUIDE.md
echo - GITHUB_PUSH_GUIDE.md
echo.

echo [1/4] 从Git索引中删除文件...
git rm --cached git_push.bat 2>nul
git rm --cached git_push.py 2>nul
git rm --cached verify_push.bat 2>nul
git rm --cached GITHUB_SETUP.md 2>nul
git rm --cached QUICK_START.md 2>nul
git rm --cached START_GUIDE.md 2>nul
git rm --cached GITHUB_PUSH_GUIDE.md 2>nul
echo ✓ 完成
echo.

echo [2/4] 添加所有更改...
git add -A
echo ✓ 完成
echo.

echo [3/4] 提交更改...
git commit -m "chore: 删除GitHub上的临时脚本和重复文档文件"
if %errorlevel% neq 0 (
    echo 警告: 可能没有需要提交的更改
)
echo.

echo [4/4] 推送到GitHub...
git push origin main
if %errorlevel% equ 0 (
    echo.
    echo ====================================
    echo ✓ 推送成功！GitHub上的无用文件已删除
    echo ====================================
) else (
    echo.
    echo ====================================
    echo ✗ 推送失败，请检查网络连接和GitHub认证
    echo ====================================
)
echo.
pause

