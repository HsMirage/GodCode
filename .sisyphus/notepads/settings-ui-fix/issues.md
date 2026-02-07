# Settings UI Fix - 遗留问题

## 环境问题（非本任务范围）

### 1. PostgreSQL 初始化失败

**问题**: 嵌入式 PostgreSQL 在 WSL 环境中无法启动

```
libicuuc.so.60: cannot open shared object file: No such file or directory
```

**影响**: 开发服务器可以启动，但数据库功能不可用

**解决方案**:

```bash
# Ubuntu/Debian
sudo apt-get install libicu60

# 或使用较新版本
sudo apt-get install libicu-dev
```

### 2. Playwright 浏览器未安装

**问题**: Chromium 未安装，需要 sudo 权限

**解决方案**:

```bash
sudo npx playwright install chromium --with-deps
```

---

## 待用户验证

以下项目已通过构建验证，但需要用户在 Windows 环境中手动确认 UI：

- [ ] 编辑按钮实际可见
- [ ] 删除按钮实际可见
- [ ] 添加模型按钮实际可见
- [ ] 点击添加模型后输入框出现

---

记录时间: 2026-02-06
