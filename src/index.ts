import { Context, Logger, Schema, Session, Time, h, $, Dict } from 'koishi'
import { concatMap, from, map, of, switchMap, throwError, interval } from 'rxjs';
import Puppeteer from 'koishi-plugin-puppeteer'
import *  as logic from './logic';
import *  as updater from './updater';

export const name = 'rss-cat'
export const inject = {
  optional: ['puppeteer'],
  required: ['database']
}

//export const using = ['database'] as const

export const logger = new Logger('rss-cat')

export interface Config {
  timeout: number
  refresh: number
  concurrent: number
  userAgent: string
  rsshubBackend: string
  RSSitem: { [key: string]: boolean }
  toImg: boolean
  enableXImgsKey: boolean
}
export const Config = Schema.intersect([
  Schema.object({
    timeout: Schema.number().description('请求数据的最长时间（秒）').default(10),
    refresh: Schema.number().description('刷新订阅源的时间间隔（秒）').default(300),
    concurrent: Schema.number().description('最多允许同时向多少个源发起请求').default(5),
    userAgent: Schema.string().description('请求时使用的 User Agent').default('NodeJS/koishi-plugin-rss-cat'),
    rsshubBackend: Schema.string().description('自托管 RSSHub 的后端地址。\n *从订阅源拉取时会把 URL 前缀为`https://rsshub.app`的rss源替换成此处提供的前缀*').default('https://rsshub.app')
  }).description('RSS 的拉取'),
  Schema.object({
    RSSitem: Schema.dict(Boolean).description('会按照这里给出的 item 中的key，按顺序提取出 [RSS源`<item>`中的元素](https://www.rssboard.org/rss-specification#hrelementsOfLtitemgt) 拼装成一起（每项之间会加换行符）并推送至订阅该源的频道。 关闭key右边的开关会使 rss-cat 忽略这个key。').default({ "title": true, "link": true, "description": true, "description_imgs": false })
  }).description('推送单条更新时的排版'),
  Schema.object({
    toImg: Schema.boolean().description("使用 puppeteer 插件转换成图片发送。请确保 puppeteer 服务已加载。在 puppeteer 插件设置页面中调节转换成图片的详细设置（如图片宽度）。 ").default(false).experimental(),
    enableXImgsKey: Schema.boolean().description("识别键 *_imgs ：当在 RSSitem 中识别到 *x*_imgs 键时，返回 *x* 中包含的所有图片").default(false),
  }).description('对推送文字的特殊处理')
])


declare module 'koishi' {
  interface Tables {
    'rsscat.source': RssSource
  }
  interface Channel {
    rsscatSource: string[]
  }
  interface Context {
    puppeteer: Puppeteer
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
export async function apply(ctx: Context, config: Config) {

  //throw new Error(`${config.refresh} ${config.timeout}`) //debug

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

  ctx.on('ready', async () => {
    //
    //TODO: 使用rxjs确保只有一个UpdateSubOperator在运行
    if (config.toImg && !(ctx.puppeteer.render)) {
      logger.warn("警告：toImg 选项已打开，但未检测到 puppeteer.render 接口，可能无法正常推送消息。")
    }
    //定时拉取新消息，有新消息就推送
    ctx.setInterval(async () => {
      const DBreturn = await ctx.database.get('rsscat.source', {})
      from(DBreturn).pipe(
        updater.UpdateSubOperator(ctx, config)
      ).subscribe({
        error: (err) => {
          logger.warn(err);
        }
      })
    }, config.refresh * Time.second)

  //   const DBreturn = await ctx.database.get('rsscat.source', {})

  //   from(DBreturn).pipe(
  //     updater.UpdateSubOperator(ctx, config)
  //   ).subscribe({
  //     error: (err) => {
  //       logger.warn(err);
  // }})
    
  })



  ctx.command('rsscat', '订阅推送，设计为与rsshub搭配使用')

  ctx.command('rsscat.add <rssLink:string>', '添加一个订阅').example('rsscat add https://www.solidot.org/index.rss')
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

  ctx.command('rsscat.remove <rssLink_or_rssId:string>', '移除一个订阅').example('rsscat remove https://www.solidot.org/index.rss').example('rss-cat remove 1')
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

  ctx.command('rsscat.list', '显示当前频道所有已订阅源').example('rsscat list')
    .channelFields(['rsscatSource'])
    .action(async function ({ session }) {
      if (session.channel.rsscatSource.length === 0) {
        return '该频道还没订阅任何源'
      }
      let DBreturn = await ctx.database.get('rsscat.source', { id: session.channel.rsscatSource.map(Number) }, ["id", "rssLink"])
      let outputStr = `当前频道共订阅了 ${DBreturn.length} 个源：\n`
      DBreturn.forEach((item) => {
        outputStr += `${item.id} - ${item.rssLink}\n`
      })
      return outputStr
    });


  ctx.command('rsscat.testImg', '测试 puppeteer 可用性')
    .action(async function ({ },) {

      return h('html', h.parse('<h1>若以图片形式看到这句话，代表 puppeteer 服务正常</h1>'))
    });

  //ctx.command('rss-cat.set', '设定 rss-cat 在当前频道的行为')
}
