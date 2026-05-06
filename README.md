# FlashCat 小程序 RUM SDK

FlashCat 小程序 RUM（Real User Monitoring）SDK，用于监控小程序的性能、错误和用户行为。

## 特性

- 🚀 **自动追踪**：自动监控页面访问、用户交互、网络请求、错误和性能
- 📊 **丰富指标**：采集完整的 RUM 数据，包括页面加载时间、请求耗时等
- 🎯 **灵活配置**：支持采样率、功能开关、数据过滤等配置
- 💡 **易于使用**：类似 DataFlux 的单例导出方式，无需手动关联事件
- 📦 **TypeScript**：完整的类型定义支持

## npm packages

本仓库包含以下小程序 SDK 包：

| 包名 | npm | 说明 |
| ---- | --- | ---- |
| core | `@flashcatcloud/miniprogram-core` | SDK 通用核心能力，包括配置、会话、传输和批量上报 |
| miniprogram-platform | `@flashcatcloud/miniprogram-platform` | 小程序平台适配层，包括网络请求、生命周期和平台 API 封装 |
| miniprogram-rum | `@flashcatcloud/miniprogram-rum` | 小程序 RUM 入口包，业务方通常只需要安装这个包 |

## 快速开始

### 安装

```bash
# 从本地 tgz 包安装（开发阶段）
npm install \
  /path/to/flashcatcloud-miniprogram-core.tgz \
  /path/to/flashcatcloud-miniprogram-platform.tgz \
  /path/to/flashcatcloud-miniprogram-rum.tgz

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
- `packages/miniprogram-platform/flashcatcloud-miniprogram-platform.tgz`
- `packages/miniprogram-rum/flashcatcloud-miniprogram-rum.tgz`

## 发包流程

小程序 SDK 的发包流程参考 web sdk，但小程序没有 CDN bundle，因此不需要执行 web 端的 OSS/CDN 上传步骤。核心流程是：统一版本号、构建测试、tgz 验包、发布前检查、按依赖顺序发布 npm 包。

### 1. 发布前检查

正式发布前先完成本地构建、测试和 tgz 验包：

```bash
yarn install
yarn build
yarn test
yarn pack:all
```

用生成的 tgz 在 demo 小程序里安装验证。由于 RUM 包依赖 core 和 platform，开发阶段建议三个 tgz 一起安装，避免 npm 去远端仓库解析内部依赖：

```bash
cd /path/to/wechat-miniprogram-demo
npm install \
  /path/to/fc-sdk-wechat-miniprogram/packages/core/flashcatcloud-miniprogram-core.tgz \
  /path/to/fc-sdk-wechat-miniprogram/packages/miniprogram-platform/flashcatcloud-miniprogram-platform.tgz \
  /path/to/fc-sdk-wechat-miniprogram/packages/miniprogram-rum/flashcatcloud-miniprogram-rum.tgz
```

安装完成后在**微信开发者工具**中点击 **工具 → 构建 npm**。

### 2. 验证 tgz 包

先确认 demo 入口能加载本地包，并开启 debug 缩短反馈周期：

```javascript
const { flashcatRum } = require("@flashcatcloud/miniprogram-rum");

flashcatRum.init({
  clientToken: "your-client-token",
  applicationId: "your-app-id",
  service: "wechat-miniprogram-demo",
  env: "test",
  version: "0.1.0",
  debug: true,
  flushInterval: 5000,
});
```

重新编译运行小程序，检查控制台和 Network：

- SDK 可以正常初始化并完成上报
- 不出现 `Cannot find module "@flashcatcloud/miniprogram-rum"` 或小程序 npm 构建失败
- 控制台能看到 `[FlashCat RUM] ✅ 初始化成功`、`[FlashCat RUM] 📊 收集到事件`、`[FlashCat RUM] 📤 发送数据`
- 页面访问、用户交互、错误、性能和 `wx.request` 资源事件符合预期
- Network 中能看到发往 `/api/v2/rum` 的上报请求，服务端返回成功状态码
- `trackPages`、`trackActions`、`trackRequests`、`trackErrors` 等开关生效
- SDK 自己的 intake 上报请求不会被采集成 resource
- 如果使用代理上报，确认 `proxy` 拼接和服务端转发链路可用

建议至少执行以下手工用例：

| 验证项 | 操作 | 预期 |
| ------ | ---- | ---- |
| 初始化 | 打开小程序首页 | 控制台出现初始化成功日志 |
| 页面事件 | 进入或切换页面 | 采集到 `view` 事件 |
| 用户行为 | 点击 demo 中的按钮或列表项 | 采集到 `action` 事件 |
| 网络请求 | 进入请求测试页或触发 `wx.request` | 采集到业务请求对应的 `resource` 事件 |
| 手动错误 | 调用 `flashcatRum.addError()` 或进入错误测试页 | 采集到 `error` 事件 |
| 自定义事件 | 调用 `flashcatRum.addCustomEvent()` | 采集到 `custom` 事件 |
| 上报过滤 | 等待一次 batch flush | intake 上报请求本身不会再次生成 `resource` 事件 |
| 功能开关 | 设置 `trackPages: false` 后重新编译 | 页面切换不再自动产生 `view` 事件 |
| 代理上报 | 设置 `proxy` 后重新触发上报 | 请求发送到代理地址，代理能转发到真实 intake |

### 3. 准备正式 npm 包

使用 release 脚本统一更新三个子包版本号和内部依赖版本：

```bash
yarn release:version 0.1.0
```

发布前需要确认：

- 确认版本号一致，例如 `0.1.0`
- 确认内部依赖版本和本次发布版本一致：
  - `@flashcatcloud/miniprogram-platform` 依赖 `@flashcatcloud/miniprogram-core`
  - `@flashcatcloud/miniprogram-rum` 依赖 `@flashcatcloud/miniprogram-core` 和 `@flashcatcloud/miniprogram-platform`
- 确认 `main`、`types`、`miniprogram` 和 `files` 均指向 `dist`
- 确认三个子包都配置了 `publishConfig: { "access": "public" }`

可以用脚本做发布前检查：

```bash
yarn build
yarn release:check
```

### 4. 发布顺序

三个包存在依赖关系，按以下顺序发布：

```bash
yarn release:publish
```

脚本会先执行 `yarn build` 和 `yarn release:check`，然后按顺序发布：

1. `@flashcatcloud/miniprogram-core`
2. `@flashcatcloud/miniprogram-platform`
3. `@flashcatcloud/miniprogram-rum`

正式发布需要提供 npm token：

```bash
NPM_TOKEN=xxxx yarn release:publish
```

如果只是内部预发或 dry run：

```bash
yarn release:dry-run
```

合并到主分支后，也可以通过 GitHub Actions 发布：

- 推送 `v*` tag 会自动触发 npm 发布
- 在 Actions 中手动执行 `Publish NPM` workflow，并输入 `yes` 确认发布
- workflow 需要配置仓库 secret：`NPM_TOKEN`

### 5. 发布后验证

发布完成后，在 demo 或业务测试项目中安装正式 npm 包：

```bash
npm install @flashcatcloud/miniprogram-rum
```

重新在**微信开发者工具**中执行 **构建 npm**，再完成一次端到端验证：

- npm 安装和小程序 npm 构建成功
- `require("@flashcatcloud/miniprogram-rum")` 可以正常加载
- RUM 数据能进入 FlashCat 控制台
- README 中的快速开始示例可直接运行

发布完成后同步更新版本记录、接入文档和示例项目依赖版本。

## License

MIT
