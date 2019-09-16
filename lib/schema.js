const path = require('path');
const readdirp = require('readdirp');
const _ = require('lodash');
const Promise = require('bluebird');
const fs = Promise.promisifyAll(require('fs'));
const logger = require('winston');
const schemaWalk = require('@cloudflare/json-schema-walker');
const Type = require('./type');
const $RefParser = require('json-schema-ref-parser');
const mergeAllOf = require('json-schema-merge-allof');
const mergeFormats = require('./mergeFormats');
const writeFile = require('./writeFiles');
const ejs = require('ejs');
const pejs = Promise.promisifyAll(ejs);

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

class Schema {
  constructor(path, schemaExtension) {
    this.__getPath__ = () => { return path; };
    this.__getSchemaExtension__ = () => { return schemaExtension; };
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
    }).then(schema => {
      return schema.readExternalExamples();
    }).then(schema => {
      return schema.readExternalDescription();
    });
  }
  get dir() {
    return path.dirname(this.path);
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

  get __basepath__() {
    return path.basename(this.path, this.__getSchemaExtension__());
  }
  readExternalExamples() {
    const exampleFileNames = [];
    const examples = [];
    const filename = this.__basepath__ + '.example.*.json';
    return new Promise((resolve, reject) => { // TOTHINK
      readdirp({ root: this.dir, fileFilter: filename })
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
    const descriptionFileName = this.__basepath__ + '.description.asciidoc';
    return fs.readFileAsync(path.resolve(this.dir, descriptionFileName), 'utf8')
      .then(description => {
        this.schema.description = description.replace(/\r\n/g, '\n').replace(/\n$/g, '');
      })
      .catch(() => {
        // return this;
      });
  };

  /**
   * If schema contains just single `anyOf` with `$ref` then we keep it as is.
   * In the documentation we just place a link and don't copy its content.
   * We move this `anyOf/0/$ref` to `reference` field so that
   * `json-schema-merge-allof` will keep it intact.
   */
  __keepReferences__(schema) {
    if (!!schema.allOf && schema.allOf.length === 1 && !!schema.allOf[0].$ref && [
      'multipleOf',
      'maximum',
      'exclusiveMaximum',
      'minimum',
      'exclusiveMinimum',
      'maxLength',
      'minLength',
      'pattern',
      'additionalItems',
      'items',
      'maxItems',
      'minItems',
      'uniqueItems',
      'contains',
      'maxProperties',
      'minProperties',
      'required',
      'additionalProperties',
      'definitions',
      'properties',
      'patternProperties',
      'dependencies',
      'propertyNames',
      'const',
      'enum',
      'type',
      'format',
      'contentMediaType',
      'contentEncoding',
      'if',
      'then',
      'else',
      'anyOf',
      'oneOf',
      'not',
    ].every(keyword => {
      return schema[keyword] === undefined;
    })) {
      schema.reference = schema.allOf[0].$ref;
      delete schema.allOf;
    }
  }

  /**
   * Finds a simple, one-line description of the property's type
   * @param {object} schema - a JSON Schema property definition
   */
  __simpletype__(schema, name, parentSchema, path) {
    if (!schema['meta:enum']) {
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

  process(resolveOptions) {
    const processedSchema = _.cloneDeep(this.schema);
    schemaWalk.schemaWalk(processedSchema, this.__simpletype__);
    return $RefParser.dereference(processedSchema, { // TOTHINK: cloneDeep may be not needed
      dereference: {
        circular: 'ignore',
        resolve: resolveOptions,
      },
    }).then(processedSchema => {
      mergeAllOf(processedSchema, {
        resolvers: {
          // $id: // TODO
          // $ref: // TODO
          // $schema: // TODO
          // TODO title: function(values, path, mergeSchemas, options) {
          //   choose what title you want to be used based on the conflicting values
          //   resolvers MUST return a value other than undefined
          // },
          // description: // TODO
          format: compacted => compacted.reduce(mergeFormats)
          // TODO examples: // TODO
        }
      });
      return processedSchema;
    }).then(processedSchema => {
      schemaWalk.schemaWalk(processedSchema, this.__simpletype__);
      return processedSchema;
    });
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
  generateAsciidoc(meta /* TODO */, filename, outDir) {
    outDir = outDir ? outDir : path.resolve(path.join('.', 'out'));

    logger.info(filename);
    logger.debug(this.dependencyMap); // TODO

    const multi = [
      [ 'frontmatter.ejs', { meta: meta } ],
      [ 'schema.ejs', {
        paths: [ '' ],
        schema: this.schema,
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
      const asciidocfile = this.__basepath__() + '.asciidoc';
      return writeFile(path.join(outDir, asciidocfile), str);
    }).then(out => {
      logger.debug('asciidoc written (promise)', out);
      return out;
    });
  }
  generateNewSchemaFile(filename, outDir) {
    return writeFile(path.join(outDir, this.path), JSON.stringify(this.schema, null, 4));
  };
}

module.exports = Schema;
