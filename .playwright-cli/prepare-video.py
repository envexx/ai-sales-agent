from pathlib import Path
import base64
source=Path(r'C:\Users\HP\Videos\Screen Recordings\Screen Recording 2026-10-06 230519.mp4')
html='<body style="margin:0;background:#eee"><video id="v" muted preload="auto" src="data:video/mp4;base64,'+base64.b64encode(source.read_bytes()).decode()+'"></video></body>'
Path('.playwright-cli/video-glitter.html').write_text(html,encoding='utf-8')
