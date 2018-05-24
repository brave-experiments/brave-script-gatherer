"use strict";

const urlLib = require("url");

const request = require("request-promise-native");
const cheerio = require("cheerio");

const deob = require("./deobfuscate");
const domLib = require("./dom");

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
    const termsWithMatches = new Set();
    const termToMatchingInlineScript = {};

    const scriptTags = doc("script");
    logger(`Found ${scriptTags.length} script tags on the page.`);

    scriptTags.each((i, elm) => {
        const wrappedElm = cheerio(elm);
        const scriptSrc = wrappedElm.attr("src");
        if (scriptSrc) {
            logger(`scriptSrc = ${scriptSrc}`);
            remoteScriptSrcs.add({
                elm: elm,
                src: scriptSrc,
            });
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
                    elm,
                });
                termsWithMatches.add(term);
            }
        }
    });

    // Map of remote script URLs to the containing text.
    const termToMatchingRemoteScript = {};
    const domainToMatchingRemoteScript = {};
    const nonRespondingScriptUrls = new Set();
    for (const scriptPair of Array.from(remoteScriptSrcs)) {
        const scriptUrl = new urlLib.URL(scriptPair.src, url);
        const scriptUrlString = scriptUrl.toString();
        const scriptRequest = {
            uri: scriptUrlString,
            simple: false,
        };

        let scriptText;

        try {
            scriptText = await request(scriptRequest);
            logger(`Fetched script of length ${scriptText.length} from ${scriptUrlString}`);
        } catch (_) {
            nonRespondingScriptUrls.add(scriptPair);
            logger(`Error occurred when trying to fetch script from ${scriptUrlString}`);
            continue;
        }

        const unobfuscatedScript = deob.deobfuscate(scriptText);
        const scriptToSearch = unobfuscatedScript !== scriptText ? unobfuscatedScript : scriptText;
        const scriptRecord = {
            orig: scriptText,
            deob: scriptText !== unobfuscatedScript ? unobfuscatedScript : null,
            elm: scriptPair.elm,
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

    const tagsForNonRespondingScripts = Array.from(nonRespondingScriptUrls).map(pair => pair.elm);
    const isNonResondingScript = elm => {
        return tagsForNonRespondingScripts.includes(elm);
    };

    const tagsForAllRemoteScripts = Array.from(remoteScriptSrcs).map(pair => pair.elm);
    const isRemoteScriptTag = elm => {
        return tagsForAllRemoteScripts.includes(elm);
    };

    for (const term of Array.from(termsWithMatches)) {
        combinedResult.terms[term] = {};
        const areInlineScripts = termToMatchingInlineScript[term] !== undefined;
        if (areInlineScripts) {
            combinedResult.terms[term].inline = termToMatchingInlineScript[term];
        }

        // If we were able to find a remote script that defines the mining
        // method being called (term), then record it here.
        if (termToMatchingRemoteScript[term] !== undefined) {
            combinedResult.terms[term].remote = termToMatchingRemoteScript[term];
            continue;
        }

        if (areInlineScripts === false) {
            continue;
        }

        // Otherwise, we try to "guess" which remote script might include
        // the library code for the miner script.  We do this by first
        // looking for the closest, preceding remote script in the document
        // that did not respond / 404ed.  If there are no un-responsive
        // remote scripts, then "guess" that its the closest previous
        // remote script tag.
        for (const inlineScriptTag of combinedResult.terms[term].inline) {
            const scriptTagElm = inlineScriptTag.elm;

            if (tagsForNonRespondingScripts.length > 0) {
                let bestGuessScriptTag;
                let isBestGuessResponding;
                const closestNonResponsiveScriptTag = domLib.closestPrevNode(
                    doc,
                    scriptTagElm,
                    isNonResondingScript
                );

                if (closestNonResponsiveScriptTag !== undefined) {
                    bestGuessScriptTag = closestNonResponsiveScriptTag;
                    isBestGuessResponding = false;
                } else {
                    isBestGuessResponding = true;
                    bestGuessScriptTag = domLib.closestPrevNode(
                        doc,
                        scriptTagElm,
                        isRemoteScriptTag
                    );
                }

                if (bestGuessScriptTag !== undefined) {
                    const distanceToTag = domLib.distanceBetweenNodes(
                        doc,
                        bestGuessScriptTag,
                        scriptTagElm
                    );
                    inlineScriptTag.suspectScript = {
                        url: bestGuessScriptTag.attribs.src,
                        responds: isBestGuessResponding,
                        numNodesPrev: distanceToTag,
                    };
                }
            }
        }
    }

    const numMatchingTerms = Object.keys(combinedResult.terms).length;
    const numMatchingDomains = Object.keys(combinedResult.domains).length;

    logger(`Finished crawl of ${url}.  Found ${numMatchingTerms} matching terms, ${numMatchingDomains} matching domains`);
    return combinedResult;
}

module.exports.crawl = crawl;
