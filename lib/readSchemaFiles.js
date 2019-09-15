/**
 * Copyright 2017 Adobe Systems Incorporated. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

const Schema = require('./schema');

// Reads schema files and modifies a schema paths map object based on the schema file.
// Returns the schema path map object.
/**
 * Reads the schema file specified at `path` and accumulates a
 * `Map` of schema $ids (or paths, if a schema has no $id) and Schema objects in `schemas`.
 * Typically, this function is used in a `reduce` pattern.
 * @param {Map} schemas - the map of schema $ids/paths and Schema instances
 * @param {String} path - the full path to the schema
 */
module.exports = function readSchemaFiles(schemas, path) {
  const schema = new Schema(path);
  schema.readFile()
    .then(schema => {
      if (!schemas[schema.$idOrPath]) {
        schemas[schema.$idOrPath] = schema;
      } else {
        throw new Error('schema ' + schema.$idOrPath + ' has duplicate $id');
      }
    });
};
