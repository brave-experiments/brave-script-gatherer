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
            return ["tags argument, if provided, must be an array of strings.", null];
        }
    }

    const validTerms = isArrayOfStrings(args.terms);
    const validDomains = isArrayOfStrings(args.domains);
    if (validTerms === false && validDomains === false) {
        return ["Must provide either search terms, or search domains.", null];
    }

    if (validTerms === false) {
        delete args.terms;
    }

    if (validDomains === false) {
        delete args.domains;
    }

    if (typeof args.batch !== "string" || args.batch.length !== 36) {
        return ["Batch argument must be a UUIDv4 string.", null];
    }

    if (typeof args.url !== "string") {
        return ["'url' argument is required and must be a valid URL.", null];
    }

    try {
        new urlLib.URL(args.url);
    } catch (_) {
        return [`Expected valid URL in 'url' argument, but found${args.url}.`, null];
    }

    return [null, true];
};
