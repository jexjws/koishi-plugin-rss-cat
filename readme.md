# koishi-plugin-rss-cat（开发中）

[![npm](https://img.shields.io/npm/v/koishi-plugin-rss-cat?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-rss-cat)

支持自定义rsshub后端地址

## 参考资料
[RxJS 快速入门](https://blog.ralph.wang/articles/23a34d9e_RxJS_快速入门)

## 插件目前的局限性
- 性能问题
   -  检测源更新时会一下子从 rsscat.source 数据表中拉取全部的数据出来，这不好，在源非常多的情况下可能会导致意外的问题（我这边没在源非常多的情况下测试过

## 小饼

- [ ] 增加转成图片发送的可选项
- [ ] 自定义
- [ ] ~~根据每个订阅源的更新频率自动确定对该订阅源的抓取时间间隔，而不是使用固定时间间隔~~没啥好办法通过一个订阅源的历史更新时间**准确地**预测出其下次更新时间
- [x] 对于每个订阅源，将上次发送成功的消息的 guid 存到数据库里，这样当机器人下线时，就可以补发上次 下线 的时候未能推送的订阅源更新
   - 实现情况：把 guid 改成了 pubDate

## 开发参考

- koishi-plugin-rss
- waterminer/rsshub-koishi