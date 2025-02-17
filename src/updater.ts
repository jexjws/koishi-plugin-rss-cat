//代码罗辑
import { Context, Logger, Schema, Session, Time, h, $ } from 'koishi'
import { concatMap, map, of, switchMap, throwError, pipe, filter, mergeMap, catchError, EMPTY, Subject } from 'rxjs'
import { Config, RssSource, logger } from '.'
const FeedParser = require("feedparser");



const UpdateSubOperator = (ctx: Context, config: Config) => {
    return pipe(
        mergeMap(async (RssSource: RssSource) => {
            logger.debug(`拉取: ${JSON.stringify(RssSource)}`)
            const { data, headers } = await getRSSbody(RssSource.rssLink, ctx, config)

            return { httpRes: { data, headers }, RssSource }
        },config.concurrent),
        map((data) =>{
            logger.debug(data)
            return data
        }),
        catchError((err, caught) => {
            logger.warn(`拉取失败: ${err.message}`)
            return EMPTY
        }),
        mergeMap(async ({ httpRes, RssSource }) => {
            const feedItems = await getRSSItems(httpRes.data); //先把Rss里面的items取出来
            const newItems = feedItems.filter((item: { pubDate: string | number | Date; }) => {
                const itemDate = new Date(item.pubDate);
                return itemDate > RssSource.lastBroadcastedpubDate;
            });//把日期早于 lastBroadcastedpubDate 的 item 过滤掉

            //剩下的就是新的，还没广播出去的item
            if (newItems.length > 0) {

                logger.info(`${RssSource.id} 号源有${newItems.length}条更新，开始广播这些更新。`)
                for (const item of newItems) {
                    const message = RSScomposer(item, config, ctx);
                    await ctx.broadcast(RssSource.subscriber, message);
                }
                const latestDate = new Date(Math.max(...newItems.map((item: { pubDate: string | number | Date; }) => new Date(item.pubDate).getTime())));
                await ctx.database.set('rsscat.source', RssSource.id, {
                    lastBroadcastedpubDate: latestDate,
                });
            }else{
                logger.debug(`${RssSource.id} 号源没有更新。`)
            }

            return RssSource;
        })

    )
}


function getRSSbody(rssURL: string, ctx: Context, config: Config) {
    return ctx.http(rssURL.replace(/^https:\/\/rsshub.app/, config.rsshubBackend), { responseType: 'text', headers: { 'user-agent': config.userAgent }, timeout: config.timeout * Time.second })
}


// feedparser-helper.js (data: string) => Promise<any[]>
async function getRSSItems(data: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
        const feedparser = new FeedParser();
        const items = [];

        feedparser.on('error', reject);
        feedparser.on('readable', function () {
            let item: any;
            while (item = this.read()) {
                items.push(item);
            }
        });
        feedparser.on('end', () => resolve(items));

        feedparser.end(data);
    });
};


import { parseDocument } from 'htmlparser2';
import {findAll} from 'domutils';

function RSScomposer(item: { [x: string]: string; }, config: Config, ctx: Context) {
    let message: string = ''
    function getItemVal(key: string) {
        return item.hasOwnProperty(key) ? item[key] : "" + "\n";
    }
    function extractImgUrlsFromHTML(html: string): string[] {
        const imgSources = [];
        // 1. 使用 htmlparser2 解析 HTML 字符串
        const dom = parseDocument(html);
    
        // 2. 使用 domhandler 的 findAll 查找所有的 <img> 标签
        const imgElements = findAll(
            (node) => node.type === 'tag' && node.name === 'img',
            dom.children
        );
    
        // 3. 遍历所有的 <img> 标签，并提取 src 属性
        imgElements.forEach(img => {
            if (img.attribs && img.attribs.src) { // 确保 attribs 和 src 存在
                imgSources.push(img.attribs.src);
            }
        });
        return imgSources;
    
    }
    Object.entries(config.RSSitem).forEach(async ([key, enabled]) => {
        if (!enabled) return
        if (config.enableXImgsKey && key.endsWith("_imgs")) {
            const baseKey = key.slice(0, -5);
            const htmlContent = getItemVal(baseKey);
            const imgUrls = extractImgUrlsFromHTML(htmlContent);
            if (imgUrls.length > 0) {
                message += imgUrls.map(url => h('img',{src:url})+'\n');
            }
            return
        }

        if (key === 'description') {
            //<description> 的特殊处理
            if (config.toImg) {
                message += `${(h('html', h.parse(getItemVal(key))))}`
            } else {
                message += `${getItemVal(key)}`
            }
            return
        } 
            message += `${getItemVal(key)}`
    })
    return message
}


export { UpdateSubOperator, getRSSbody, getRSSItems, RSScomposer }