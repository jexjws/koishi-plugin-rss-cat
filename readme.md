# koishi-plugin-rss-cat（开发中）

[![npm](https://img.shields.io/npm/v/koishi-plugin-rss-cat?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-rss-cat)

rss-cat 是一个方便的RSS订阅器。   
用户们可以用它在频道内订阅 RSS 源，当频道订阅的RSS源有更新时，rss-cat会自动把更新内容推送到频道。





## 插件目前的局限性
- 性能问题
    -  检测源更新时会一下子从 rsscat.source 数据表中拉取全部的数据出来，这不好，在源非常多的情况下可能会导致意外的问题（我这边没在源非常多的情况下测试过
- 稳定性问题
    - rss-cat 目前简单地使用 [`await ctx.broadcast(RssSource.subscriber, message)`](https://koishi.chat/zh-CN/api/core/context.html#ctx-broadcast) 向订阅该源的频道推送更新，并认为消息会成功地发送到每一个频道。   
    但实际上 `ctx.broadcast` 并不是100%地把消息成功地发送到每一个频道。   
    它会返回一个 `Promise<string[]>`代表`成功发送的消息 ID 列表`， rss-cat 应该利用这个列表来判断哪些频道发送失败了，并应该有相应的应对机制（如重发）。

总结： 目前仅供测试娱乐，不建议用在正式用途

## TODO
- [ ] 支持自定义rsshub后端地址
- [ ] 增加转成图片发送的可选项
- [ ] 自定义
- [x] ~~根据每个订阅源的更新频率自动确定对该订阅源的抓取时间间隔，而不是使用固定时间间隔~~没啥好办法通过一个订阅源的历史更新时间**准确地**预测出其下次更新时间
    - 实现情况：没有实现
- [x] 对于每个订阅源，将上次发送成功的消息的 guid 存到数据库里，这样当机器人下线时，就可以补发上次 下线 的时候未能推送的订阅源更新
    - 实现情况：把 guid 改成了 pubDate

## 开发参考（致谢）

- koishi-plugin-rss
- waterminer/rsshub-koishi
- [RxJS 快速入门](https://blog.ralph.wang/articles/23a34d9e_RxJS_快速入门)