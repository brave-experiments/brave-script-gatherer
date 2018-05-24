"use strict";

const urlLib = require("url");

const isArrayOfStrings = value => {
    if (Array.isArray(value) === false) {
        return false;
    }

    if (value.length === 0) {
        return false;
    }

    return value.every(term => typeof term === "string");
};

module.exports.validateArgs = args => {
    // Make sure that if metadata has been specified, its JSON-able
    if (args.tags !== undefined) {
        if (isArrayOfStrings(args.tags) === false) {
            return {
                msg: "tags argument, if provided, must be an array of strings.",
                value: args.tags,
            };
        }
    }

    const validTerms = isArrayOfStrings(args.terms);
    const validDomains = isArrayOfStrings(args.domains);
    if (validTerms === false && validDomains === false) {
        return {
            msg: "Must provide either search terms, or search domains.",
        };
    }

    if (validTerms === false) {
        delete args.terms;
    }

    if (validDomains === false) {
        delete args.domains;
    }

    if (typeof args.batch !== "string" || args.batch.length !== 36) {
        return {
            msg: "Batch argument must be a UUIDv4 string.",
            value: args.batch,
        };
    }

    if (typeof args.url !== "string") {
        return {
            msg: "'url' argument is required and must be a valid URL.",
            value: args.url,
        };
    }

    try {
        new urlLib.URL(args.url);
    } catch (_) {
        return {
            msg: "Invalid URL for url argument.",
            value: args.url,
        };
    }

    return;
};
