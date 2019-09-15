const _ = require('lodash');
class Type {
  static fromSchema(schema) {
    const type = schema.type;
    if (type === undefined) {
      return AnyType.instance;
    } else if (type.isArray()) {
      return new MultipleType(type.map(type => {
        return Type.fromSchema(type);
      }));
    } else if (type === 'array') {
      return new ArrayType(Type.fromSchema(schema.items));
    } else {
      return new SimpleType(type);
    }
  }
  static fromObject(object) {
    // undefined will throw error
    if (object === null) {
      return Type.null;
    } else if (typeof object == 'boolean' || object instanceof Boolean) {
      return SimpleType.boolean;
    } else if (typeof object == 'string' || object instanceof String) {
      return SimpleType.string;
    } else if (typeof object == 'number' || object instanceof Number) {
      return object.isInteger() ? SimpleType.integer : SimpleType.number;
    } else if (object.isArray()) {
      if (object instanceof Int8Array
        || object instanceof Uint8Array
        || object instanceof Uint8ClampedArray
        || object instanceof Int16Array
        || object instanceof Uint16Array
        || object instanceof Int32Array
        || object instanceof Uint32Array
        // TODO: not supported by eslint
        // || object instanceof BigInt64Array
        // || object instanceof BigUint64Array
      ) {
        return new ArrayType(SimpleType.integer);
      } else if (object instanceof Float32Array
        || object instanceof Float64Array
      ) {
        return new ArrayType(SimpleType.number);
      } else {
        return new ArrayType(new MultipleType(object.map(item => {
          this.fromObject(item);
        })));
      }
    } else {
      return SimpleType.object;
    }
  }
  static fromObjects(objects) {
    return new MultipleType(objects.map(object => {
      Type.fromObject(object);
    }));
  }
  and(other) {
    if (_.isEqual(this, other)) {
      return this;
    } else if (
      other instanceof NullableType ||
      other instanceof MultipleType ||
      other instanceof ArrayType ||
      other instanceof AnyType
    ) {
      return other.and(this);
    }
    return null;
  }
  isNestedArray() {
    return false;
  }
}

class SimpleType extends Type {
  constructor(typeName) {
    const instance = SimpleType[typeName];
    if (!!instance) {
      return instance;
    }
    Object.defineProperty(SimpleType, typeName, this);
    this.typeName = typeName;
    Object.freeze(this);
  }
  toString() {
    return this.typeName;
  }
  and(other) {
    if (_.isEqual(this, other)) {
      return this;
    } else if (this.typeName === 'integer' && other.typeName === 'number' || // TODO
      this.typeName === 'number' && other.typeName === 'integer'
    ) {
      return SimpleType.integer;
    }
  }
}

class NullableType extends Type {
  constructor(baseType) {
    this.baseType = baseType;
    Object.freeze(this);
  }
  toString() {
    return this.baseType.toString() + '?';
  }
  static and(other) {
    if (_.isEqual(this, other)) {
      return this;
    } if (other instanceof NullableType) {
      return new NullableType(this.baseType.and(other.baseType));
    } else {
      return this.baseType.and(other);
    }
  }
}

class MultipleType extends Type {
  constructor(baseTypes) {
    const flatBaseTypes = [ ...baseTypes ].map(baseType => {
      return baseType instanceof MultipleType ? baseType.baseTypes : baseType;
    }).flat();
    if (flatBaseTypes.length === 0) {
      return null;
    } else if (flatBaseTypes.length === 1) {
      return flatBaseTypes[0];
    }
    if (flatBaseTypes.indexOf(AnyType.instance) > -1) {
      return AnyType.instance;
    }
    if (flatBaseTypes.indexOf(SimpleType.null) > -1) {
      if (_.each([ ...AnyType.allTypes ], type => {
        return flatBaseTypes.indexOf(type) > -1;
      })) {
        return AnyType.instance;
      } else {
        return new NullableType(new MultipleType(flatBaseTypes.filter(baseType => {
          return baseType !== SimpleType.null;
        })));
      }
    }
    let foundNumber = false;
    let indexOfInteger = -1;
    const newFlatBaseTypes = [];
    flatBaseTypes.forEach(newBaseType => {
      if (newBaseType === SimpleType.number) {
        if (!foundNumber) {
          foundNumber = true;
          if (indexOfInteger > -1) {
            newFlatBaseTypes[indexOfInteger] = newBaseType;
          }
        } else {
          return;
        }
      } else if (newBaseType === SimpleType.integer) {
        if (indexOfInteger = -1) {
          if (foundNumber) {
            return;
          }
          indexOfInteger = newFlatBaseTypes.length;
        } else {
          return;
        }
      }
      if (!newFlatBaseTypes.some(baseType => {
        return _.isEqual(baseType, newBaseType);
      })) {
        newFlatBaseTypes.push(newBaseType);
      }
    });
    Object.freeze(newFlatBaseTypes);
    this.baseTypes = newFlatBaseTypes;
    Object.freeze(this);
  }
  toString() {
    return 'multiple';
  }
  and(other) {
    if (_.isEqual(this, other)) {
      return this;
    } else if (other instanceof MultipleType) {
      return new MultipleType(
        [ ...this.baseTypes ].map(baseType => {
          return [ ...other.baseTypes ].map(otherBaseType => {
            return baseType.and(otherBaseType);
          }).filter(_.identity);
        }).flat()
      );
    } else {
      const newTypes = this.baseTypes.map(baseType => {
        return baseType.and(other);
      }).filter(_.identity);
      // TODO: assert that newTypes.length <= 1
      if (newTypes.length === 0) {
        return null;
      } else {
        return newTypes[0];
      }
    }
  }
}

class ArrayType extends Type {
  constructor(itemType) {
    if (itemType === AnyType.instance) {
      const instance = Type.anyArray;
      if (!!instance) {
        return instance;
      }
      Type.anyArray = this;
    }
    this.itemType = itemType;
    Object.freeze(this);
  }
  toString() {
    return this.itemType instanceof MultipleType ?
      'array' :
      (
        this.itemType.toString() + '[]' /* TODO + (
          this.itemType instanceof ArrayType ?
          ' (nested array)' :
          ''
        )*/
      );
  }
  and(other) {
    if (_.isEqual(this, other)) {
      return this;
    } else if (other instanceof ArrayType) {
      return new ArrayType(this.itemType.and(other.itemType));
    } else {
      return super.and(other);
    }
  }
  isNestedArray() {
    return this.itemType instanceof ArrayType;
  }
}

class AnyType extends Type {
  constructor() {
    const instance = AnyType.instance;
    if (!!instance) {
      return instance;
    }
    AnyType.instance = this;
    Object.freeze(this);
  }
  toString() {
    return 'any';
  }
  and(other) {
    if (this === other) {
      return this;
    } else {
      return new NullableType(new MultipleType(
        AnyType.allTypes
      )).and(other);
    }
  }
}

[
  'null',
  'boolean',
  'object',
  'number',
  'string',
  'integer',
].forEach(type => {
  new SimpleType(type);
});
AnyType.allTypes = new Set([
  SimpleType.boolean,
  SimpleType.object,
  Type.anyArray,
  SimpleType.number,
  SimpleType.string,
]);
new AnyType();
new ArrayType(AnyType.instance);

Object.freeze(SimpleType);
Object.freeze(NullableType);
Object.freeze(MultipleType);
Object.freeze(ArrayType);
Object.freeze(AnyType);
Object.freeze(Type);

module.exports = Type;
