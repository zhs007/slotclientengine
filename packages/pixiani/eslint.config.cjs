const tsParser = require("@typescript-eslint/parser");

module.exports = [
  {
    files: ["**/*.{ts,js}"] ,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parser: tsParser
    },
    rules: {}
  }
];
