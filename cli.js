#! /usr/bin/env node
/**
 * Copyright 2017 Adobe Systems Incorporated. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

const Promise = require('bluebird');
const path = require('path');
const _ = require('lodash');
const fs = Promise.promisifyAll(require('fs'));
const readdirp = require('readdirp');
const Ajv = require('ajv');
const logger = require('winston');

const Schemas = require('./lib/schemas');
const readSchemaFiles = require('./lib/readSchemaFiles');

// parse/process command line arguments
const argv = require('optimist')
  .usage('Generate Asciidoc documentation from JSON Schema.\n\nUsage: $0')
  .demand('d')
  .alias('d', 'input')
  // TODO: is baseURL still a valid parameter?
  .describe('d', 'path to directory containing all JSON Schemas or a single JSON Schema file. This will be considered as the baseURL. By default only files ending in .schema.json will be processed, unless the schema-extension is set with the -e flag.')
  .alias('o', 'out')
  .describe('o', 'path to output directory')
  .default('o', path.resolve(path.join('.', 'out')))
  .alias('m', 'meta')
  .describe('m', 'add metadata elements to .asciidoc files Eg -m template=reference. Multiple values can be added by repeating the flag Eg: -m template=reference -m hide-nav=true')
  .alias('s', 'metaSchema')
  .describe('s', 'Custom meta schema path to validate schemas')
  .alias('x', 'schema-out')
  .describe('x', 'output JSON Schema files including description and validated examples in the _new folder at output directory, or suppress with -')
  .alias('e', 'schema-extension')
  .describe('e', 'JSON Schema file extension eg. schema.json or json')
  .alias('n', 'no-readme')
  .describe('v', 'JSON Schema Draft version to use. Supported: 04, 06, 07 (default)')
  .alias('v', 'draft')
  .default('v', '07')
  .describe('n', 'Do not generate a README.asciidoc file in the output directory')
  .check(args => {
    if (!fs.existsSync(args.input)) {
      throw 'Input file "' + args.input + '" does not exist!';
    }
    if (args.s && !fs.existsSync(args.s)) {
      throw 'Meta schema file "' + args.s + '" does not exist!';
    }
  })
  .argv;

logger.configure({
  level: 'info',
  format: logger.format.combine(
    logger.format.splat(),
    logger.format.simple()
  ),
  transports: [
    new logger.transports.Console({})
  ]
});

const ajv = new Ajv({ allErrors: true, messages:true, schemaId: 'auto', logger: logger });
Schemas.setAjv(ajv);
logger.info(argv.v);
if (argv.v === '06' || argv.v === 6) {
  logger.info('enabling draft-06 support');
  ajv.addMetaSchema(require('ajv/lib/refs/json-schema-draft-06.json'));
} else if (argv.v === '04' || argv.v === 4) {
  ajv.addMetaSchema(require('ajv/lib/refs/json-schema-draft-04.json'));
}
const meta = {};
const schemaPath = path.resolve(argv.d);
const outDir = path.resolve(argv.o);
const schemaDir = argv.x === '-' ? '' : argv.x ? path.resolve(argv.x) : outDir;
const target = fs.statSync(schemaPath);
const readme = argv.n !== true;
const schemaExtension = argv.e || 'schema.json';

if (argv.s) {
  ajv.addMetaSchema(require(path.resolve(argv.s)));
}

if (argv.m) {
  if (_.isArray(argv.m)) {
    _.each(argv.m, item => {
      const metaItem = item.split('=');
      if (metaItem.length === 2) {
        meta[metaItem[0]] = metaItem[1];
      }
    });
  } else {
    const metaItem = (argv.m).split('=');
    if (metaItem.length === 2) {
      meta[metaItem[0]] = metaItem[1];
    }
  }
}

logger.info('output directory: %s', outDir);
if (target.isDirectory()) {
  // the ajv json validator will be passed into the main module to help with processing
  const files = [];
  readdirp({ root: schemaPath, fileFilter: `*.${schemaExtension}` })
    .on('data', entry => {
      files.push(entry.fullPath);
      try {
        ajv.addSchema(require(entry.fullPath), entry.fullPath);
      } catch (e) {
        logger.error('Ajv processing error for schema at path %s', entry.fullPath);
        logger.error(e);
        process.exit(1);
      }
    })
    .on('end', () => {
      return Promise.reduce(files, readSchemaFiles, {})
        .then(schemas => {
          logger.info('finished reading all *.%s files in %s, beginning processing...', schemaExtension, schemaPath);
          return Schemas.process(schemas, schemaPath, outDir, schemaDir, meta, readme, schemaExtension);
        })
        .then(() => {
          logger.info('Processing complete.');
        })
        .catch(err => {
          logger.error(err);
          process.exit(1);
        });
    })
    .on('error', err => {
      logger.error(err);
      process.exit(1);
    });
} else {
  readSchemaFiles({}, schemaPath)
    .then(schemas => {
      ajv.addSchema(require(schemaPath), schemaPath);
      logger.info('finished reading %s, beginning processing...', schemaPath);
      return Schemas.process(schemas, schemaPath, outDir, schemaDir, meta, false, schemaExtension);
    })
    .then(() => {
      logger.info('Processing complete.');
    })
    .catch(err => {
      logger.error(err);
      process.exit(1);
    });
}
