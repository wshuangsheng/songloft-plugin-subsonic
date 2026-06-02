# HARNESS

## 项目类型
Songloft Subsonic Plugin (Node.js/TypeScript)

## 构建命令
`npm run build`

## 编译启动诊断
- **WorkingDirectory**: `D:\Code\github\songloft\songloft-plugin-subsonic`
- **RecommendedTerminal**: powershell / bash
- **CanRunBuildHere**: true
- **BuildCommand**: `npm run build`
- **FailureEvidence**: 记录完整命令、工作目录、终端类型、退出码、前 50 行和最后 100 行构建日志

## 快速验证命令
`npm run build`

## Bugfix 验证命令
`npm run validate`

## 完整验证命令
`npm run build && npm run validate`

## 高风险目录
- `src/router.ts`: 容易引入与前端的 API 兼容问题

## 禁改区域
- .git: version control metadata

## 自动识别候选
- Subsonic Client Integration

## 需人工确认
- `bugfix` 验证命令仍缺失，需人工补齐可信入口
- build / quick / full 命令映射不完整，需人工确认最终入口

