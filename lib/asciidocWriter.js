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
const { headers } = require('./header');
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

function flatten(dependencies) {
  let deps = [];
  if (dependencies) {
    const key = _.keys(dependencies)[0];
    deps = _.toPairs(dependencies[key]).map(([ first, second ]) => {
      second.$id = first;
      return second;
    });
  }
  return deps;
}

function stringifyExamples(examples) {
  if (examples) {
    if (typeof examples === 'string') {
      examples = [ examples ];
    }
    logger.debug(examples);
    return examples.map(example => {
      return JSON.stringify(example, null, 2);
    });
  } else {
    return false;
  }
}

/**
 * Finds a simple, one-line description of the property's type
 * @param {object} prop - a JSON Schema property definition
 */
function simpletype(prop) {
  const type = prop.type;
  if (prop.$ref!==undefined) {
    if (prop.$linkVal!==undefined) {
      prop.simpletype = prop.$linkVal;
    } else {
      logger.warn('unresolved reference: ' + prop.$ref);
      prop.simpletype = 'reference';
    }
  } else if (prop.enum!==undefined) {
    prop.simpletype = '`enum`';
    if (prop['meta:enum']===undefined) {
      prop['meta:enum'] = {};
    }
    for (let i=0;i<prop.enum.length;i++) {
      if (prop['meta:enum'][prop.enum[i]]===undefined) {
        //setting an empty description for each unknown enum
        prop['meta:enum'][prop.enum[i]] = '';
      }
    }
  } else if (prop.const!==undefined) {
    prop.simpletype = '`const`';
  } else if (type==='string') {
    prop.simpletype = '`string`';
  } else if (type==='number') {
    prop.simpletype = '`number`';
  } else if (type==='boolean') {
    prop.simpletype = '`boolean`';
  } else if (type==='integer') {
    prop.simpletype = '`integer`';
  } else if (type==='object') {
    prop.simpletype = '`object`';
  } else if (type==='null') {
    prop.simpletype = '`null`';
  } else if (type==='array') {
    if (prop.items!==undefined) {
      const innertype = simpletype(prop.items);
      if (innertype.simpletype==='complex') {
        prop.simpletype = '`array`';
      } else {
        logger.debug(prop.title);
        prop.simpletype = innertype.simpletype.replace(/(`)$/, '[]$1');
      }
    } else {
      prop.simpletype = '`array`';
    }
  } else if (Array.isArray(type)) {
    function nullfilter(str) {
      return str!=='null';
    }
    var filtered = type.filter(nullfilter);
    if (type.length - 1 === filtered.length) {
      prop.nullable = true;
    }
    if (filtered.length===1) {
      prop.type = filtered[0];
      prop.simpletype = '`' + filtered[0] + '`';
    } else {
      prop.type = filtered;
      prop.simpletype = 'multiple';
    }
  } else {
    prop.simpletype = 'complex';
  }
  return prop;
}

function ejsRender(template, ctx) {
  let p = pejs.renderFileAsync(path.join(__dirname, '../templates/asciidoc/' + template + '.ejs'), ctx, { debug: false });
  return p.value();
  //return JSON.stringify(obj, null, 2);
}

const generateAsciidoc = function(filename, schema, schemaPath, outDir, dependencyMap, docs) {
  //var ctx = {
  //  schema: schema,
  //  _: _,
  //  validUrl: validUrl,
  //  dependencyMap:dependencyMap
  //};

  outDir = outDir ? outDir : path.resolve(path.join('.', 'out'));

  logger.info(filename);
  logger.debug(dependencyMap);

  // this structure allows us to have separate templates for each element. Instead of having
  // one huge template, each block can be built individually
  let multi = [
    [ 'frontmatter.ejs', { meta: schema.metaElements } ],
    [ 'header.ejs', {
      schema: schema,
      dependencies: flatten(dependencyMap),
      table: headers(schema, schemaPath, filename, docs).render()
    } ],
    [ 'schema.ejs', {
      path: '',
      schema: schema,
    } ],
  ];

  // Processing schema.definitions before schema.properties to get any required properties present in definitions

  //find definitions that contain properties that are not part of the main schema
  multi = multi.map(([template, context]) => {
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
