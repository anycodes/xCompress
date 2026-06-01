const _ = require("lodash");
const dayjs = require("dayjs");
const { nanoid } = require("nanoid");

exports.handler = async (event, context) => {
  return {
    statusCode: 200,
    body: JSON.stringify({
      id: nanoid(),
      time: dayjs().format("YYYY-MM-DD HH:mm:ss"),
      sorted: _.sortBy([9, 3, 7, 1, 5]),
    }),
  };
};
