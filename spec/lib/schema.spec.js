const fs = Promise.promisifyAll(require('fs'));
const Schema = require('../../lib/schema');

describe('schema module', () => {
  describe('readExternalDescription method', () => {
    const fakePath = 'some/path';
    beforeEach(() => {
      spyOn(fs, 'readFileAsync');
    });
    it('should read a description.asciidoc file based on provided file path and tack it onto a provided schema', done => {
      const fakeContents = 'IMPORTANT CONTENTS!';
      fs.readFileAsync.and.returnValue(Promise.resolve(fakeContents));
      const schema = new Schema(fakePath, '.schema.json');
      const skeem = {};
      schema.schema = skeem;
      schema.readExternalDescription()
        .then(returnedSchema => {
          expect(returnedSchema.description).toEqual(fakeContents);
          expect(skeem.description).toEqual(fakeContents);
        }).catch(() => {
          fail('unexpected error invoked!');
        }).done(done);
    });
  });
});
