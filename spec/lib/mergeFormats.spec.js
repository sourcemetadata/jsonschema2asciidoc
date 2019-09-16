const mergeFormats = require('../../lib/mergeFormats');

describe('mergeFormats function', () => {
  expect(mergeFormats('uri', 'uri-reference')).toEqual('uri-reference');
  expect(mergeFormats('iri', 'uri')).toEqual('uri-template');
  expect(() => { mergeFormats('date', 'time'); }).toThrow(new Error('Formats date and time are not merge-able'));
});
