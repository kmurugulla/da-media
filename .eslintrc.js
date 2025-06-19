module.exports = {
  root: true,
  extends: [
    'airbnb-base',
  ],
  env: {
    browser: true,
    es2021: true,
    node: true,
  },
  parserOptions: {
    ecmaVersion: 12,
    sourceType: 'module',
  },
  rules: {
    // Disable problematic rules for this project
    'import/no-unresolved': 'off', // External modules like DA SDK
    'import/extensions': 'off', // Allow .js extensions in imports
    'import/prefer-default-export': 'off', // Allow named exports
    'class-methods-use-this': 'off', // Allow utility methods in classes
    'no-restricted-syntax': 'off', // Allow for...of loops
    'no-continue': 'off', // Allow continue statements
    'no-await-in-loop': 'off', // Allow await in loops when needed
    'no-plusplus': 'off', // Allow ++ operator
    'no-use-before-define': 'off', // Allow function hoisting
    'no-alert': 'off', // Allow alerts for debugging
    'no-new': 'off', // Allow new for side effects
    'prefer-exponentiation-operator': 'off', // Allow Math.pow
    'no-restricted-properties': 'off', // Allow Math.pow
    'no-useless-catch': 'off', // Allow catch-and-rethrow patterns
    'no-unsafe-optional-chaining': 'off', // Allow optional chaining in arithmetic
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }], // Allow unused args with _ (warning)
    'no-shadow': 'off', // Allow variable shadowing
    'arrow-body-style': 'off', // Allow block statements in arrows
    'no-return-await': 'off', // Allow return await
    'padded-blocks': 'off', // Allow padded blocks
    'object-shorthand': 'off', // Allow longhand object properties
    'prefer-destructuring': 'off', // Allow bracket notation
    'quote-props': 'off', // Allow unnecessary quotes
    'dot-notation': 'off', // Allow bracket notation
    'prefer-template': 'off', // Allow string concatenation
    'implicit-arrow-linebreak': 'off', // Allow multiline arrow functions
    'function-paren-newline': 'off', // Allow function paren formatting
    'wrap-iife': 'off', // Allow different IIFE wrapping styles
    'no-underscore-dangle': 'off', // Allow dangling underscores like __dirname
    'no-bitwise': 'off', // Allow bitwise operators for hash functions
    'no-cond-assign': 'off', // Allow assignment in conditions for regex matching
    'default-case': 'off', // Allow switch without default case
    'no-param-reassign': 'off', // Allow parameter reassignment for DOM manipulation
    'consistent-return': 'off', // Allow inconsistent returns in utility functions

    // Keep important formatting rules but make them warnings
    'no-trailing-spaces': 'warn',
    'comma-dangle': ['warn', 'always-multiline'],
    'arrow-parens': ['warn', 'always'],
    'operator-linebreak': ['warn', 'before'],
    'max-len': ['warn', { code: 120 }],
    'no-multiple-empty-lines': ['warn', { max: 2 }],
    'eol-last': 'warn',

    // Keep console as warning instead of error
    'no-console': 'warn',

    // Keep radix as warning
    'radix': 'warn',
  },
};
