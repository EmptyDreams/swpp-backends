![swpp](./swpp.jpg)

## 欢迎使用 SwppBackends

swpp-backends（以下简称 swpp）插件的功能是为网站生成一个高度可用的 ServiceWorker（以下简称 SW），为网站优化二次加载、提供离线体验、提高可靠性，并为此附带了一些其它的功能。

swpp 的全拼为“Service Worker Plus Plus”（或“Service Worker++”），但是其与已有的插件“hexo-service-worker”并没有关系，插件中所有代码均为我个人开发，这一点请不要误解。

swpp 生成的 SW 与其它插件的对比：

|            |     swpp      | hexo-offline |
|:----------:|:-------------:|:------------:|
|    本地缓存    |      ✔️       |      ✔️      |
|   缓存增量更新   |      ✔️       |      ❌       |
|   缓存过期时间   | ❌<sup>1</sup> |      ✔️      |
|   缓存大小限制   |       ❌       |      ✔️      |
|    预缓存     | ❌<sup>2</sup> |      ✔️      |
| Request 篡改 |      ✔️       |      ❌       |
|   URL 竞速   |      ✔️       |      ❌       |
|   备用 URL   |      ✔️       |      ❌       |
|  204 阻塞响应  |      ✔️       |      ❌       |
|    逃生门     |      ✔️       |      ❌       |
|    请求合并    |      ✔️       |      ❌       |
|    跨平台     |      ✔️       |      ❌       |
|    高度自由    |      ✔️       |      ❌       |
|     更新     |     非常频繁      |   超过两年没有更新   |

<small>&emsp;注：上面提到的跨平台是指跨越框架（比如 Hexo、WordPress 等）。</small>

+ ✔️：支持
+ ❌：不支持

1. 因为有增量更新，所以没提供过期的实现，没必要
2. 预缓存可以在前端实现，SW 实现这个功能容易拖延注册时间

目前支持的平台：

|  平台  |     插件名     |                            文档                             |           作者            |
|:----:|:-----------:|:---------------------------------------------------------:|:-----------------------:|
| hexo | `hexo-swpp` | [github](https://github.com/EmptyDreams/hexo-swpp#readme) | [空梦](https://kmar.top/) |

如果你为某一个平台做了适配，可以在 gh 上发布 issue 或者在文档页面发布评论~

文档：[Swpp Backends 官方文档 | 山岳库博](https://kmar.top/posts/b70ec88f/)