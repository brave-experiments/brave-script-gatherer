"use strict";

const urlLib = require("url");

const request = require("request-promise-native");
const cheerio = require("cheerio");

const deob = require("./deobfuscate");

async function crawl (url, terms, domains, debug = false) {
    let logger;
    if (debug === true) {
        logger = (msg) => {
            console.log("crawl: " + JSON.stringify(msg));
        };
    } else {
        logger = () => {};
    }

    const requestOptions =  {
        uri: url,
        simple: false,
    };

    let html;
    try {
        html = await request(requestOptions);
        logger(`Fetched document of length ${html.length} from ${url}`);
    } catch (error) {
        logger(`Error encountered when fetching ${url}.`);
        logger(error);
        throw error;
    }

    const doc = cheerio.load(html);

    const remoteScriptSrcs = new Set();
    const termToMatchingInlineScript = {};
    const termsWithMatches = new Set();

    const scriptTags = doc("script");
    logger(`Found ${scriptTags.length} script tags on the page.`);

    scriptTags.each((i, elm) => {
        const wrappedElm = cheerio(elm);
        const scriptSrc = wrappedElm.attr("src");
        if (scriptSrc) {
            logger(`scriptSrc = ${scriptSrc}`);
            remoteScriptSrcs.add(scriptSrc);
            return;
        }

        const scriptText = elm.childNodes[0].data;
        const unobfuscatedScript = deob.deobfuscate(scriptText);
        const scriptToSearch = unobfuscatedScript !== scriptText ? unobfuscatedScript : scriptText;

        for (const term of terms) {
            if (scriptToSearch.indexOf(term) !== -1) {
                logger(`Found ${term} in inline script on ${url}`);
                if (termToMatchingInlineScript[term] === undefined) {
                    termToMatchingInlineScript[term] = [];
                }
                termToMatchingInlineScript[term].push({
                    orig: scriptText,
                    deob: scriptText !== unobfuscatedScript ? unobfuscatedScript : null,
                });
                termsWithMatches.add(term);
            }
        }
    });

    // Map of remote script URLs to the containing text.
    const termToMatchingRemoteScript = {};
    const domainToMatchingRemoteScript = {};
    for (const scriptSrc of Array.from(remoteScriptSrcs)) {
        const scriptUrl = new urlLib.URL(scriptSrc, url);
        const scriptUrlString = scriptUrl.toString();
        const scriptRequest = {
            uri: scriptUrlString,
            simple: false,
        };

        let scriptText;
        let unobfuscatedScript;

        try {
            scriptText = await request(scriptRequest);
            unobfuscatedScript = deob.deobfuscate(scriptText);
            logger(`Fetched script of length ${scriptText.length} from ${scriptUrlString}`);
        } catch (_) {
            logger(`Error occurred when trying to fetch script from ${scriptSrc}`);
            continue;
        }

        const scriptToSearch = unobfuscatedScript !== scriptText ? unobfuscatedScript : scriptText;
        const scriptRecord = {
            orig: scriptText,
            deob: scriptText !== unobfuscatedScript ? unobfuscatedScript : null,
        };

        const scriptHost = scriptUrl.hostname;
        for (const domain of domains) {
            if (scriptHost.includes(domain)) {
                logger(`Found ${domain} in domain of remote script ${scriptUrlString} on ${url}`);
                if (domainToMatchingRemoteScript[domain] === undefined) {
                    domainToMatchingRemoteScript[domain] = {};
                }
                domainToMatchingRemoteScript[domain][scriptUrlString] = scriptRecord;
            }
        }

        for (const term of terms) {
            const allTermPartsInRemoteScript = term.split(".").every(termPart => {
                return scriptToSearch.indexOf(termPart) !== -1;
            });
            if (allTermPartsInRemoteScript === true) {
                logger(`Found ${term} in text of remote script of ${scriptUrlString} on ${url}`);
                if (termToMatchingRemoteScript[term] === undefined) {
                    termToMatchingRemoteScript[term] = [];
                }
                termToMatchingRemoteScript[term].push(scriptRecord);
                termsWithMatches.add(term);
            }
        }
    }

    const combinedResult = {
        terms: {},
        domains: domainToMatchingRemoteScript,
    };
    for (const term of Array.from(termsWithMatches)) {
        combinedResult.terms[term] = {};
        if (termToMatchingInlineScript[term] !== undefined) {
            combinedResult.terms[term].inline = termToMatchingInlineScript[term];
        }
        if (termToMatchingRemoteScript[term] !== undefined) {
            combinedResult.terms[term].remote = termToMatchingRemoteScript[term];
        }
    }

    logger(`Finished crawl of ${url}.  Found ${Object.keys(combinedResult.terms).length} matching terms, and ${Object.keys(combinedResult.domains).length} matching domains`);
    return combinedResult;
}

module.exports.crawl = crawl;
