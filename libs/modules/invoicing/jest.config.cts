 
const { readFileSync } = require('fs');

// Reading the SWC compilation config for the spec files
const swcJestConfig = JSON.parse(
  readFileSync(`${__dirname}/.spec.swcrc`, 'utf-8'),
);

// Disable .swcrc look-up by SWC core because we're passing in swcJestConfig ourselves
swcJestConfig.swcrc = false;

module.exports = {
  displayName: 'invoicing',
  preset: '../../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]sx?$': ['@swc/jest', swcJestConfig],
  },
  // @react-pdf/renderer (y su propio árbol de dependencias) es ESM-only -
  // Jest ignora node_modules por default, lo que deja esos imports sin
  // transpilar. Mismo fix que ya usa purchases/quotes.
  transformIgnorePatterns: [],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'html'],
  coverageDirectory: 'test-output/jest/coverage',
};
