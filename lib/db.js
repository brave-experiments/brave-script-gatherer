"use strict";

const crypto = require("crypto");

const pg = require("pg");

const config = require("../config");


const getClient = (logger) => {
    const client = new pg.Client({
        user: config.pg.username,
        host: config.pg.host,
        database: "script_crawls",
        password: config.pg.password,
        port: config.pg.port,
    });
    client.connect();
    logger("Connected to database");
    return client;
};

async function getIdForQuery (client, query, terms, field = "id") {
    const rs = await client.query(query, terms);
    if (rs.rows && rs.rows.length === 1) {
        return rs.rows[0][field];
    }
    return false;
}


// Returns the primary key for the created crawl record.
// Expects an object with the following structure
// {
//  "batchUuid": <string>
//  "batchTags": ?array<string>,
//  "url":       <string>,
//  "region":    ?<string>,
//  "rank":      ?<int>,
//  "terms":     ?array<string>,
//  "domains":   ?array<string>
//  "domainMatches": {
//      <domain name>: {
//          <url>: {
//              orig: string,
//              deob: ?string
//          },
//          ...
//      },
//      ...
//  },
//  "termMatches": {
//      <term name>: {
//          "inline": ?[
//              {
//                  orig: string,
//                  deob: ?string
//              },
//              ...
//          ],
//          "remote": [
//              {
//                  "url": <string>,
//                  "script": {
//                      orig: string,
//                      deob: ?string
//                  }
//              },
//              ...
//          ],
//       }
//    }
//  }
async function record (data, debug = false) {
    let logger;
    if (debug === true) {
        logger = (msg) => {
            console.log("db: " + JSON.stringify(msg));
        };
    } else {
        logger = () => {};
    }
    const client = getClient(logger);

    const batchId = await fetchBatchId(
        client, data.batchUuid, data.batchTags,
        data.terms, data.domains, data.region, logger
    );

    await client.query("BEGIN");

    const crawlUrl = data.url;
    const crawlId = await fetchCrawlId(client, crawlUrl, batchId, data.rank, logger);

    if (data.termMatches !== undefined && Object.keys(data.termMatches).length > 0) {
        await insertCrawlTermMatches(client, crawlId, data.termMatches, logger);
    }

    if (data.domainMatches !== undefined && Object.keys(data.domainMatches).length > 0) {
        await insertCrawlDomainMatches(client, crawlId, data.domainMatches, logger);
    }

    await client.query("COMMIT");
    await client.end();
    return crawlId;
}


async function fetchBatchId (
    client, batchUuid, batchTags, batchTerms,
    batchDomains, region, logger
) {
    const selectTerms = [batchUuid];
    const selectQuery = "SELECT id FROM batches WHERE uuid = $1 LIMIT 1;";
    let batchId = await getIdForQuery(client, selectQuery, selectTerms);
    if (batchId !== false) {
        logger(`Found ${batchId} for batches.uuid = ${batchUuid}`);
        return batchId;
    }

    const insertQuery = `
        INSERT INTO
            batches(uuid, region)
        VALUES
            ($1, $2)
        RETURNING
            id;
    `;
    const insertTerms = [batchUuid, region];
    batchId = await getIdForQuery(client, insertQuery, insertTerms);
    logger(`Inserted batches.uuid = ${batchUuid} with id ${batchId}`);

    if (batchTags !== undefined) {
        const tagToBatchQuery = `
            INSERT INTO
                batches_tags(batch_id, tag_id)
            VALUES
                ($1, $2)
            RETURNING
                id;
        `;

        for (const tag of batchTags) {
            const tagId = await fetchTagId(client, tag, logger);
            const batchTagTerms = [batchId, tagId];
            const batchTagId = await getIdForQuery(client, tagToBatchQuery, batchTagTerms);
            logger(`Assigned tag ${tag} to batch ${batchUuid} with id ${batchTagId}`);
        }
    }

    if (batchTerms !== undefined) {
        const batchToTermQuery = `
            INSERT INTO
                batches_terms(batch_id, term_id)
            VALUES
                ($1, $2)
            RETURNING
                id;
        `;

        for (const term of batchTerms) {
            const termId = await fetchTermId(client, term, logger);
            const batchTermTerms = [batchId, termId];
            const batchTermId = await getIdForQuery(client, batchToTermQuery, batchTermTerms);
            logger(`Assigned term ${term} to batch ${batchUuid} with id ${batchTermId}`);
        }
    }

    if (batchDomains !== undefined) {
        const batchToDomainQuery = `
            INSERT INTO
                batches_domains(batch_id, domain_id)
            VALUES
                ($1, $2)
            RETURNING
                id;
        `;

        for (const domain of batchDomains) {
            const domainId = await fetchDomainId(client, domain, logger);
            const batchDomainTerms = [batchId, domainId];
            const batchDomainId = await getIdForQuery(client, batchToDomainQuery, batchDomainTerms);
            logger(`Assigned domain ${domain} to batch ${batchUuid} with id ${batchDomainId}`);
        }
    }

    return batchId;
}


async function fetchDomainId (client, domain, logger) {
    const params = [domain];
    const selectQuery = "SELECT id FROM domains WHERE name = $1 LIMIT 1;";
    let domainId = await getIdForQuery(client, selectQuery, params);
    if (domainId !== false) {
        logger(`Found ${domainId} for domains.name = ${domain}`);
        return domainId;
    }

    const insertQuery = `
        INSERT INTO
            domains(name)
        VALUES
            ($1)
        RETURNING
            id;
    `;
    domainId = await getIdForQuery(client, insertQuery, params);
    logger(`Inserted domains.name = ${domain} with id ${domainId}`);
    return domainId;
}


async function fetchTagId (client, tag, logger) {
    const tagTerms = [tag];
    const selectQuery = "SELECT id FROM tags WHERE name = $1 LIMIT 1;";
    let tagId = await getIdForQuery(client, selectQuery, tagTerms);
    if (tagId !== false) {
        logger(`Found ${tagId} for tags.name = ${tag}`);
        return tagId;
    }

    const insertQuery = `
        INSERT INTO
            tags(name)
        VALUES
            ($1)
        RETURNING
            id;
    `;
    tagId = await getIdForQuery(client, insertQuery, tagTerms);
    logger(`Inserted tags.name = ${tag} with id ${tagId}`);
    return tagId;
}


async function fetchTermId (client, term, logger) {
    const terms = [term];
    const selectQuery = "SELECT id FROM terms WHERE text = $1 LIMIT 1;";
    let termId = await getIdForQuery(client, selectQuery, terms);
    if (termId !== false) {
        logger(`Found ${termId} for terms.text = ${term}`);
        return termId;
    }

    const insertQuery = `
        INSERT INTO
            terms(text)
        VALUES
            ($1)
        RETURNING
            id;
    `;
    termId = await getIdForQuery(client, insertQuery, terms);
    logger(`Inserted terms.text = ${term} with id ${termId}`);
    return termId;
}


async function fetchScriptId (client, scriptText, deobScriptText, logger) {
    const scriptHash = crypto.createHash("sha256").update(scriptText).digest("hex");
    const selectTerms = [scriptHash];
    const selectQuery = "SELECT id FROM scripts WHERE sha256 = $1 LIMIT 1;";
    let scriptId = await getIdForQuery(client, selectQuery, selectTerms);
    if (scriptId !== false) {
        logger(`Found ${scriptId} for scripts.sha256 = ${scriptHash}`);
        return scriptId;
    }

    const insertQuery = `
        INSERT INTO
            scripts(sha256, text, deobfuscated)
        VALUES
            ($1, $2, $3)
        RETURNING
            id;
    `;
    const insertTerms = [scriptHash, scriptText, deobScriptText];
    scriptId = await getIdForQuery(client, insertQuery, insertTerms);
    logger(`Inserted scripts.sha256 = ${scriptHash} with id ${scriptId}`);
    return scriptId;
}


async function assignScriptToCrawlAsTagInlineScript (client, scriptId, crawlId, termId, logger) {
    const insertQuery = `
        INSERT INTO
            inline_scripts_terms(term_id, crawl_id, script_id)
        VALUES
            ($1, $2, $3)
        RETURNING
            id;
    `;
    const insertParams = [termId, crawlId, scriptId];
    const newId = await getIdForQuery(client, insertQuery, insertParams);
    logger(`Inserted script_id ${scriptId} as inline script for term ${termId} with id ${newId}.`);
    return newId;
}


async function assignScriptToCrawlAsTagRemoteScript (
    client, scriptId, crawlId,
    termId, url, logger
) {
    const insertQuery = `
        INSERT INTO
            remote_scripts_terms(term_id, crawl_id, script_id, url)
        VALUES
            ($1, $2, $3, $4)
        RETURNING
            id;
    `;
    const insertParams = [termId, crawlId, scriptId, url];
    const rs = await client.query(insertQuery, insertParams);
    const newId = rs.rows[0].id;

    logger(`Inserted script_id ${scriptId} as remote script for term ${termId} with id ${newId}.`);
    return newId;
}


async function assignScriptToCrawlAsDomainRemoteScript (
    client, scriptId, crawlId,
    domainId, url, logger
) {
    const insertQuery = `
        INSERT INTO
            remote_scripts_domains(domain_id, crawl_id, script_id, url)
        VALUES
            ($1, $2, $3, $4)
        RETURNING
            id;
    `;
    const insertParams = [domainId, crawlId, scriptId, url];
    const rs = await client.query(insertQuery, insertParams);
    const newId = rs.rows[0].id;

    logger(`Inserted script_id ${scriptId} as remote script for domain ${domainId} with id ${newId}.`);
    return newId;
}


async function fetchCrawlId (client, url, batchId, rank, logger) {
    const insertQuery = `
        INSERT INTO
            crawls(url, batch_id, alexa_rank)
        VALUES
            ($1, $2, $3)
        RETURNING
            id;
    `;
    const insertTerms = [url, batchId, rank];
    const crawlId = await getIdForQuery(client, insertQuery, insertTerms);

    logger(`Finished inserting crawl of ${url} for batch ${batchId} as id ${crawlId}`);
    return crawlId;
}


async function insertCrawlDomainMatches (client, crawlId, domainResults, logger) {
    for (const [domain, domainMatches] of Object.entries(domainResults)) {
        const domainId = await fetchDomainId(client, domain, logger);
        for (const [scriptUrl, scriptRecord] of Object.entries(domainMatches)) {
            const scriptText = scriptRecord.orig;
            const deobScriptText = scriptRecord.deob;
            const scriptId = await fetchScriptId(client, scriptText, deobScriptText, logger);
            const remoteScriptArgs = [client, scriptId, crawlId, domainId, scriptUrl, logger];
            await assignScriptToCrawlAsDomainRemoteScript(...remoteScriptArgs);
        }
    }
}


async function insertCrawlTermMatches (client, crawlId, termResults, logger) {
    const queriedTerms = Object.keys(termResults);
    for (const term of queriedTerms) {
        const termId = await fetchTermId(client, term, logger);
        const inlineScripts = termResults[term].inline;
        if (inlineScripts !== undefined) {
            for (const script of inlineScripts) {
                const scriptText = script.orig;
                const deobScriptText = script.deob;
                const scriptId = await fetchScriptId(client, scriptText, deobScriptText, logger);
                const inlineScriptArgs = [client, scriptId, crawlId, termId, logger];
                await assignScriptToCrawlAsTagInlineScript(...inlineScriptArgs);
            }
        }

        const remoteScripts = termResults[term].remote;
        if (remoteScripts !== undefined) {
            for (const remoteScriptInfo of remoteScripts) {
                const script = remoteScriptInfo.text;
                const scriptText = script.orig;
                const deobScriptText = script.deob;
                const scriptUrl = remoteScriptInfo.url;
                const scriptId = await fetchScriptId(client, scriptText, deobScriptText, logger);
                await assignScriptToCrawlAsTagRemoteScript(
                    client, scriptId,
                    crawlId, termId, scriptUrl, logger
                );
            }
        }
    }
}

module.exports.record = record;
