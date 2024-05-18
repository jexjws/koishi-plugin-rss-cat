import { Context, Logger, Schema, Session, Time, h, $ } from 'koishi'
import { concatMap, from, map, of, switchMap, throwError } from 'rxjs';
import *  as logic from './logic';
import *  as updater from './updater';

export const name = 'rss-cat'
export const inject = {
  optional: [],
  required: ['database']
}

export const using = ['database'] as const

export const logger = new Logger('rss-cat')

export interface Config {
  timeout: number
  refresh: number
  userAgent: string
  rsshubBackend: string
}
export const Config: Schema<Config> = Schema.object({
  timeout: Schema.number().description('请求数据的最长时间。').default(Time.second * 10),
  refresh: Schema.number().description('刷新数据的时间间隔。').default(Time.minute * 5),
  userAgent: Schema.string().description('请求时使用的 User Agent。').default('NodeJS/koishi-plugin-rss-cat'),
  rsshubBackend: Schema.string().description('自托管 RSSHub 的后端地址。加载订阅源时会把 hostname 为 rsshub.app 的rss源替换成你提供的后端hostname。').default('https://rsshub.app'),
})


declare module 'koishi' {
  interface Tables {
    'rsscat.source': RssSource
  }
  interface Channel {
    rsscatSource: string[]
  }
}
export interface RssSource {
  id: number
  rssLink: string
  subscriber: string[]
  /**
   * 上次已广播的文章的 pubDate
   */
  lastBroadcastedpubDate: Date
}
export function apply(ctx: Context, config: Config) {
  ctx.model.extend("rsscat.source", {
    id: 'unsigned',
    rssLink: 'string',
    subscriber: 'list',
    lastBroadcastedpubDate: 'timestamp'
  }, {
    //https://koishi.chat/zh-CN/api/database/model.html#实例方法
    primary: 'id',
    autoInc: true
  })
  ctx.model.extend('channel', {
    rsscatSource: 'list',
    //rsscatSource 当索引用，快速拉取出该频道订阅的源
  })
  // write your plugin here

  ctx.on('dispose', () => {
    //
  })

  ctx.on('ready', () => {
    //
  })
  //定时拉取新消息，有新消息就推送
  ctx.setInterval(async () => { 
    const DBreturn = await ctx.database.get('rsscat.source', {})
    from(DBreturn).pipe(
      updater.UpdateSubOperator(ctx, config)
    ).
      subscribe({
        error: (err) => {
          logger.warn(err);
        }
      })
  }, config.refresh)

  ctx.command('rsscat', '订阅推送，设计为与rsshub搭配使用')

  ctx.command('rsscat.add <rssLink:string>', '增加一个订阅').example('rss-cat add https://www.solidot.org/index.rss')
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

  ctx.command('rsscat.remove <rssLink_or_rssId:string>', '移除一个订阅').example('rss-cat remove https://www.solidot.org/index.rss').example('rss-cat remove 1')
    .channelFields(['rsscatSource', 'id', 'platform'])
    .action(async function ({ session }, rssLink_or_rssId) {
      const { id, platform } = session.channel
      const ChannelID = `${platform}:${id}`

      of({ rssLink_or_rssId, ChannelID }).pipe(
        logic.RemSubOperator(ctx, session, config)
      ).
        subscribe({
          next: async () => {
            session.send('移除订阅成功。');
          },
          error: (err) => {
            logger.warn(err);
            session.send('移除订阅时出错：' + h.escape(err.message));
          }
        })
    });

  ctx.command('rsscat.list', '显示当前频道所有已订阅源').example('rss-cat list')
    .channelFields(['rsscatSource'])
    .action(async function ({ session }) {
      if (session.channel.rsscatSource.length === 0) {
        return '该频道还没订阅任何源'
      }
      let DBreturn = await ctx.database.get('rsscat.source', { id: session.channel.rsscatSource.map(Number) }, ["id", "rssLink"])
      let outputStr = `共订阅了 ${DBreturn.length} 个源：\n`
      DBreturn.forEach((item) => {
        outputStr += `${item.id} - ${item.rssLink}\n`
      })
      return outputStr
    });

  //ctx.command('rss-cat.set', '设定 rss-cat 在当前频道的行为')
}
