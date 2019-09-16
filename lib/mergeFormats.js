const Graph = require('graph-data-structure');

const formats = new Graph();
formats.addNode('date-time');
formats.addNode('date');
formats.addNode('time');
formats.addNode('email');
formats.addNode('idn-email');
formats.addNode('hostname');
formats.addNode('idn-hostname');
formats.addNode('ipv4');
formats.addNode('ipv6');
formats.addNode('uri');
formats.addNode('uri-reference');
formats.addNode('iri');
formats.addNode('iri-reference');
formats.addNode('uri-template');
formats.addNode('json-pointer');
formats.addNode('relative-json-pointer');
formats.addNode('regex');

formats.addEdge('email', 'idn-email');
formats.addEdge('hostname', 'idn-hostname');
formats.addEdge('uri', 'uri-reference');
formats.addEdge('uri', 'iri');
formats.addEdge('iri', 'iri-reference');
formats.addEdge('uri-reference', 'iri-reference');
formats.addEdge('iri-reference', 'uri-template');
formats.addEdge('json-pointer', 'relative-json-pointer');

function mergeFormats(a, b) {
  if (!a) {
    return b;
  } else if (!b) {
    return a;
  }
  var result = formats.lowestCommonAncestors(a, b);
  if (result.length === 0) {
    throw new Error('Formats ' + a + ' and ' + b + ' are not merge-able');
  }
  return result[0];
};

module.exports = mergeFormats;
