'use strict';

// A tiny but realistic serverless handler that pulls in third-party deps.
// After `scc`, all of these are inlined into a single minified dist/index.js.
const _ = require('lodash');
const dayjs = require('dayjs');
const { nanoid } = require('nanoid');

// FaaS handler signature (Alibaba FC / Tencent SCF style).
exports.handler = (event, context, callback) => {
  const payload = _.defaults(typeof event === 'object' && event ? event : {}, {
    msg: 'hello from scc',
  });

  const result = {
    id: nanoid(),
    at: dayjs().format('YYYY-MM-DD HH:mm:ss'),
    msg: payload.msg,
  };

  if (typeof callback === 'function') return callback(null, result);
  return result;
};
