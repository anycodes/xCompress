'use strict';

const _ = require('lodash');
const dayjs = require('dayjs');
const { v4: uuidv4 } = require('uuid');

/**
 * Serverless function handler.
 * After xCompress processes this project, the entire node_modules tree is
 * bundled into a single minified file, reducing cold-start time by up to 83%.
 */
exports.handler = async (event, context) => {
  const body = typeof event === 'object' && event ? event : {};

  const result = {
    requestId: uuidv4(),
    timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss'),
    message: _.get(body, 'message', 'Hello from xCompress!'),
    sorted: _.sortBy([3, 1, 4, 1, 5, 9, 2, 6]),
  };

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(result),
  };
};
