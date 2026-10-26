@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
cd /d "%~dp0"
title Lumi Pop - отправка на GitHub

where git >nul 2>nul
if errorlevel 1 (
  echo Git не найден. Установите Git for Windows: https://git-scm.com/download/win
  pause
  exit /b 1
)

if not exist .git (
  git init
  git branch -M main
)

git config user.name >nul 2>nul
if errorlevel 1 (
  set /p GNAME=Ваше имя для коммитов: 
  git config user.name "!GNAME!"
)
git config user.email >nul 2>nul
if errorlevel 1 (
  set /p GMAIL=Ваш email как на GitHub: 
  git config user.email "!GMAIL!"
)

git remote get-url origin >nul 2>nul
if errorlevel 1 (
  git remote add origin https://github.com/Sacredz58/lumipop.git
  echo Адрес репозитория: https://github.com/Sacredz58/lumipop.git
)

rem --- пересобрать архивы для площадок в build\, если есть Python ---
set PY=
where python >nul 2>nul && set PY=python
if not defined PY where py >nul 2>nul && set PY=py
if defined PY (
  echo Собираю архивы для площадок...
  !PY! build.py >nul
  if errorlevel 1 (
    echo Сборка не удалась, отправляю без пересборки.
  ) else (
    echo Архивы в build\ обновлены.
  )
) else (
  echo Python не найден, архивы в build\ не пересобраны.
)

echo.
set MSG=
set /p MSG=Что изменилось (Enter = "Обновление игры"): 
if "!MSG!"=="" set MSG=Обновление игры

git add -A
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "!MSG!"
) else (
  echo Новых изменений нет, коммит не нужен.
)

rem --- забрать изменения с GitHub, если они там есть ---
git ls-remote --exit-code --heads origin main >nul 2>nul
if not errorlevel 1 git pull --rebase origin main

git push -u origin main
if errorlevel 1 (
  echo.
  echo Не получилось отправить. Если просят вход, войдите в GitHub в браузере и запустите файл ещё раз.
) else (
  echo.
  echo Готово: код загружен на https://github.com/Sacredz58/lumipop
)
pause
