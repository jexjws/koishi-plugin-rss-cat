# koishi-plugin-rss-cat

[![npm](https://img.shields.io/npm/v/koishi-plugin-rss-cat?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-rss-cat)

基于 koishi-plugin-rss 制作，支持自定义rsshub后端地址

## 参考资料
[RxJS 快速入门](https://blog.ralph.wang/articles/23a34d9e_RxJS_快速入门)

## 小饼
- [ ] 对于每个订阅源，将上次发送成功的消息的 guid 存到数据库里，这样当机器人下线时，就可以补发上次 下线 的时候未能推送的订阅源更新
- [ ] 增加转成图片发送的可选项
- [ ] ~~根据每个订阅源的更新频率自动确定对该订阅源的抓取时间间隔，而不是使用固定时间间隔~~没啥好办法通过一个订阅源的历史更新时间**准确地**预测出其下次更新时间