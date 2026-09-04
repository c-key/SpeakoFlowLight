@echo off
rem Run cargo (or any command) with a working MSVC x64 build environment.
rem
rem     scripts\dev-env.win.bat cargo check
rem     scripts\dev-env.win.bat cargo test
rem     scripts\dev-env.win.bat bun tauri dev
rem
rem Every path below is machine-specific -- adjust the five variables, then the
rem rest follows. BUILD.md explains why each one is needed; the short version:
rem
rem   * MSVC's bin goes FIRST on PATH. Git Bash ships its own `link`, and cargo
rem     picking that one up fails as LNK1104.
rem   * This does not call vcvars64.bat on purpose. A Visual Studio install
rem     without the C++ workload has no vcvarsall.bat at all, and invoked from
rem     Git Bash vcvars64 fails looking for vswhere.exe, because
rem     `ProgramFiles(x86)` does not survive the shell hand-off.
rem   * CMAKE_GENERATOR=Ninja: left alone, cmake picks the newest Visual Studio
rem     instance it can find and fails if that one lacks the C++ workload; and
rem     under a VS generator, ggml's nested vulkan-shaders-gen project
rem     re-configures from inside MSBuild and finds no C compiler.
rem   * CARGO_TARGET_DIR must be SHORT. vulkan-shaders-gen nests its build
rem     directory deep enough that the PDB path in its compiler probe crosses
rem     260 characters, which MSVC reports as the misleading
rem     "C1041: cannot open program database ... please use /FS".

set "VCTOOLS=C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\14.44.35207"
set "SDKROOT=C:\Program Files (x86)\Windows Kits\10"
set "SDKVER=10.0.26100.0"
set "SCOOP=%USERPROFILE%\scoop"
set "CARGO_TARGET_DIR=C:\ct\sfl"

set "PATH=%VCTOOLS%\bin\Hostx64\x64;%SDKROOT%\bin\%SDKVER%\x64;%SCOOP%\apps\vulkan\current\Bin;%PATH%;%SCOOP%\apps\rust\current\bin;%SCOOP%\shims"
set "INCLUDE=%VCTOOLS%\include;%SDKROOT%\Include\%SDKVER%\ucrt;%SDKROOT%\Include\%SDKVER%\um;%SDKROOT%\Include\%SDKVER%\shared;%SDKROOT%\Include\%SDKVER%\winrt;%SDKROOT%\Include\%SDKVER%\cppwinrt"
set "LIB=%VCTOOLS%\lib\x64;%SDKROOT%\Lib\%SDKVER%\ucrt\x64;%SDKROOT%\Lib\%SDKVER%\um\x64"
set "LIBPATH=%VCTOOLS%\lib\x64"
set "LIBCLANG_PATH=%SCOOP%\apps\llvm\current\bin"
set "VULKAN_SDK=%SCOOP%\apps\vulkan\current"
set "CMAKE_GENERATOR=Ninja"
set "CFLAGS=/FS"
set "CXXFLAGS=/FS"

rem `bun tauri dev` wants the repo root; cargo wants the crate. Pick per command
rem so both spellings work without a --manifest-path.
cd /d "%~dp0.."
if /i "%~1"=="cargo" cd src-tauri
%*
