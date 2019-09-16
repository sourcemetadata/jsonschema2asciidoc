/**
 * Copyright 2017 Adobe Systems Incorporated. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

const Promise = require('bluebird');
const fs = Promise.promisifyAll(require('fs'));
const Schemas = require('../../lib/schemas');
const logger = require('winston');
const NullTransport = require('winston-null');

logger.add(new NullTransport.NullTransport());

describe('schemas module', () => {
  describe('readSchemaFiles method', () => {
    const fakePath = 'some/path';
    const schemas = new Schemas();
    beforeEach(() => {
      spyOn(fs, 'readFileAsync').and.returnValue(Promise.resolve('{"schema":"yes"}'));
    });
    describe('reading schema files without an $id key', () => {
      beforeEach(() => {
        spyOn(logger, 'warn').and.callThrough();
      });
      it('should return a schema path map with path to the file as a key, and object value with path and json schema', done => {
        schemas.readSchemaFiles({}, fakePath)
          .then(map => {
            expect(map[fakePath]).toBeDefined();
            expect(map[fakePath].filePath).toEqual(fakePath);
            expect(map[fakePath].jsonSchema).toEqual({ schema:'yes' });
            expect(logger.warn.calls.allArgs()).toEqual([ [ 'schema ' + fakePath + ' has no $id' ] ]);
          })
          .catch(fail)
          .done(done);
      });
    });
    describe('reading schema files with an $id key', () => {
      beforeEach(() => {
        fs.readFileAsync.and.returnValue(Promise.resolve('{"$id":"allyourbase"}'));
      });
      it('should return a schema path map with $id value as a key, and object value with path and json schema', done => {
        schemas.readSchemaFiles({}, fakePath)
          .then(map => {
            expect(map['allyourbase']).toBeDefined();
            expect(map['allyourbase'].filePath).toEqual(fakePath);
            expect(map['allyourbase'].jsonSchema).toEqual({ $id:'allyourbase' });
          })
          .catch(fail)
          .done(done);
      });
      it('should not overwrite the value for an existing $id key in the schema path map', done => {
        schemas.readSchemaFiles({ allyourbase:{} }, fakePath)
          .then(map => {
            expect(map['allyourbase']).toBeDefined();
            expect(map['allyourbase'].filePath).not.toBeDefined();
            expect(map['allyourbase'].jsonSchema).not.toBeDefined();
          })
          .catch(fail)
          .done(done);
      });
    });
  });
});
