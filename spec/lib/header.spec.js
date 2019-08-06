const { Header, headers } = require('../../lib/header');

beforeEach(function() {
  jasmine.addMatchers(require('jasmine-diff')(jasmine, {
    colors: true,
    inline: true
  }));
});

describe('Header Integration Test', () => {
  it('Renders a header without link if link is unknown', () => {
    const h = new Header('Foo');
    expect(h.renderHeader()).toEqual('Foo');
  });

  it('Renders a header with link if link is known', () => {
    const h = new Header('Foo', '../bar.asciidoc');
    expect(h.renderHeader()).toEqual('link:../bar.asciidoc[Foo]');
  });

  it('Renders a header body without link if link is unknown', () => {
    const h = new Header('Foo', null, 'Bar');
    expect(h.renderValue()).toEqual('Bar');
  });

  it('Renders a header body with link if link is known', () => {
    const h = new Header('Foo', '../bar.asciidoc', 'Bar', '#bar-asciidoc');
    expect(h.renderValue()).toEqual('link:#bar-asciidoc[Bar]');
  });
});

describe('Headers Integration Test', () => {
  it('Abstract', () => {
    const schema = {
      additionalProperties: true,
      'meta:extensible': false,
      properties: { 'foo':'bar', 'bar': 'baz' }
    };

    const h = headers(schema, '/home/lars', '/home/lars/complex.schema.json');

    const result = `|===
|Abstract |Extensible |Status |Identifiable |Custom Properties |Additional Properties |Defined In

|Can be instantiated
|No
|Experimental
|No
|Forbidden
|Permitted
|link:complex.schema.json[complex.schema.json]
|===`;
    expect(h.render()).toEqual(result);
  });

  it('Asciidoc links should be correct when schema is in a subdir.', () => {
    const schema = {
      additionalProperties: true,
      'meta:extensible': false,
      properties: { 'foo':'bar', 'bar': 'baz' }
    };

    const h = headers(schema, '/home/lars', '/home/lars/some/deep/path/complex.schema.json');

    const result = `|===
|Abstract |Extensible |Status |Identifiable |Custom Properties |Additional Properties |Defined In

|Can be instantiated
|No
|Experimental
|No
|Forbidden
|Permitted
|link:complex.schema.json[some/deep/path/complex.schema.json]
|===`;
    expect(h.render()).toEqual(result);
  });

});
