import { Context, Logger, Schema, Session, Time, h, $ } from 'koishi'
import { concatMap, map, of, switchMap, throwError } from 'rxjs';
import *  as logic from './logic';
import RssFeedEmitter from 'rss-feed-emitter'

export const name = 'rss-cat'
export const inject = {
  optional: [],
  required: ['database']
}

export const using = ['database'] as const

export const logger = new Logger('rss-cat')

export interface Config {
  timeout?: number
  refresh?: number
  userAgent?: string
  rsshubBackend?: string
}
export const Config: Schema<Config> = Schema.object({
  timeout: Schema.number().description('请求数据的最长时间。').default(Time.second * 10),
  refresh: Schema.number().description('刷新数据的时间间隔。').default(Time.minute),
  userAgent: Schema.string().description('请求时使用的 User Agent。'),
  rsshubBackend: Schema.string().description('自托管 RSSHub 的后端地址。插件加载时会把 hostname 为 rsshub.app 的rss源替换成你提供的后端hostname。').default('https://rsshub.app'),
})


declare module 'koishi' {
  interface Tables {
    'rsscat.source': RssSource
  }
  interface Channel {
    rsscatSource: number[]
  }
}
export interface RssSource {
  id: number
  rssLink: string
  subscriber: string[]
  //lastUpdate: number
  //lastPost: string
}
export function apply(ctx: Context, config: Config) {
  ctx.model.extend("rsscat.source", {
    id: 'unsigned',
    rssLink: 'string',
    subscriber: 'list'
  }, {
    //https://koishi.chat/zh-CN/api/database/model.html#实例方法
    primary: 'id',
    autoInc: true
  })
  ctx.model.extend('channel', {
    rsscatSource: 'list',
  })
  // write your plugin here
  // RssFeedEmitter 初始化
  const feeder = new RssFeedEmitter({ skipFirstLoad: true, userAgent: config.userAgent })
  ctx.on('dispose', () => {
    feeder.destroy()
  })
  feeder.on('error', (err: Error) => {
    logger.debug(err.message)
  })
  feeder.on('new-item', async (payload) => {
    
    const source = payload.meta.link
    const message = `${payload.meta.title} (${payload.author})\n${payload.description}`
    logger.debug('new-item', message)
    const subscriber = (await ctx.database.get('rsscat.source', {rssLink: source}, ["subscriber"]))[0].subscriber
    
    ctx.broadcast(subscriber,message)
    
  })

  ctx.on('ready', async () => {
    const RssLinks = (await ctx.database.get('rsscat.source', {
      id: { $gt: 0 },
    }, ['rssLink'])).forEach((item) => {
      feeder.add({ url: item.rssLink , refresh: config.refresh })
    })
  })

  ctx.command('rss-cat', '订阅推送，设计为与rsshub搭配使用')

  ctx.command('rss-cat.add <rssLink:string>', '增加一个订阅').example('rss-cat add https://www.solidot.org/index.rss')
    .channelFields(['rsscatSource', 'id', 'platform'])
    .action(async function ({ session }, rssLink) {
      const { id, platform } = session.channel
      const ChannelID = `${platform}:${id}`

      of({ rssLink, ChannelID }).pipe(
        logic.AddSubOperator(ctx, session, config)
      ).
        subscribe({
          next: async (data) => {
            //return "需要return才能更新rsscatSource？"
            session.send('添加订阅成功：' + `${data.DBindex} - ` + h.escape(data.rssLink));
          },
          error: (err) => {
            // 处理订阅中的错误
            logger.warn(err);
            session.send('添加订阅时出错：' + h.escape(err.message));
          }
        });
    })

  ctx.command('rss-cat.remove <rssLink:string>', '移除一个订阅').example('rss-cat remove https://www.solidot.org/index.rss')
    .channelFields(['rsscatSource', 'id', 'platform'])
    .action(async function ({ session }, rssLink) {
      
    })

  //ctx.command('rss-cat.list', '显示当前频道所有已订阅源')

  //ctx.command('rss-cat.set', '设定 rss-cat 在当前频道的行为')
}
