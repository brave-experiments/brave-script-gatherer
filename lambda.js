"use strict";

const crawler = require("./lib/crawl");
const db = require("./lib/db");
const utils = require("./lib/utils");

/**
 * Required arguments:
 *   url {string}
 *   batch {uuid string}
 *
 * One or both of the below:
 *   domains ?{array<string>}
 *   terms ?{array<string>}
 *
 * Optional arguments:
 *   region {?string} (default: null)
 *   debug {?boolean} (default: false)
 *   tags {?array<string>} (default: null)
 *   rank {?int} (default: null)
 */
async function dispatch (args) {
    let logger;
    const debug = args.debug || false;
    if (debug === true) {
        logger = (msg) => {
            console.log("lambda: " + JSON.stringify(msg));
        };
    } else {
        logger = () => {
            // pass
        };
    }

    logger(args);
    const [error, msg] = utils.validateArgs(args);
    if (error !== null) {
        logger(`Invalid arguments: ${msg}`);
        return;
    }

    const url = args.url;
    const batch = args.batch;

    const searchTerms = args.terms || [];
    const searchDomains = args.domains || [];

    const region = args.region || null;
    const tags = args.tags || [];
    const rank = args.rank || null;

    let crawlResult;
    try {
        crawlResult = await crawler.crawl(url, searchTerms, searchDomains, debug);
    } catch (e) {
        logger(`Error encountered when crawling ${url}: ${e}`);
        return false;
    }

    const result = {
        batchUuid: batch,
        batchTags: tags,
        url: url,
        region: region,
        rank: rank,
        terms: searchTerms,
        termMatches: crawlResult.terms,
        domains: searchDomains,
        domainMatches: crawlResult.domains,
    };

    logger(`About to record result for ${url}`);
    await db.record(result, debug);
    logger(`Successfully recorded result for ${url}`);
    return true;
}

module.exports.dispatch = dispatch;
