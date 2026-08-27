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
  // 可选：启用 RUM 远程配置
  remoteConfigurationEnabled: true,
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

### Action 命名

自动采集的 action（tap / longpress / longtap）按以下优先级确定名称：

1. 触发元素的 `data-name`（其次 `data-content`、`data-type`）
2. `mark:name`（微信 [mark 机制](https://developers.weixin.qq.com/miniprogram/dev/framework/view/wxml/event.html#mark)，事件冒泡路径上的标记会聚合）
3. 元素 `id`
4. 事件委托场景下 `event.target` 的 dataset / id

都取不到时 action 名称显示为 `unknown`。小程序事件对象拿不到元素文本，建议给关键交互元素加 `data-name`：

```html
<button bindtap="handleBuy" data-name="购买按钮">购买</button>
```

业务关键动作也可以直接用 `flashcatRum.addAction('purchase_submitted')` 手动上报。

## 配置选项

| 配置项              | 类型     | 必填 | 默认值                   | 说明                                                                      |
| ------------------- | -------- | ---- | ------------------------ | ------------------------------------------------------------------------- |
| `clientToken`       | string   | ✅   | -                        | 客户端 Token                                                              |
| `applicationId`     | string   | ✅   | -                        | 应用 ID                                                                   |
| `site`              | string   | ❌   | `browser.flashcat.cloud` | FlashCat 站点域名，自动拼接为 `https://{site}/api/v2/rum`                 |
| `proxy`             | string / function | ❌ | -                    | 代理地址或 URL 构建函数（优先级高于 site）                                |
| `service`           | string   | ❌   | -                        | 服务名称                                                                  |
| `env`               | string   | ❌   | -                        | 环境（dev/test/prod）                                                     |
| `version`           | string   | ❌   | -                        | 应用版本号                                                                |
| `sessionSampleRate` | number   | ❌   | 100                      | 会话采样率（0-100）                                                       |
| `remoteConfigurationEnabled` | boolean | ❌ | false             | 是否启用远程配置（会话采样率与 `custom`）                                 |
| `beforeSampling`    | function | ❌   | -                        | 创建新 Session 前同步调整采样率                                           |
| `flushInterval`     | number   | ❌   | 15000                    | 上报间隔（毫秒）                                                          |
| `trackPages`        | boolean  | ❌   | true                     | 是否追踪页面                                                              |
| `trackActions`      | boolean  | ❌   | true                     | 是否追踪用户交互                                                          |
| `trackRequests`     | boolean  | ❌   | true                     | 是否追踪网络请求                                                          |
| `trackErrors`       | boolean  | ❌   | true                     | 是否追踪错误                                                              |
| `trackPerformance`  | boolean  | ❌   | true                     | 是否追踪性能                                                              |
| `debug`             | boolean  | ❌   | false                    | 是否开启调试模式                                                          |
| `beforeSend`        | function | ❌   | -                        | 数据过滤钩子                                                              |

### 远程配置

设置 `remoteConfigurationEnabled: true` 后，SDK 会在初始化时同步读取上次缓存的有效配置，并在初始化完成后异步请求一次 `/api/v2/rum/config`。配置请求不阻塞初始化和事件采集，也不会被记录为 RUM resource 或 error 事件。

远程配置只消费两个字段：`rum.sessionSampleRate` 和顶层 `custom`；追踪采样率、回放采样率和隐私等级等字段会被忽略。

会话采样只在创建 Session 时执行一次：

- 冷启动已有有效缓存时，首个新 Session 直接使用缓存中的采样率。
- 没有缓存时，首个 Session 使用初始化的 `sessionSampleRate`；随后拉取到的新值只影响之后创建的 Session。
- 当前 Session 不会因配置拉取成功而重新抽签。调用 `flashcatRum.stopSession()` 后，下一次事件创建的新 Session 会使用最新配置。
- 配置接口不可用、响应非法或缓存不可读时，SDK 安全回退到初始化采样率，不影响正常采集。

远程配置沿用现有 `site` 或 `proxy`。因此直连模式无需额外添加小程序合法域名；代理模式需确保现有代理同时转发 `/api/v2/rum/config`，并建议透传 ETag 以使用 `304 Not Modified`。SDK 只在初始化时拉取（失败时会进行有限重试），不会定时轮询，也不会在创建新 Session 时额外请求。

#### 读取 custom

服务端响应的顶层 `custom` 供宿主自行决策，不参与 RUM 事件字段：

```javascript
const custom = flashcatRum.getRemoteConfig();
// 未启用远程配置、尚未拉取成功且无缓存、或服务端未下发 custom 时返回 undefined
if (custom?.featureFlags?.newCart) {
  // ...
}
```

`custom` 只接受对象；非对象会被安全忽略，且不影响会话采样。每次调用都会返回一份副本，修改返回值不会影响 SDK 内部状态。旧版本写入的缓存仍可继续用于采样，只是 `getRemoteConfig()` 返回 `undefined`。

`custom` 的生命周期与采样快照一致：200 响应中缺少 `custom` 会清除已有值，`304 Not Modified` 保留缓存值，服务端下发 `enabled: false` 会同时清除 `custom` 和本地缓存。

#### 自定义采样决策

`beforeSampling` 在创建新 Session、执行抽签之前同步调用，可以基于远程 `custom` 覆盖本次采样率：

```javascript
flashcatRum.init({
  // ...
  remoteConfigurationEnabled: true,
  beforeSampling: ({ sessionSampleRate, custom }) => {
    // 返回 0-100 的数字覆盖采样率；返回 undefined 表示不修改
    if (custom?.vipUsers?.includes(getUserId())) {
      return 100;
    }
    return sessionSampleRate;
  },
});
```

- `sessionSampleRate` 是本次将要使用的采样率：有远程值时为远程值，否则为初始化值。
- `custom` 是远程 `custom` 的副本，没有时为 `null`。
- 回调抛错、返回非有限数字或超出 `0-100` 范围时，回退到传入的 `sessionSampleRate`。

#### 强制采集当前用户

排障场景下可以用 `setForcedSession()` 让下一个 Session 必定被采集，无需修改采样率：

```javascript
flashcatRum.setForcedSession();
flashcatRum.stopSession(); // 结束当前 Session，之后创建的新 Session 会被强制采集
```

- 标记只作用于**下一个新建的 Session**，当前 Session 的抽签结果永不翻转。因此 support flow 需要在 `setForcedSession()` 之后结束当前 Session，才会开始强制采集。
- 标记在 Session 创建后立即消耗，之后恢复常规抽样。
- 优先级高于 `beforeSampling`：被标记的 Session 即使采样率为 0 也会被采集。
- 初始化前调用会被保留到首个已创建 Session 之后的下一次 Session，不会追溯改变首个 Session。

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
- `flashcatRum.setForcedSession()` - 标记下一个新建会话必定被采集
- `flashcatRum.getInitConfiguration()` - 获取初始化配置

### 远程配置

- `flashcatRum.getRemoteConfig()` - 获取远程配置中的 `custom`，不可用时返回 `undefined`

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

## 开发

```bash
yarn install
yarn build
yarn test
```

如需在本地小程序 demo 中验证未发布版本，可以先构建并打包：

```bash
yarn pack:all
```

打包产物会生成在各 package 目录中：

- `packages/core/flashcatcloud-miniprogram-core.tgz`
- `packages/miniprogram-platform/flashcatcloud-miniprogram-platform.tgz`
- `packages/miniprogram-rum/flashcatcloud-miniprogram-rum.tgz`

## License

MIT
