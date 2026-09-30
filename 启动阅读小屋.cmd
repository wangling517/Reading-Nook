@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 未找到 Node.js。请安装 Node.js 后重新打开，或将站点文件部署到 HTTPS 静态网站。
  pause
  exit /b 1
)
echo 请在浏览器打开 http://127.0.0.1:4177
node server.mjs
pause
