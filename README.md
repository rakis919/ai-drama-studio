# AI Drama Studio + MV Studio

两个 Windows 本地 AI 创作平台的源码快照（2026-11-02）。

## 目录

- `DramaStudio/`：短剧平台，Node.js，端口 4173。
- `MVStudio/`：MV 平台，Python，端口 4175。
- `GptWork/`：平台使用的辅助源文件，保留原始相对路径。
- `examples/`：不含真实创作内容的空白配置示例。

## 运行

此仓库不包含模型与完整运行环境。代码保留现有 Windows 部署路径 `D:/AIPlatform` 与 `T:/AI/ComfyUI_1.3.5`。恢复时将对应目录放回这些位置，或调整代码中的绝对路径。不要直接覆盖正在运行的平台，请先备份。

需要 Node.js 22+、Python 3.11+、原有 ComfyUI、模型、自定义节点、FFmpeg，以及相应音频和视频生成环境。辅助源文件已随仓库收录；未解析的外部路径见 `SOURCE_MANIFEST.json`。

```powershell
node D:/AIPlatform/DramaStudio/server.cjs
python D:/AIPlatform/MVStudio/server.py
```

访问 `http://127.0.0.1:4173` 和 `http://127.0.0.1:4175`。通常先启动短剧平台，其云设备接口供 MV 复用。

## 数据范围

`examples` 仅含空白示例，不包含真实项目配置、剧本、歌词、人物、素材 ID、内部路径或生成履历，不是可还原实际项目的备份。AI 模型、Python/ComfyUI 环境、生成图片/音频/视频、密钥、账户设置、日志及旧备份未上传。

原素材需另行保留：短剧为 `D:/AIPlatform/Output/DramaStudio`，MV 为 `D:/AIPlatform/MVStudio/data/<project-id>`。这些素材不存在时，配置里的本地素材 ID 无法解析。

云端账户需重新配置自己的密钥与实例，不使用任何真实账户的默认连接信息。请勿提交密钥、密码或 `.env` 文件。试验生成记录不代表所有画面、对白或身份准确度已通过验收。

实际项目配置已单独保存在本地备份中，未公开上传。
