# FlashCat 小程序 RUM SDK

FlashCat 小程序 RUM（Real User Monitoring）SDK，用于监控小程序的性能、错误和用户行为。

## 特性

- 🚀 **自动追踪**：自动监控页面访问、用户交互、网络请求、错误和性能
- 📊 **丰富指标**：采集完整的 RUM 数据，包括页面加载时间、请求耗时等
- 🎯 **灵活配置**：支持采样率、功能开关、数据过滤等配置
- 💡 **易于使用**：类似 DataFlux 的单例导出方式，无需手动关联事件
- 📦 **TypeScript**：完整的类型定义支持

## 快速开始

### 安装

```bash
# 从本地 tgz 包安装（开发阶段）
npm install /path/to/flashcatcloud-miniprogram-rum.tgz

# 或从 npm 仓库安装（发布后）
npm install @flashcatcloud/miniprogram-rum
```

安装后在**微信开发者工具**中点击 **工具 → 构建 npm**。

### 使用

```javascript
// app.js
const { flashcatRum } = require("@flashcatcloud/miniprogram-rum");

// 在 App() 之前初始化
flashcatRum.init({
  clientToken: "your-client-token",
  applicationId: "your-app-id",
  // 方式一：使用默认 FlashCat 站点（推荐）
  // 默认上报到：https://browser.flashcat.cloud/api/v2/rum

  // 方式二：自定义站点域名
  // site: 'custom.flashcat.cloud',  // 上报到：https://custom.flashcat.cloud/api/v2/rum

  // 方式三：通过代理转发数据
  // proxy: 'https://proxy.example.com/path',  // 拼接为：{proxy}?ddforward={encodedPath}

  service: "my-miniprogram",
  env: "production",
  version: "1.0.0",
});

App({
  onLaunch() {
    console.log("App launched");
  },
});
```

就这么简单！SDK 会自动追踪：

- ✅ 页面访问和生命周期
- ✅ 用户交互（点击、长按等）
- ✅ 网络请求（wx.request 等）
- ✅ 错误和异常
- ✅ 性能指标

### 手动上报

除了自动追踪，还可以手动上报业务事件：

```javascript
const { flashcatRum } = require("@flashcatcloud/miniprogram-rum");

// 上报自定义事件
flashcatRum.addCustomEvent("商品购买", {
  productId: "12345",
  price: 99.99,
});

// 上报用户操作
flashcatRum.addAction("点击分享按钮", "share");

// 上报错误
flashcatRum.addError("加载失败", "custom");

// 上报性能指标
flashcatRum.addTiming("数据加载完成", 1500);

// 设置用户信息
flashcatRum.setUser({
  id: "user-123",
  name: "Zhang San",
});

// 设置全局上下文
flashcatRum.setGlobalContext({
  platform: "wechat",
  channel: "official",
});
```

## 核心概念

### 自动追踪原理

SDK 通过以下机制实现自动追踪，**无需手动关联 APP 事件**：

1. **重写全局 `Page` 函数** - 自动拦截所有页面生命周期（onLoad、onShow、onHide 等）
2. **拦截事件处理函数** - 自动捕获用户交互（tap、longpress 等）
3. **封装平台 API** - 自动监听网络请求（wx.request）
4. **监听 App 生命周期** - 自动捕获应用前后台切换、错误等

所有这些都在 `flashcatRum.init()` 时自动完成，开发者无需编写额外代码。

## 配置选项

| 配置项              | 类型     | 必填 | 默认值                   | 说明                                                                      |
| ------------------- | -------- | ---- | ------------------------ | ------------------------------------------------------------------------- |
| `clientToken`       | string   | ✅   | -                        | 客户端 Token                                                              |
| `applicationId`     | string   | ✅   | -                        | 应用 ID                                                                   |
| `site`              | string   | ❌   | `browser.flashcat.cloud` | FlashCat 站点域名，自动拼接为 `https://{site}/api/v2/rum`                 |
| `proxy`             | string   | ❌   | -                        | 代理地址，SDK 拼接为 `{proxy}?ddforward={encodedPath}`（优先级高于 site） |
| `service`           | string   | ❌   | -                        | 服务名称                                                                  |
| `env`               | string   | ❌   | -                        | 环境（dev/test/prod）                                                     |
| `version`           | string   | ❌   | -                        | 应用版本号                                                                |
| `sessionSampleRate` | number   | ❌   | 100                      | 会话采样率（0-100）                                                       |
| `flushInterval`     | number   | ❌   | 15000                    | 上报间隔（毫秒）                                                          |
| `trackPages`        | boolean  | ❌   | true                     | 是否追踪页面                                                              |
| `trackActions`      | boolean  | ❌   | true                     | 是否追踪用户交互                                                          |
| `trackRequests`     | boolean  | ❌   | true                     | 是否追踪网络请求                                                          |
| `trackErrors`       | boolean  | ❌   | true                     | 是否追踪错误                                                              |
| `trackPerformance`  | boolean  | ❌   | true                     | 是否追踪性能                                                              |
| `debug`             | boolean  | ❌   | false                    | 是否开启调试模式                                                          |
| `beforeSend`        | function | ❌   | -                        | 数据过滤钩子                                                              |

## API 文档

### 初始化

- `flashcatRum.init(config)` - 初始化 SDK

### 手动上报

- `flashcatRum.startPage(name?)` - 手动上报页面访问
- `flashcatRum.addAction(name, type?)` - 手动上报用户操作
- `flashcatRum.addError(message, source?, stack?)` - 手动上报错误
- `flashcatRum.addTiming(name, value?)` - 手动上报性能指标
- `flashcatRum.addCustomEvent(name, context?)` - 上报自定义事件

### 上下文管理

- `flashcatRum.setGlobalContext(context)` - 设置全局上下文
- `flashcatRum.setUser(context)` - 设置用户信息

### 会话管理

- `flashcatRum.stopSession()` - 结束当前会话
- `flashcatRum.getInitConfiguration()` - 获取初始化配置

## 调试

如果接入后没有数据上报，开启调试模式：

```javascript
flashcatRum.init({
  // ...
  debug: true, // 开启调试模式，会在控制台输出详细日志
  flushInterval: 5000, // 可选：缩短上报间隔方便测试
});
```

查看控制台中 `[FlashCat RUM]` 开头的日志来诊断问题。

详细的调试指南请参考 [调试文档](./docs/DEBUG.md)。

## 文档

- [完整使用文档](./docs/USAGE.md) - 详细的使用指南、API 说明和最佳实践
- [Endpoint 配置](./docs/ENDPOINT_CONFIGURATION.md) - 上报地址配置详解
- [调试指南](./docs/DEBUG.md) - 数据上报问题排查和调试方法
- [架构设计](./docs/ARCHITECTURE.md) - SDK 架构和设计文档

## 开发

```bash
# 安装依赖
yarn install

# 构建
yarn build

# 打包（用于本地测试）
yarn pack:all
```

打包后的 `.tgz` 文件位于各个 package 目录下：

- `packages/core/flashcatcloud-miniprogram-core.tgz`
- `packages/miniprogram-core/flashcatcloud-miniprogram-platform.tgz`
- `packages/miniprogram-rum/flashcatcloud-miniprogram-rum.tgz`

## License

MIT
