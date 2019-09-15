/**
 * Copyright 2017 Adobe Systems Incorporated. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

const writeFile = require('./writeFiles');
const Promise = require('bluebird');
const path = require('path');
const _ = require('lodash');
const ejs = require('ejs');
const pejs = Promise.promisifyAll(ejs);
// const validUrl = require('valid-url');
const logger = require('winston');

function render([ template, context ]) {
  return pejs.renderFileAsync(template, context, { debug: false });
}

function build(total, fragment) {
  return total + fragment;
}

function assoc(obj, key, value) {
  if (obj == null) {
    obj = {};
  }
  obj[key] = value;
  return obj;
}

const generateAsciidoc = function(filename, schema, schemaPath, outDir, dependencyMap) {
  outDir = outDir ? outDir : path.resolve(path.join('.', 'out'));

  logger.info(filename);
  logger.debug(dependencyMap);

  const multi = [
    [ 'frontmatter.ejs', { meta: schema.meta } ],
    [ 'schema.ejs', {
      paths: [ '' ],
      schema: schema,
    } ],
  ];

  // find definitions that contain properties that are not part of the main schema
  multi = multi.map((template, context) => {
    return [
      path.join(__dirname, '../templates/asciidoc/' + template),
      assoc(context, '_', _)
    ];
  });

  return Promise.reduce(Promise.map(multi, render), build, '').then(str => {
    const mdfile = path.basename(filename).slice(0, -5) + '.asciidoc';
    return writeFile(path.join(path.join(outDir), path.dirname(filename.substr(schemaPath.length))), mdfile, str);
  }).then(out => {
    logger.debug('asciidoc written (promise)', out);
    return out;
  });
};

module.exports = generateAsciidoc;
