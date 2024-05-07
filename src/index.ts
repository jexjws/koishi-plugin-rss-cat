import { Context, Schema, Session, Time } from 'koishi'
import RssFeedEmitter from 'rss-feed-emitter'
import { map, of } from 'rxjs';

export const name = 'rss-cat'
export const inject = {
  optional: [],
  required: ['database']
}

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
}
export interface RssSource {
  rssLink: string
  subscriber: string[]
  lastUpdate: number
  lastPost: string
}
export function apply(ctx: Context,config:Config) {
  ctx.model.extend("rsscat.source", {
    rssLink: 'string',
    subscriber: 'list'
  },{
    //https://koishi.chat/zh-CN/api/database/model.html#实例方法
    //指定主键为rssLink
    primary: 'rssLink'
  }
  )

  const { timeout, refresh, userAgent } = config

  // write your plugin here
  ctx.command('rss-cat', '订阅推送，设计为与rsshub搭配使用')

  
  ctx.command('rss-cat.add <rssLink:string>', '在当前频道增加一个订阅').example('rss-cat add https://www.solidot.org/index.rss')
  .action(async function( { session  },rssLink ){
    const { id, platform } = session.event
    const ChannelID = `${platform}:${id}`
    
    of({ rssLink, ChannelID }).pipe(
      map((data) => {
        data.rssLink = (new URL(data.rssLink)).href;
        return data
      })
    ).subscribe(data => {
      console.log(data)
    })

    //const Channel_list = await ctx.database.get('rsscat.source', rssLink)

    //if (Channel_list.length >= 0) return '已订阅此链接。'
    //return JSON.stringify(session.event)
    
  })

  const validators: Record<string, Promise<unknown>> = {}
  async function validate(url: string, session: Session) {
    if (validators[url]) {
      await session.send('正在尝试连接……')
      return validators[url]
    }

    let timer: NodeJS.Timeout
    const feeder = new RssFeedEmitter({ userAgent })
    return validators[url] = new Promise((resolve, reject) => {
      // rss-feed-emitter's typings suck
      feeder.add({ url, refresh: 1 << 30 })
      feeder.on('new-item', resolve)
      feeder.on('error', reject)
      timer = setTimeout(() => reject(new Error('connect timeout')), timeout)
    }).finally(() => {
      feeder.destroy()
      clearTimeout(timer)
      delete validators[url]
    })
  }
  
  ctx.command('rss-cat.list', '显示当前频道所有已订阅源')

  //ctx.command('rss-cat.set', '设定 rss-cat 在当前频道的行为')
}
