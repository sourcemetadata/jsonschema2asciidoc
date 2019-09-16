/**
 * Copyright 2017 Adobe Systems Incorporated. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

const writeFile = require('./writeFiles');
const Promise = require('bluebird');
const _ = require('lodash');
const ejs = require('ejs');
const path = require('path');
const pejs = Promise.promisifyAll(ejs);
const validUrl = require('valid-url');
const logger = require('winston');

function relativePath(full, base) {
  full = full.replace(/\\/g, '/');
  base = base.replace(/\\/g, '/');
  if (full.indexOf(base) === 0) {
    return full.substr(base.length).replace(/\.json$/, '');
  } else {
    return full;
  }
}

function directory(full, base) {
  return relativePath(full, base).replace(/[^\/]+$/, '');
}

/**
 * Generates a README.asciidoc file from the `schemas` passed in at directory `out`
 * @param {array[string]} paths - path of generated asciidoc files
 * @param {map} schemas - map of resolved schemas
 * @param {string} out - output directory
 * @param {string} base - schema base directory
 */
const generateReadme = (paths, schemas, out, base) => {
  const coreinfo = _.values(schemas).map(schema => {
    return {
      id: schema.jsonSchema.$id,
      title: schema.jsonSchema.title,
      full: schema.filePath,
      status: schema.jsonSchema['meta:status'] !== undefined ? (schema.jsonSchema['meta:status'].charAt(0).toUpperCase() + schema.jsonSchema['meta:status'].slice(1)) : 'Unknown',
      relative: relativePath(schema.filePath, base),
      dir: directory(schema.filePath, base),
    };
  });
  const ctx = {
    paths: paths,
    _: _,
    validUrl: validUrl,
    schemas: schemas,
    core: coreinfo,
    groups: _.groupBy(coreinfo, key => { return key.dir; })
  };

  return pejs.renderFileAsync(path.join(__dirname, '../templates/asciidoc/readme.ejs'), ctx, { debug: false }).then(str => {
    logger.info('Writing README');
    return writeFile(path.join(out, 'README.asciidoc'), str);
  }).then(out => {
    logger.debug('asciidoc written (promise)', out);
    return out;
  });
};

module.exports = generateReadme;

