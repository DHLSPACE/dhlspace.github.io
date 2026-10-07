import traceback
from pathlib import Path

try:
    from app import main
    main()
except Exception as exc:
    log=Path(__file__).resolve().parent/'启动错误.txt'
    log.write_text(traceback.format_exc(),encoding='utf-8')
    import ctypes
    ctypes.windll.user32.MessageBoxW(0,str(exc)+'\n\n详细记录：'+str(log),'研招助手启动失败',0x10)
