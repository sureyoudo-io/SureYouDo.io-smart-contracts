module.exports = {
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "airbnb-typescript/base",
    "prettier",
    "plugin:lodash/recommended",
    "plugin:import/errors",
    "plugin:import/warnings",
    "plugin:import/typescript",
    "plugin:prettier/recommended",
  ],
  plugins: [
    "@typescript-eslint",
    "prettier",
    "no-only-tests",
    "lodash",
    "import",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: "./tsconfig.json",
  },
  rules: {
    // Standard ESLint rules
    "func-names": "error",
    "no-alert": "error",
    "require-await": "error",

    // Plugin rules
    "no-only-tests/no-only-tests": "error",
    "prettier/prettier": "error",
    "lodash/prefer-lodash-method": "off",
    "lodash/prefer-constant": "off",
    "lodash/prefer-lodash-typecheck": "off",
    "lodash/prefer-get": "off",
    "lodash/prefer-includes": "off",
    "import/order": [
      "error",
      {
        groups: [
          "builtin",
          "external",
          "internal",
          "parent",
          "sibling",
          "index",
          "object",
          "type",
        ],
        alphabetize: {
          order: "asc",
          caseInsensitive: true,
        },
      },
    ],
    "@typescript-eslint/no-shadow": ["error"],
    "@typescript-eslint/no-use-before-define": [
      "warn",
      {
        functions: false,
        classes: false,
        variables: false,
        typedefs: false,
      },
    ],
    "@typescript-eslint/no-unused-vars": "error",
    "@typescript-eslint/explicit-module-boundary-types": "error",
    "@typescript-eslint/no-non-null-assertion": "error",
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/array-type": [
      "error",
      {
        default: "array",
      },
    ],
    "@typescript-eslint/consistent-type-definitions": ["error", "type"],
  },
  overrides: [
    {
      files: ["*.ts"],
      rules: {
        "no-unused-expressions": [
          2,
          {
            allowTernary: true,
          },
        ],
      },
    },
  ],
};
