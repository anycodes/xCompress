const bcrypt = require("bcrypt");

exports.handler = async (event) => {
  const password = (event && event.password) || "demo-password";
  const hash = await bcrypt.hash(password, 10);
  const valid = await bcrypt.compare(password, hash);

  return {
    statusCode: 200,
    body: JSON.stringify({ hash, valid }),
  };
};
