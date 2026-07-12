# PyInstaller spec -> single-file pixelgate-bridge.exe
# Build:  pyinstaller pixelgate-bridge.spec
# Output: dist/pixelgate-bridge.exe  (double-click; serves on 127.0.0.1:7660)

from PyInstaller.utils.hooks import collect_submodules

hidden = (
    collect_submodules("uvicorn")
    + collect_submodules("fastapi")
    + ["anyio", "requests", "pydantic"]
)

a = Analysis(
    ["app.py"],
    pathex=[],
    binaries=[],
    datas=[],
    hiddenimports=hidden,
    hookspath=[],
    runtime_hooks=[],
    excludes=["PIL", "numpy", "tkinter"],
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="pixelgate-bridge",
    console=True,
    upx=False,
)
