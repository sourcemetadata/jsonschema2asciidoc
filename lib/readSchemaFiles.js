/**
 * Copyright 2017 Adobe Systems Incorporated. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

const Promise = require('bluebird');
const fs = Promise.promisifyAll(require('fs'));
const logger = require('winston');

// Reads schema files and modifies a schema paths map object based on the schema file.
// Returns the schema path map object.
/**
 * Reads the schema file specified at `path` and accumulates a
 * `map` of schema file paths and schema contents in `schemaPathsMap`.
 * Typically, this function is used in a `reduce` pattern.
 * @param {map} schemaPathsMap - the map of schema paths and JSON schemas
 * @param {*} path - the full path to the schema
 */
module.exports = function readSchemaFiles(schemaPathsMap, path) {
  return fs.readFileAsync(path)
    .then(data => {
      const schema = JSON.parse(data);
      const schemaPathsMapItem = {
        path: path,
        jsonSchema: schema
      };
      if (schema.$id && schema.$id.length > 0) {
        if (!schemaPathsMap[schema.$id]) {
          schemaPathsMap[schema.$id] = schemaPathsMapItem;
        } else {
          logger.error('schema ' + path + ' has duplicate $id');
          process.exit(1);
        }
      //TODO check Missing Specific properties to throw warning // function for warning
      } else {
        logger.warn('schema ' + path + ' has no $id');
        schemaPathsMap[path] = schemaPathsMapItem;
      }
      return schemaPathsMap;
    });
};
