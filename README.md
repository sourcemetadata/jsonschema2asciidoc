# JSON Schema Asciidoc Tools

[![CircleCI](https://circleci.com/gh/sourcemetadata/jsonschema2asciidoc.svg?style=svg)](https://circleci.com/gh/sourcemetadata/jsonschema2asciidoc) [![Greenkeeper badge](https://badges.greenkeeper.io/sourcemetadata/jsonschema2asciidoc.svg)](https://greenkeeper.io/)

Documenting and validating complex JSON Schemas can be hard. This tool makes it easier by providing a number of scripts that can turn JSON Schema files into readable Asciidoc documentation that is ready for consumption on GitHub or processed using Jekyll or other static site generators.

These tools have been introduced by Adobe to document Adobe's Experience Data Models (XDM), but can be used for other JSON Schema documents, too.

## Requirements

- `npm` version 3.10.8 or up
- `node` v8 or up

## Example Output

Using the schemas in [`examples/schemas`](examples/schemas), the output in [`examples/docs`](examples/docs) has been generated.

## Installing and running

```bash
# clone this project
$ npm install -g @sourcemetadata/jsonschema2asciidoc

# show usage information
$ jsonschema2asciidoc

# run task
# leave out the -v "06", when you have draft-07 schemas
$ jsonschema2asciidoc -d examples/schemas -o examples/docs -v "06"
# generated output for whole folder is written to ./examples/docs
```

## JSON Schema Draft Versions

`jsonschema2asciidoc` assumes `draft-07` by default. If your schemas are not on `draft-07`, you can specify the draft version using the `-v` or `--draft` flag.

```bash
# run against JSON Schema Draft 04
$ jsonschema2asciidoc -d examples/schemas -o examples/docs -v 04
```

```bash
# run against JSON Schema Draft 06
$ jsonschema2asciidoc -d examples/schemas -o examples/docs -v 06
```

## Using JSON Schema Asciidoc Tools from `npm`

You can conveniently use the JSON Schema Asciidoc Tools from `npm`. This makes it possible to set up a conversion toolchain for your JSON Schema project that is driven entirely by `npm`. To do so, first define the dependency by adding this to your `"devDependencies"` section of `package.json`

```json
  "devDependencies": {
    "@sourcemetadata/jsonschema2asciidoc": "^1.0.6"
  }
```

Then add the following to the `"scripts"` section of your `package.json` and adapt accordingly:

```json
"scripts": {
  "prepare": "mkdir -p docs/reference && jsonschema2asciidoc -o docs/reference -d schemas/draft-04
}
```

If you run `npm install` before running `npm run prepare`, `npm` will install the `@sourcemetadata/jsonschema2asciidoc` in a `node_modules/.bin` path, even if you did not install the JSON Schema Asciidoc beforehand.

## Tests

Ensure you have all the dependencies installed via `npm install`, then run:

```bash
npm test
```

This will run our Jasmine test suite as well as lint the JavaScript according to our style guide (see below).

### CI

Continuous integration runs on [CircleCI](https://circleci.com/gh/sourcemetadata/jsonschema2asciidoc). 
All pull requests automatically trigger a job that runs the [tests](#tests) by executing the [`config.yml`](.circleci/config.yml). 

### Code Coverage

You can run `npm run cover` to get a code coverage report, that is, a sense of how much of the project's code is "covered" by the test suite.

## Style Guide / Linting

This project uses [eslint](https://eslint.org) to enforce JavaScript coding style. To run the linter:

```bash
npm run lint
```

## TODOs

* JSON Schema validation:
  * property naming convention
  * vocabulary spellchecking

## Contributing

Please see [Contributing.md](Contributing.md) for details. Pull requests are welcome.

## License/Copyright

Copyright 2017 Adobe Systems Incorporated. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0
