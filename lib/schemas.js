/**
 * Copyright 2017 Adobe Systems Incorporated. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

const path = require('path');
const _ = require('lodash');
const logger = require('winston');
const Promise = require('bluebird');
const asciidocWriter = require('./asciidocWriter');
const schemaWriter = require('./schemaWriter');
const readmeWriter = require('./readmeWriter');
const absUrlRegex = new RegExp('^(?:[a-z]+:)?//', 'i');
const pointer = require('json-pointer');
const AjvResolver = require('./ajvResolver');
const Schema = require('./schema');
var smap; // TODO remove global
var sPath;
var wmap = {};
function get$refType(refValue) {
  let startpart = '', endpart = '', refType = '';
  const arr = refValue.split('#');
  if (arr.length > 1) {
    endpart = arr[1];
  }

  startpart = arr[0];
  // TODO yRelNoDef
  // relative-- yRelWithDef, yRelNoDef,
  // absolute-- yAbsWithDef, yAbsFSchema, yAbsWithFragment
  const deff = '/definitions/';

  // if (absUrlRegex.test(refVal)) {
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
  // }
  return { startpart, endpart, refType };
}

function normaliseLinks(obj, refArr) {
  const basepath = refArr.startpart;
  let $linkVal = '', $linkPath = '';
  if (basepath in smap) {
    const newpath = path.relative(path.dirname(sPath), smap[basepath].filePath).replace(/\\/g, '/'); // to cater windows paths
    const temp = newpath.slice(0, -5).split('/');
    $linkVal = obj.title ? obj.title : path.basename(newpath).slice(0, -5);
    $linkPath = temp.join('/') + '.asciidoc';
    return { $linkVal, $linkPath };
  }
}
const resolve$ref = Promise.method((val, base$id) => {
  let obj, link;
  if (!(base$id in wmap)) {
    wmap[base$id] = {};
  }
  const refArr = get$refType(val.$ref);
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
      const ischema = _.cloneDeep(pointer.get(obj, refArr.endpart));
      _.forOwn(val, (v, k) => {
        if (k !== '$ref') {
          ischema[k] = v;
        }
      });
      return processISchema(ischema, refArr.startpart);
    }
  }
});

const processFurther = Promise.method((val, key, $id) => {
  const base$id = $id;
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
    // const $definitions = []
    schema.type = schema.anyOf ? 'anyOf' : 'oneOf';
    const arr = schema.anyOf ? schema.anyOf : schema.oneOf;
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
    // schema["$definitions"] = $definitions;
    return schema;
  }

  if (schema.items) {
    const val = schema.items;
    if (!schema.type) {
      schema.type = 'array';
    }
    if (_.isArray(val)) {
      //TODO
    } else {
      if (val.$ref) {
        resolve$ref(val, base$id).then(piSchema => { // check // not sending correct id
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
    const $id = schema.$id || schema.id;
    const base$id = $id;
    if (!(base$id in wmap)) {
      wmap[base$id] = {};
    }
    if (schema.allOf) {
      _.each(schema.allOf, value => {
        if (value.$ref) {
          let obj, link;
          const refArr = get$refType(value.$ref);
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
              const ischema = _.cloneDeep(pointer.get(obj, refArr.endpart));
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
                          if (key in ischema.required) { schema.required.push(key); }
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

      // TODO check if something missing left here
      resolve(schema);
    }

  });

  // generic $ref resolve present in top properties
}

class Schemas {
  constructor(ajv) {
    this._ajv = ajv;
  }
  // Reads schema files and modifies a schema paths map object based on the schema file.
  // Returns the schema path map object.
  /**
   * Reads the schema file specified at `path` and accumulates a
   * `Map` of schema $ids (or paths, if a schema has no $id) and Schema objects in `schemas`.
   * Typically, this function is used in a `reduce` pattern.
   * @param {Map} schemas - the map of schema $ids/paths and Schema instances
   * @param {String} path - the full path to the schema
   */
  readSchemaFiles(schemas, path) {
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
}

Schemas.resolveRef = (key, obj, currpath) => {
  if (key === '$ref') {
    const refVal = obj[key];
    let temp;
    const deff = '#/definitions/';
    if (absUrlRegex.test(refVal)) {
      const parsedUrl = refVal.split('#');
      const basepath = parsedUrl[0];
      if (basepath in this._schemaPathMap) {
        const newpath = path.relative(path.dirname(currpath), this._schemaPathMap[basepath].filePath).replace(/\\/g, '/'); // to cater windows paths
        obj.$ref = newpath;
        temp = newpath.slice(0, -5).split('/');
        obj.$linkVal = path.basename(newpath).slice(0, -5);
        obj.$linkPath = temp.join('/') + '.asciidoc';
        // TODO display with title or file path name title
      } else {
        obj.$linkPath = refVal;
        temp = refVal.split('/');
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
  }
  if (key === 'anyOf' || key === 'oneOf' || key === 'allOf') { obj.$type = key; }

  return;
};

/* The following function does not seem to be used anymore!
const traverseSchema = (object,schemaFilePath) => {
  return new Promise((resolve,reject) => {
    const recurse = (curr,key,prev) => {
      if (key) {
        if (key === 'anyOf' || key === 'oneOf' || key === 'allOf') {
          prev.$type=key;
        }
      }
      if (Array.isArray(curr)) {
        curr.map((item, index) => recurse(item, index, curr));
      } else {
        (typeof curr === 'object') ? Object.keys(curr).map(key => recurse(curr[key], key, curr)) : Schema.resolveRef(key, prev, schemaFilePath);
      }
      return object;
    };
    resolve(recurse(object));
  });
};
*/

Schemas.setAjv = ajv => {
  this._ajv = ajv;
};

/**
 * Loads a schema file for processing into a given target directory
 * @param {*} schemas - the map of schema $ids/paths and Schema instances
 * @param {*} schemaPath
 * @param {string} docDir - where documentation will be generated
 * @param {string} schemaDir - where schemas will be generated, if not set, no schema's will be output
 * @param {map} meta - a map of additional YAML frontmatter to be added to the generated Asciidoc
 * @param {boolean} readme - generate a README.asciidoc directory listing
 * @param {string} schemaExtension - JSON Schema file extension eg. schema.json or json
 */
Schemas.process = (schemas, schemaPath, docDir, schemaDir, meta, readme, schemaExtension) => {
  const ajvResolver = new AjvResolver(this.ajv);
  const resolvers = {
    ajv: ajvResolver,
    file: null,
    http: null,
  };

  smap = schemas;
  const keys = Object.keys(schemas);
  return Promise.mapSeries(keys, schemaKey => {

    const props = Object.keys(wmap);
    for (let i = 0; i < props.length; i++) {
      delete wmap[props[i]];
    }

    const schema = schemas[schemaKey].jsonSchema;
    sPath = schemas[schemaKey].filePath;
    return Schemas.readExternalExamples(schemas[schemaKey].filePath, schema)
      .then(egsSchema => Schemas.readExternalDescription(schemas[schemaKey].filePath, egsSchema))
      .then(allSchema => {
        const schemaClone = _.cloneDeep(schemas[schemaKey].jsonSchema);
        // return Promise.props({
        //   wSchema: schemaClone,
        //   mSchema: traverseSchema(allSchema, schemaMap[schemaKey].filePath)
        // });
        return  processSchema(schemaClone).then(mSchema => {
          mSchema.meta = meta;
          return { mSchema: mSchema, wSchema: allSchema, dep: wmap };
        });
      }).then(object => {
        const outputTasks = [ asciidocWriter(schemas[schemaKey].filePath, object.mSchema, schemaPath, docDir, object.dep) ];
        if (schemaDir !== '') {
          outputTasks.push(schemaWriter(schemas[schemaKey].filePath, object.wSchema, schemaPath, schemaDir));
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
      return readmeWriter(asciidocs, schemas, docDir, schemaPath);
    } else {
      logger.info('Output processed.');
    }
  });
};

module.exports = Schemas;
