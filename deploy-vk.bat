@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
echo === Lumi Pop: загрузка игры на хостинг VK ===
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo Не найден Node.js. Установите LTS-версию с https://nodejs.org и запустите файл снова.
  pause
  exit /b 1
)
set PY=
where python >nul 2>nul && set PY=python
if not defined PY where py >nul 2>nul && set PY=py
if defined PY (
  echo Сборка игры...
  %PY% build.py >nul
  if errorlevel 1 (
    echo Сборка не удалась. Загружается последняя готовая версия из docs\vk.
    if not exist dist\vk mkdir dist\vk
    xcopy /e /y /q docs\vk dist\vk >nul
  )
) else (
  echo Python не найден - загружается готовая версия из docs\vk.
  if not exist dist\vk mkdir dist\vk
  xcopy /e /y /q docs\vk dist\vk >nul
)
echo.
echo Загрузка на хостинг VK. При первом запуске VK попросит подтвердить вход -
echo следуйте подсказкам в этом окне.
echo.
call npx --yes @vkontakte/vk-miniapps-deploy
echo.
pause
