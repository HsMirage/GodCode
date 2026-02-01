# Issues & Gotchas

## Known Issues

暂无

## Potential Gotchas

- Windows wmic 命令输出格式需要严格解析 (CSV 格式，注意空行和空路径)
- vitest mock 必须使用与实现文件相同的 import specifier
- 删除数据目录前必须验证路径在 userData 下，防止误删
- sleepFn 在 Attempt 1 之前**不调用**，仅在失败后调用 (共 2 次)

## Platform-Specific Notes

- **Windows**: 使用 wmic + taskkill
- **macOS/Linux**: 进程清理功能为 no-op，仅记录警告
