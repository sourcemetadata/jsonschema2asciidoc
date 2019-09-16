class AjvResolver {
  constructor(ajv) {
    this.__getAjv__ = () => { return ajv; };
  }
  get order() {
    return 1;
  }
  canRead(file) {
    return !!this.__getAjv__().getSchema(file.url);
  }
  read(file) {
    return this.__getAjv__().getSchema(file.url);
  }
}

module.exports = AjvResolver;
