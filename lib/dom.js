"use strict";

/**
 * Returns an array of the subtree below this node, including the node.
 *
 * @param {object} node
 *   A cheerio wrapped DOM node.
 *
 * @return {array}
 *   An arraty of DOM nodes, ordered by their position in the tree.
 */
const flattenTree = node => {
    let nodes = [node];
    if (node.childNodes) {
        const nonTextNodes = node.childNodes.filter(elm => elm.tagName !== null);
        for (const childSection of nonTextNodes.map(flattenTree)) {
            nodes = nodes.concat(childSection);
        }
    }
    return nodes;
};


/**
 * Takes a cheerio parsed dom, and flattens it into a single array of nodes,
 * depth first.
 *
 * @param {object} doc
 *   cheerio parsed dom object.
 *
 * @return {array}
 *   An array of DOM nodes, in the order they appeared in the document.
 */
const flattenDom = doc => {
    const rootNode = doc.root().get(0).firstChild;
    return flattenTree(rootNode);
};


/**
 * Finds the distance between two nodes in a flattened dom (Ie ignoring depth,
 * just in parse order).
 *
 * @param {object} doc
 *   cheerio parsed dom object.
 * @param {object} nodeA
 *   A cheerio node in the provided document.
 * @param {object} nodeB
 *   A cheerio node in the provided document.
 *
 * @return int
 *   The distance between the two nodes in the document, or -1 if either
 *   of the nodes could not be found in the document.
 */
const distanceBetweenNodes = (doc, nodeA, nodeB) => {
    const flatDom = flattenDom(doc);
    const positionOfA = flatDom.indexOf(nodeA);
    const positionOfB = flatDom.indexOf(nodeB);
    if (positionOfA === -1 || positionOfB === -1) {
        return -1;
    }
    return Math.abs(positionOfA - positionOfB);
};


/**
 * Returns the first node in the document that both appears before the given
 * node, and matches the given predicate.
 *
 * @param {object} doc
 *   cheerio parsed dom object.
 * @param {object} node
 *   A cheerio node in the provided document.
 * @param {function} predicate
 *   A function that receives a cheerio node, and returns true or false.
 *
 * @return {?object}
 *   Either a cheerio node object, or undefined.
 */
const closestPrevNode = (doc, node, predicate) => {
    const flatDom = flattenDom(doc);
    console.log(flatDom);
    const positionOfNode = flatDom.indexOf(node);

    if (positionOfNode === -1) {
        return;
    }

    const prevNodes = flatDom.slice(0, positionOfNode);
    return prevNodes.reverse().find(predicate);
};


module.exports = {
    closestPrevNode,
    flattenDom,
    distanceBetweenNodes,
};
