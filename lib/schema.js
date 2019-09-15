const path = require('path');
const readdirp = require('readdirp');
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

  readExternalExamples() {
    const exampleFileNames = [];
    const examples = [];
    const dirname = path.dirname(this.path);
    let filename = path.basename(this.path, path.extname(this.path));
    // TODO: Invalid handling of . in file name
    filename = filename.split('.')[0] + '.example.*.json';
    return new Promise((resolve, reject) => { // TOTHINK
      readdirp({ root: dirname, fileFilter: filename })
        .on('data', entry => exampleFileNames.push(entry.fullPath))
        .on('end', () => resolve(exampleFileNames))
        .on('error', err => reject(err));
    }).then(exampleFileNames => {
      if (exampleFileNames.length > 0) {
        var validate = this._ajv.compile(this.jsonSchema);
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
          if (!this.schema.examples) {
            this.schema.examples = [];
          }
          examples.sort((a, b) => {
            return a.filename > b.filename ? 1 : -1;
          }).forEach(element => { // TOTHINK
            this.schema.examples.push(element);
          });
        });
      }
    });
  };

  readExternalDescription() {
    let descriptionFileName = path.basename(this.path, path.extname(this.path));
    // TODO: Invalid handling of . in file name
    descriptionFileName = descriptionFileName.split('.')[0] + '.description.asciidoc';
    return fs.readFileAsync(path.resolve(path.dirname(this.path), descriptionFileName), 'utf8')
      .then(description => {
        this.schema.description = description.replace(/\r\n/g, '\n').replace(/\n$/g, '');
      })
      .catch(() => {
        // return this;
      });
  };

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
        // TODO: move to separate function
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
    this.readExternalExamples();
    this.readExternalDescription();
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
