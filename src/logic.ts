//代码罗辑
import { Context, Logger, Schema, Session, Time, h, $ } from 'koishi'
import { concatMap, map, of, switchMap, throwError, pipe } from 'rxjs'
import { Config, RssSource, logger } from '.'
import RssFeedEmitter from 'rss-feed-emitter'

declare module 'koishi' {
    interface Tables {
        'rsscat.source': RssSource
    }
    interface Channel {
        rsscatSource: string[]
    }
}

function convertToURL(input: string){
    //hasProtocol 探测给定输入是否以 https 或 http 开头
    const hasProtocol = /^(https?:\/\/)/i.test(input)
    if (!hasProtocol) {
        input = "https://" + input
    }
    return (new URL(input)).href
}

const AddSubOperator = (ctx: Context, session: Session<never, "rsscatSource", Context>, config: Config) => {
    return pipe(
        concatMap(async (data: { rssLink: string, ChannelID: string, DBindex: number }) => {
            data.rssLink = convertToURL(data.rssLink)
            try {
                //用 validate 验证rssLink是否可正常访问
                await validate(data.rssLink, session, config);
                //如果验证通过，把data丢到下个操作员手上，进入下一步
                return data
            } catch (err) {
                err.message = `Bot 尝试 ping 订阅源时出错：${err.message}`
                throw err
            }
        }),
        concatMap(async (data) => {
            logger.debug("URL验证通过，当前data：", data)
            //保证不出现 索引为空 / 重复订阅 的情况
            let DBreturn = await ctx.database.get('rsscat.source', { rssLink: data.rssLink }, ["id", "subscriber"])
            logger.debug("DBreturn：", DBreturn)
            if (DBreturn.length === 0) {
                //数据库不存在该rssLink，当场创一个
                logger.debug("数据表不存在该rssLink，创建一行。")
                let newRow = await ctx.database.create('rsscat.source', { rssLink: data.rssLink })

                DBreturn = [{ subscriber: [], id: newRow.id }] //更新DBreturn
            } else if (DBreturn[0].subscriber.includes(data.ChannelID)) {
                //判断当前频道是否已经订阅该rssLink，是的话就报错
                throw new Error("该频道已订阅此源 无需重复订阅。")
            }

            //在 rssLink 对应的行 添加该频道
            await ctx.database.set('rsscat.source', { rssLink: data.rssLink }, {
                subscriber: [...DBreturn[0].subscriber, data.ChannelID]
            })
            session.channel.rsscatSource.push(String(DBreturn[0].id))
            await session.channel.$update()

            data.DBindex = DBreturn[0].id
            return data
        }),
    )
}
// koishi-plugin-rss
const validators: Record<string, Promise<unknown>> = {};
async function validate(url: string, session: Session, config: Config): Promise<unknown> {
    const { timeout, refresh, userAgent } = config
    if (validators[url]) {
        await session.send('正在尝试连接……');
        return validators[url];
    }

    const feeder = new RssFeedEmitter({ userAgent });
    validators[url] = new Promise((resolve, reject) => {
        feeder.add({ url, refresh: 1 << 30 });

        feeder.on('new-item', resolve);
        feeder.on('error', reject);

        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('connect timeout')), timeout)
        );

        Promise.race([validators[url], timeoutPromise]).catch(reject);
    }).finally(() => {
        feeder.destroy();
        delete validators[url];
    });

    return validators[url];
}

const RemSubOperator = (ctx: Context, session: Session<never, "rsscatSource", Context>, config: Config) => {
    return pipe(
        concatMap(async (data: { rssLink_or_rssId: string, ChannelID: string }) => {
            //把 rssLink_or_rssId 转换成 rssId
            const { rssLink_or_rssId, ChannelID } = data;
            const numberPattern = /^\d+$/
            if (numberPattern.test(rssLink_or_rssId)) {
                // 数字
                return { rssId: Number(rssLink_or_rssId), ChannelID: ChannelID }
            } else {
                try {
                    const url = convertToURL(rssLink_or_rssId)
                    // URL
                    let DBreturn = await ctx.database.get('rsscat.source', { rssLink: url }, ["id"])
                    return { rssId: DBreturn[0].id, ChannelID: ChannelID }
                } catch (error) {
                    throw new Error(`传入的 rssLink_or_rssId 既不是 URL，也不是可作为 ID 的数字。`)
                }
            }
        }),
        concatMap(async ({ rssId, ChannelID }) => {
            //业务逻辑
            let DBreturn = (await ctx.database.get('rsscat.source', { id: rssId }, ["subscriber"]))[0]
            if (DBreturn.subscriber.includes(ChannelID)) {
                DBreturn.subscriber.splice(DBreturn.subscriber.indexOf(ChannelID), 1)
                if (DBreturn.subscriber.length === 0) {
                    await ctx.database.remove('rsscat.source', { id: rssId })
                } else {
                    await ctx.database.set('rsscat.source', { id: rssId }, { subscriber: DBreturn.subscriber })
                }
            } else {
                throw new Error(`当前频道没有订阅该源`)
            }

            session.channel.rsscatSource = session.channel.rsscatSource.filter((id) => id !== String(rssId))
            //console.log(session.channel.rsscatSource,rssId)
            await session.channel.$update()
        })
    )
}

export { AddSubOperator, RemSubOperator }