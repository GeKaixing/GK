# Contributing Guide

感谢参与 Gekaixing 项目贡献。

## 开发环境

- Node.js 版本请与项目要求保持一致
- 使用 npm 安装依赖
- 本地开发前复制 `.env.example` 到本地环境配置

## 开发流程

1. Fork 或创建开发分支
2. 完成功能开发或 Bug 修复
3. 运行检查：

```bash
npx tsc --noEmit
npm run test
npm run build
```

4. 提交 Pull Request

## 代码规范

- 使用 TypeScript
- 保持已有目录结构
- 新增功能需要补充测试
- 避免提交敏感信息和环境变量
- API 修改需要同步更新文档

## Commit 规范

推荐格式：

```
type: description
```

例如：

```
fix: resolve profile authorization issue
feat: add notification support
```

## Pull Request 要求

PR 应包含：

- 修改目的
- 影响范围
- 测试结果
- 相关 Issue 编号

感谢你的贡献。