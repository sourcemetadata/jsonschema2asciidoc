const _ = require('lodash');
const Promise = require('bluebird');
const fs = Promise.promisifyAll(require('fs'));
const logger = require('winston');
const schemaWalk = require('@cloudflare/json-schema-walker');
const Type = require('./type');

class Schema {
  constructor(path) {
    this.__getPath__ = () => { return path; };
  }
  readFile() {
    return fs.readFileAsync(this.path).then(data => {
      const schema = JSON.parse(data);
      let $idOrPath;
      if (this.schema.$id && this.schema.$id.length > 0) {
        $idOrPath = this.schema.$id;
        // TODO check Missing Specific properties to throw warning // function for warning
      } else {
        logger.warn('schema ' + this.path + ' has no $id');
        $idOrPath = this.path;
      }
      this.__getSchema__ = () => { return schema; };
      this.__get$idOrPath__ = () => { return $idOrPath; };
      return this;
    });
  }
  get path() {
    return this.__getPath__();
  }
  get $idOrPath() {
    return this.__get$idOrPath__();
  }
  get schema() {
    return this.__getSchema__();
  }

  /**
   * Finds a simple, one-line description of the property's type
   * @param {object} schema - a JSON Schema property definition
   */
  __simpletype__(schema, name, parentSchema, path) {
    if (schema['meta:enum'] === undefined) {
      schema['meta:enum'] = {};
    }

    let type = Type.fromSchema(schema);
    const enumValues = [];

    let simpletype = '';

    if (schema.const !== undefined) {
      simpletype = 'const of ';
      enumValues.push(schema.const);
    } else if (schema.enum !== undefined) {
      simpletype = 'enum of ';
      schema.enum.forEach(enumItem => {
        enumValues.push(enumItem);
        if (schema['meta:enum'][enumItem] === undefined) {
          // setting an empty description for each unknown enum
          schema['meta:enum'][enumItem] = '';
        }
      });
    }

    if (enumValues.length > 0) {
      type = Type.and(type, Type.fromObjects(enumValues));
    }

    if (type == null) {
      throw new Error('Cannot determine simple type for schema at ' + this.$idOrPath + '#/' + (path.concat(name).join('/')));
    }

    simpletype += type.toString();
    if (type.isNestedArray()) {
      simpletype += ' (nested array)';
    }

    schema.simpletype = simpletype;
  }

  process() {
    schemaWalk.schemaWalk(this.schema, this.__simpletype__);
  }

  /**
   * Combines the `required` array data structure with the `properties` map data
   * structure, so that each property in `properties` that is required, i.e. listed
   * as a value in the `required` array will have an additional property `isrequired`
   * @param {*} properties
   * @param {*} required
   */
  requiredProperties(properties, required) {
    if (required) {
      for (let i = 0; i < required.length; i++) {
        if (properties[required[i]]) {
          properties[required[i]].isrequired = true;
        }
      }
    }
    return _.mapValues(properties, this.__simpletype__); // TODO
  }
}

module.exports = Schema;
