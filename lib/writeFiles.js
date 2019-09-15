/**
 * Copyright 2017 Adobe Systems Incorporated. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

const Promise = require('bluebird');
const fs = Promise.promisifyAll(require('fs'));
const path = require('path');
const mkdirp = Promise.promisify(require('mkdirp'));

const writeFile = (outputDir, fileName, data) => {
  if (!fs.existsSync(outputDir)) {
    return mkdirp(outputDir).then(() => {
      return fs.writeFileAsync(path.join(outputDir, fileName), data).then(() => { return path.join(outputDir, fileName); });
    });
  } else {
    return fs.writeFileAsync(path.join(outputDir, fileName), data).then(() => { return path.join(outputDir, fileName); });
  }

};

module.exports = writeFile;
