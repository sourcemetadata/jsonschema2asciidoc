/**
 * Copyright 2017 Adobe Systems Incorporated. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

const Promise = require('bluebird');
const fs = Promise.promisifyAll(require('fs'));
const schemas = require('../../lib/schemas');

describe('schemas module', () => {
  describe('getDescription method', () => {
    beforeEach(() => {
      spyOn(fs, 'readFileAsync');
    });
    it('should read a description.asciidoc file based on provided file path and tack it onto a provided schema', done => {
      var fakeContents = 'IMPORTANT CONTENTS!';
      fs.readFileAsync.and.returnValue(Promise.resolve(fakeContents));
      var skeem = {};
      schemas.getDescription('/some/path', skeem)
        .then(returnedSchema => {
          expect(returnedSchema.description).toEqual(fakeContents);
          expect(skeem.description).toEqual(fakeContents);
        }).catch(() => {
          fail('unexpected error invoked!');
        }).done(done);
    });
  });
});
