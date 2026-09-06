@echo off
setlocal
chcp 65001 >nul
title Harbor 结果分析

cd /d "%~dp0"
echo 正在启动 Harbor 结果分析...
echo 启动后会自动打开浏览器。使用期间请勿关闭此窗口。
echo.

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-trajectory-portal.ps1" %*
set "portal_exit_code=%ERRORLEVEL%"

if not "%portal_exit_code%"=="0" (
    echo.
    echo Portal 启动失败，退出代码：%portal_exit_code%
    echo 请根据上方提示检查 Python、harbor-jobs 目录或端口占用情况。
    pause
)

endlocal & exit /b %portal_exit_code%
