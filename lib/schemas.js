/**
 * Copyright 2017 Adobe Systems Incorporated. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

const path = require('path');
const _ = require('lodash');
const logger = require('winston');
const readdirp = require('readdirp');
const Promise = require('bluebird');
const fs = Promise.promisifyAll(require('fs'));
const asciidocWriter = require('./asciidocWriter');
const schemaWriter = require('./schemaWriter');
const readmeWriter = require('./readmeWriter');
var deff = '#/definitions/';
const pointer = require('json-pointer');
const Graph = require('graph-data-structure');
var smap; //TODO remove global
var sPath;
var wmap = {};
function get$refType(refValue) {
  var startpart = '', endpart = '', refType = '';
  var arr = refValue.split('#');
  if (arr.length > 1) {
    endpart = arr[1];
  }

  startpart = arr[0];
  //TODO yRelNoDef
  //relative-- yRelWithDef, yRelNoDef,
  //absolute-- yAbsWithDef, yAbsFSchema, yAbsWithFragment
  var refType = '';
  var deff = '/definitions/';

  //if (absUrlRegex.test(refVal)) {
  if (startpart.length > 1) {
    if (startpart in smap) {
      if (endpart.startsWith(deff)) {
        refType = 'yAbsWithDef';
      } else {
        if (endpart.length === 0) {
          refType = 'yAbsFSchema';
        } else {
          refType = 'yAbsWithFragment';
        }
      }
    }
  } else {
    if (endpart.startsWith(deff)) {
      refType = 'yRelWithDef';
    }
  }
  //  }
  return { startpart, endpart, refType };
}

function normaliseLinks(obj, refArr) {
  let basepath = refArr.startpart ;
  let $linkVal = '', $linkPath = '';
  if (basepath in smap) {
    let newpath = path.relative(path.dirname(sPath), smap[basepath].filePath).replace(/\\/g, '/'); // to cater windows paths
    let temp = newpath.slice(0, -5).split('/');
    $linkVal = obj.title ? obj.title : path.basename(newpath).slice(0, -5);
    $linkPath = temp.join('/') + '.asciidoc';
    return { $linkVal, $linkPath };
  }
}
var resolve$ref = Promise.method((val, base$id) => {
  let obj, link;
  if (!(base$id in wmap)) {
    wmap[base$id] = {};
  }
  let refArr = get$refType(val.$ref);
  if (refArr.refType === 'yRelWithDef') {
    refArr.startpart = base$id;
  }
  if (smap[refArr.startpart]) {
    obj = smap[refArr.startpart].jsonSchema;
    if (refArr.refType !== 'yRelWithDef') {
      link = normaliseLinks(obj, refArr);
      if (!wmap[base$id][refArr.startpart]) {
        wmap[base$id][refArr.startpart] = link;
      }

    }
    if (refArr.refType === 'yAbsFSchema') {
      val.type = link.$linkVal;
      val.$linkVal = link.$linkVal;
      val.$linkPath = link.$linkPath;
      return val;
    }

    if (pointer.has(obj, refArr.endpart)) {
      var ischema = _.cloneDeep(pointer.get(obj, refArr.endpart));
      _.forOwn(val, (v, k) => {
        if (k !== '$ref') {
          ischema[k] = v;
        }
      });
      return processISchema(ischema, refArr.startpart);
    }
  }
});

var processFurther = Promise.method((val, key, $id) => {
  let base$id = $id;
  if (val.$ref) {
    return resolve$ref(val, base$id);
  } else {
    if (val.items && val.type === 'array') {
      if (val.items.$ref) {
        resolve$ref(val.items).then(s => {
          _.forOwn(s, (v, k) => {
            if (k !== '$ref') {
              val.items[k] = v;
            }
          });
        });
      }
    } else if (val.properties && val.type === 'object') {
      _.each(_.entries(val.properties), property => {
        const [ propertyKey, propertyValue ] = property;
        if (propertyValue.$ref) {
          resolve$ref(propertyValue).then(s => {
            _.forOwn(s, (v, k) => {
              if (k !== '$ref') {
                val.properties[propertyKey][k] = v;
              }
            });
          });
        }
      });

      return val;
    }
    // TODO if any other keyword
    return val;
  }
});
function processISchema() {}; // define w/ function so it gets hoisted and we avoid eslint errors about what is defined first: processISchema or resolve$ref. Both rely on each other!
processISchema = Promise.method((schema, base$id) => {
  if (!(base$id in wmap)) {
    wmap[base$id] = {};
  }
  if (schema.anyOf || schema.oneOf) {
    // var $definitions = []
    schema.type = schema.anyOf ? 'anyOf' : 'oneOf';
    let arr = schema.anyOf ? schema.anyOf : schema.oneOf;
    _.each(arr, (value, index) => {
      if (value.$ref) {
        resolve$ref(value, base$id).then(piSchema => {
          delete arr[index];
          arr[index] = piSchema;
        });
      } else {
        processISchema(value, base$id).then(piSchema => {
          delete arr[index];
          arr[index] = piSchema;
        });
      }
    });
    //  schema["$definitions"] = $definitions;
    return schema;
  }

  if (schema.items) {

    let val = schema.items;
    if (!schema.type) {
      schema.type = 'array';
    }
    if (_.isArray(val)) {
      // TODO
    } else {
      if (val.$ref) {
        resolve$ref(val, base$id).then(piSchema => {//check // not sending correct id
          schema.items = piSchema;
        });
      } else {
        // TODO if such a scenario
      }
    }
  }
  // schema.$definitions = $definitions
  return schema;
});

function processSchema(schema) {
  return new Promise((resolve, reject) => {
    if (!schema.properties) {
      schema.properties = {};
    }
    var $id = schema.$id || schema.id;
    var base$id = $id;
    if (!(base$id in wmap)) {
      wmap[base$id] = {};
    }
    if (schema.allOf) {
      _.each(schema.allOf, value => {
        if (value.$ref) {
          let obj, link;
          var refArr = get$refType(value.$ref);
          if (refArr.refType === 'yRelWithDef') {
            refArr.startpart = base$id;
          }
          if (smap[refArr.startpart]) {
            obj = smap[refArr.startpart].jsonSchema;
            if (refArr.refType !== 'yRelWithDef') {
              link = normaliseLinks(obj, refArr);
              if (!wmap[base$id][refArr.startpart]) {
                wmap[base$id][refArr.startpart] = link;
              }
            }

            if (pointer.has(obj, refArr.endpart)) {
              var ischema = _.cloneDeep(pointer.get(obj, refArr.endpart));
              if (refArr.refType === 'yAbsFSchema') {
                processSchema(ischema).then(psSchema => {
                  if (psSchema.properties) {
                    _.forOwn(psSchema.properties, (val, key) => {
                      processFurther(val, key, refArr.startpart).then(pfSchema => {
                        if (pfSchema) {
                          schema.properties[key] = pfSchema;
                          schema.properties[key].$oSchema = {};
                          schema.properties[key].$oSchema.$linkVal = link.$linkVal;
                          schema.properties[key].$oSchema.$linkPath = link.$linkPath;

                          if (pfSchema.required) {
                            if (key in pfSchema.required) {
                              schema.required.push(key);
                            }
                          }
                        }
                      });
                    });
                  }
                });
              } else {
                if (ischema.properties) {
                  _.forOwn(ischema.properties, (val, key) => {
                    processFurther(val, key, refArr.startpart).then(pfSchema => {
                      if (pfSchema) {
                        schema.properties[key] = pfSchema;
                        if (refArr.refType === 'yAbsWithDef') {
                          schema.properties[key].$oSchema = {};
                          schema.properties[key].$oSchema.$linkVal = link.$linkVal;
                          schema.properties[key].$oSchema.$linkPath = link.$linkPath;

                        }
                        if (ischema.required) {
                          if (key in ischema.required) {
                            schema.required.push(key);
                          }
                        }
                      } else {
                        reject('No further schema found');
                      }
                    });
                  });
                }
              }
            }
          }
        } else {
          _.forOwn(value, (val, key) => {
            schema[key] = val;
            //
          });
          // TODO add properties if there // behaviour to be decided
        }
      });

      resolve(schema);
    } else if (schema.properties) {
      _.forOwn(schema.properties, (val, key) => {
        processFurther(val, key, base$id).then(pfSchema => {
          if (pfSchema) {
            schema.properties[key] = pfSchema;

            if (pfSchema.required) {
              if (key in pfSchema.required) {
                schema.required.push(key);
              }
            }
          }
        });
      });

      //TODO check if something missing left here
      resolve(schema);
    }
  });
  //generic $ref resolve present in top properties
}

var Schemas = (ajv, schemaPathsMap) => {
  this._ajv = ajv;
};

Schemas.resolveRef = (key, obj, currpath) => {
  if (key === '$ref') {
    var refVal = obj[key];
    var temp;
    const refUrl = new URL(refVal);
    if (refUrl.hostname) { // Absolute URL
      refUrl.hash = null;
      let basepath = refUrl.toString();
      if (basepath in this._schemaPathsMap) {
        let newpath = path.relative(path.dirname(currpath), this._schemaPathsMap[basepath].filePath).replace(/\\/g, '/'); //to cater windows paths
        obj.$ref = newpath;
        temp = newpath.slice(0, -5).split('/');
        obj.$linkVal = path.basename(newpath).slice(0, -5);
        obj.$linkPath = temp.join('/') + '.asciidoc';
        // TODO display with title or file path name title
      } else {
        obj.$linkPath = refVal;
        temp = refVal.split('/'); // TODO
        obj.$linkVal = temp.pop() || temp.pop();
      }

    } else if (refVal.startsWith(deff)) {
      obj.$linkVal = refVal.slice(deff.length);
      obj.$linkPath = '#' + obj.$linkVal.replace(/ /g, '-');
    } else if (refVal.endsWith('json')) {
      temp = refVal.slice(0, -5).split('/');
      obj.$linkVal = temp[temp.length - 1];
      obj.$linkPath = temp.join('/') + '.asciidoc';
    }
  } else if (key === 'anyOf' || key === 'oneOf' || key === 'allOf') {
    obj.$type = key;
  }

  return;
};

/* The following function does not seem to be used anymore!
const traverseSchema = function(object,schemaFilePath) {
  return new Promise((resolve,reject) => {
    const recurse = (curr,key,prev) => {
      if (key) {
        if (key === 'anyOf' || key === 'oneOf' || key === 'allOf') {
          prev.$type = key;
        }
      }
      var result;
      if (Array.isArray(curr)) {
        curr.map((item,index) => recurse(item,index,curr));
      } else {
        (typeof curr === 'object') ? Object.keys(curr).map(key => recurse(curr[key],key,curr)) : Schema.resolveRef(key,prev,schemaFilePath);
      }
      return object;
    };
    resolve(recurse(object));
  });
};
*/

Schemas.readExternalExamples = schemaPathsMapItem => {
  const exampleFileNames = [];
  const examples = [];
  const dirname = path.dirname(schemaPathsMapItem.path);
  let filename = path.basename(schemaPathsMapItem.path, path.extname(schemaPathsMapItem.path));
  // TODO: Invalid handling of . in file name
  filename = filename.split('.')[0] + '.example.*.json';
  return new Promise((resolve, reject) => {
    readdirp({ root: dirname, fileFilter: filename })
      .on('data', entry => exampleFileNames.push(entry.fullPath))
      .on('end', () => resolve(exampleFileNames))
      .on('error', err => reject(err));
  }).then(exampleFileNames => {
    if (exampleFileNames.length > 0) {
      var validate = this._ajv.compile(schemaPathsMapItem.jsonSchema);
      return Promise.map(exampleFileNames, entry => {
        return fs.readFileAsync(entry).then(example => {
          let data = JSON.parse(example.toString());
          let valid = validate(data);
          if (valid) {
            examples.push({
              filename: entry,
              data: data
            });
          } else {
            logger.error(entry + ' is an invalid Example');
          }
        });
      }).then(() => {
        // Sort according to filenames in order not to have random prints
        if (!schemaPathsMapItem.jsonSchema.examples) {
          schemaPathsMapItem.jsonSchema.examples = [];
        }
        examples.sort(a, b => {
          return a.filename > b.filename ? 1 : -1;
        }).forEach(element => { // TOTHINK
          schemaPathsMapItem.jsonSchema.examples.push(element);
        });
        return schemaPathsMapItem;
      });
    } else {
      return schemaPathsMapItem;
    }
  });
};

Schemas.readExternalDescription = schemaPathsMapItem => {
  let descriptionFileName = path.basename(schemaPathsMapItem.path, path.extname(schemaPathsMapItem.path));
  // TODO: Invalid handling of . in file name
  descriptionFileName = descriptionFileName.split('.')[0] + '.description.asciidoc';
  return fs.readFileAsync(path.resolve(path.dirname(schemaPathsMapItem.path), descriptionFileName), 'utf8')
    .then(description => {
      schemaPathsMapItem.jsonSchema.description = description.replace(/\r\n/g, '\n').replace(/\n$/g, '');
      return schemaPathsMapItem;
    })
    .catch(() => {
      return schemaPathsMapItem;
    });
};

Schemas.setAjv = ajv => {
  this._ajv = ajv;
};

/**
 * Finds a simple, one-line description of the property's type
 * @param {object} prop - a JSON Schema property definition
 */
function simpletype(prop) {
  const type = prop.type;
  if (prop.$ref! == undefined) {
    if (prop.$linkVal !== undefined) {
      prop.simpletype = prop.$linkVal;
    } else {
      logger.warn('unresolved reference: ' + prop.$ref);
      prop.simpletype = 'reference';
    }
  } else if (prop.enum !== undefined) {
    prop.simpletype = '`enum`';
    if (prop['meta:enum'] === undefined) {
      prop['meta:enum'] = {};
    }
    for (let i = 0; i < prop.enum.length; i++) {
      if (prop['meta:enum'][prop.enum[i]] === undefined) {
        //setting an empty description for each unknown enum
        prop['meta:enum'][prop.enum[i]] = '';
      }
    }
  } else if (prop.const !== undefined) {
    prop.simpletype = '`const`';
  } else if (type === 'string') {
    prop.simpletype = '`string`';
  } else if (type === 'number') {
    prop.simpletype = '`number`';
  } else if (type === 'boolean') {
    prop.simpletype = '`boolean`';
  } else if (type === 'integer') {
    prop.simpletype = '`integer`';
  } else if (type === 'object') {
    prop.simpletype = '`object`';
  } else if (type === 'null') {
    prop.simpletype = '`null`';
  } else if (type === 'array') {
    if (prop.items !== undefined) {
      const innertype = simpletype(prop.items);
      if (innertype.simpletype === 'complex') {
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
      return str !== 'null';
    }
    var filtered = type.filter(nullfilter);
    if (type.length - 1 === filtered.length) {
      prop.nullable = true;
    }
    if (filtered.length === 1) {
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

const formats = Graph();
formats.addNode('date-time');
formats.addNode('date');
formats.addNode('time');
formats.addNode('email');
formats.addNode('idn-email');
formats.addNode('hostname');
formats.addNode('idn-hostname');
formats.addNode('ipv4');
formats.addNode('ipv6');
formats.addNode('uri');
formats.addNode('uri-reference');
formats.addNode('iri');
formats.addNode('iri-reference');
formats.addNode('uri-template');
formats.addNode('json-pointer');
formats.addNode('relative-json-pointer');
formats.addNode('regex');

formats.addEdge('email', 'idn-email');
formats.addEdge('hostname', 'idn-hostname');
formats.addEdge('uri', 'uri-reference');
formats.addEdge('uri', 'iri');
formats.addEdge('iri', 'iri-reference');
formats.addEdge('uri-reference', 'iri-reference');
formats.addEdge('iri-reference', 'uri-template');
formats.addEdge('json-pointer', 'relative-json-pointer');

Schemas.mergeFormats = (a, b) => {
  if (!a) {
    return b;
  } else if (!b) {
    return a;
  }
  var result = formats.lowestCommonAncestors(a, b);
  if (result.length == 0) {
    throw new Error('Formats ' + a ' and ' + b + ' are not merge-able');
  }
  return result[0];
}

mergeAllOf(schema, {
  resolvers: {
    $id: // TODO
    $ref: // TODO
    $schema: // TODO
    title: function(values, path, mergeSchemas, options) {
      // choose what title you want to be used based on the conflicting values
      // resolvers MUST return a value other than undefined
    },
    description: // TODO
    format: compacted => compacted.reduce(mergeFormats)
    examples: // TODO
  }
})

/**
 * Loads a schema files for processing into a given target directory
 * @param {*} schemasMap
 * @param {*} schemaPath
 * @param {string} docDir - where documentation will be generated
 * @param {string} schemaDir - where schemas will be generated, if not set, no schema's will be output
 * @param {map} metaElements - a map of additional YAML frontmatter to be added to the generated Asciidoc
 * @param {boolean} readme - generate a README.asciidoc directory listing
 * @param {map} docs - a map of documentation links for headers
 */
Schemas.process = (schemaPathsMap, schemaPath, docDir, schemaDir, metaElements, readme, docs) => {
  smap = schemaPathsMap;
  let keys = Object.keys(schemaPathsMap);
  return Promise.mapSeries(keys, schemaKey => {

    const props = Object.keys(wmap);
    for (var i = 0; i < props.length; i++) {
      delete wmap[props[i]];
    }

    let schema = schemaPathsMap[schemaKey].jsonSchema;
    sPath = schemaPathsMap[schemaKey].path;
    return Schemas.readExternalExamples(schemaPathsMap[schemaKey])
      .then(egsSchema => Schemas.readExternalDescription(schemaPathsMap[schemaKey]))
      .then(allSchema => {
        var schemaClone = _.cloneDeep(allSchema);
        //   return Promise.props({
        //     wSchema:schemaClone,
        //     mSchema:traverseSchema(allSchema,schemaPathsMap[schemaKey].path)
        //   })
        return  processSchema(schemaClone).then(mSchema => {
          mSchema.metaElements = metaElements;
          return { mSchema:mSchema, wSchema:allSchema, dep:wmap };
        });
      }).then(object => {
        const outputTasks = [ asciidocWriter(schemaPathsMap[schemaKey].path, object.mSchema, schemaPath, docDir, object.dep, docs) ];
        if (schemaDir !== '') {
          outputTasks.push(schemaWriter(schemaPathsMap[schemaKey].path, object.wSchema, schemaPath, schemaDir));
        }
        return Promise.all(outputTasks);
      }).catch(err => {
        logger.error('Error occured in processing schema at path %s', sPath);
        logger.error(err); // should we exit here or allow processing of other schemas?
        process.exit(1);
      });
  }).then(result => {
    if (readme) {
      logger.info('Output processed. Trying to make a README.asciidoc now');
      const asciidocs = result.map(r => {
        return r[0];
      });
      return readmeWriter(asciidocs, schemaPathsMap, docDir, schemaPath);
    } else {
      logger.info('Output processed.');
    }
  });
};

module.exports = Schemas;
